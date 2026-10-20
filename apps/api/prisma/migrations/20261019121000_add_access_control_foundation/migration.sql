CREATE TYPE "event_access_mode" AS ENUM ('NOMINAL', 'ANONYMOUS');
ALTER TABLE "event" ADD COLUMN "access_mode" "event_access_mode";

-- No deleted_at predicate: revoked/soft-deleted material still freezes identity.
-- DT03/DT05 must extend this predicate when they introduce new credential history.
CREATE FUNCTION event_has_access_material(target_event_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM "contact" WHERE "event_id" = target_event_id)
    OR EXISTS (SELECT 1 FROM "invitation" WHERE "event_id" = target_event_id)
    OR EXISTS (SELECT 1 FROM "assistant" WHERE "event_id" = target_event_id)
    OR EXISTS (SELECT 1 FROM "physical_pass" WHERE "event_id" = target_event_id)
    OR EXISTS (SELECT 1 FROM "physical_pass_generation_operation" WHERE "event_id" = target_event_id);
$$;

-- Raw material INSERTs take the same parent lock as Provider edits. This closes
-- the race between first issuance/history and a concurrent service/mode change.
CREATE FUNCTION lock_event_access_material()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM "event" WHERE "id" = NEW."event_id" FOR UPDATE;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "contact_access_material_lock" BEFORE INSERT ON "contact"
FOR EACH ROW EXECUTE FUNCTION lock_event_access_material();
CREATE TRIGGER "invitation_access_material_lock" BEFORE INSERT ON "invitation"
FOR EACH ROW EXECUTE FUNCTION lock_event_access_material();
CREATE TRIGGER "assistant_access_material_lock" BEFORE INSERT ON "assistant"
FOR EACH ROW EXECUTE FUNCTION lock_event_access_material();
CREATE TRIGGER "physical_pass_generation_access_material_lock" BEFORE INSERT ON "physical_pass_generation_operation"
FOR EACH ROW EXECUTE FUNCTION lock_event_access_material();

CREATE FUNCTION validate_event_access_configuration()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  configured_code "service_code";
  target_client "client"%ROWTYPE;
BEGIN
  -- SHARE serializes against Service.code and Client profile/type mutations.
  SELECT "code" INTO configured_code FROM "service" WHERE "id" = NEW."service_id" FOR SHARE;
  IF (configured_code IS NOT DISTINCT FROM 'ACCESS_CONTROL'::"service_code")
    IS DISTINCT FROM (NEW."access_mode" IS NOT NULL) THEN
    RAISE EXCEPTION 'EVENT_ACCESS_MODE_SERVICE_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND (OLD."access_mode" IS NOT NULL OR NEW."access_mode" IS NOT NULL)
    AND (NEW."access_mode" IS DISTINCT FROM OLD."access_mode"
      OR NEW."service_id" IS DISTINCT FROM OLD."service_id"
      OR NEW."client_id" IS DISTINCT FROM OLD."client_id") THEN
    IF OLD."activated_at" IS NOT NULL OR OLD."status" NOT IN ('draft', 'configured', 'ready_to_activate')
      OR event_has_access_material(OLD."id") THEN
      RAISE EXCEPTION 'EVENT_ACCESS_CONFIGURATION_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF configured_code = 'ACCESS_CONTROL'::"service_code" THEN
    SELECT * INTO target_client FROM "client" WHERE "id" = NEW."client_id" FOR SHARE;
    IF NOT FOUND OR target_client."deleted_at" IS NOT NULL
      OR target_client."type" <> 'ORGANIZATION' OR target_client."operating_profile" <> 'MANAGED' THEN
      RAISE EXCEPTION 'EVENT_ACCESS_CONTROL_NOT_ALLOWED' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'INSERT' AND target_client."status" <> 'ACTIVE' THEN
      RAISE EXCEPTION 'CLIENT_NOT_ACTIVE' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'INSERT' OR OLD."access_mode" IS NULL
      OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
      OR NEW."client_id" IS DISTINCT FROM OLD."client_id" THEN
      PERFORM 1 FROM "app_user" WHERE "id" = NEW."created_by_user_id"
        AND "role" = 'PLATFORM_ADMIN' AND "client_id" IS NULL AND "deleted_at" IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Access control creator must be an active Platform Admin.' USING ERRCODE = '23514';
      END IF;
    END IF;
    PERFORM 1 FROM "app_user" WHERE "id" = NEW."assigned_planner_user_id"
      AND "client_id" = NEW."client_id" AND "role" = 'ORGANIZATION_PLANNER' AND "deleted_at" IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'EVENT_PLANNER_ASSIGNMENT_INVALID' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "event_access_configuration_trigger"
BEFORE INSERT OR UPDATE OF "service_id", "access_mode", "client_id", "created_by_user_id", "assigned_planner_user_id", "activated_at"
ON "event" FOR EACH ROW EXECUTE FUNCTION validate_event_access_configuration();

-- Service codes are catalog identities, never an alternative way to change an Event mode.
CREATE FUNCTION protect_service_code_identity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."code" IS DISTINCT FROM OLD."code" THEN
    RAISE EXCEPTION 'Service code is immutable.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "service_code_identity_trigger" BEFORE UPDATE OF "code" ON "service"
FOR EACH ROW EXECUTE FUNCTION protect_service_code_identity();

CREATE FUNCTION protect_client_access_control_profile()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."type" IS DISTINCT FROM OLD."type" OR NEW."operating_profile" IS DISTINCT FROM OLD."operating_profile")
    AND EXISTS (SELECT 1 FROM "event" WHERE "client_id" = OLD."id" AND "access_mode" IS NOT NULL) THEN
    RAISE EXCEPTION 'Access control requires a Managed Organization.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "client_access_control_profile_trigger" BEFORE UPDATE OF "type", "operating_profile" ON "client"
FOR EACH ROW EXECUTE FUNCTION protect_client_access_control_profile();

CREATE OR REPLACE FUNCTION validate_event_activation_snapshot_references()
RETURNS TRIGGER AS $$
DECLARE
  event_client_type "client_type";
  event_operating_profile "client_operating_profile";
  event_commercial_channel "commercial_channel";
  price_service_id UUID;
  price_client_type "client_type";
  price_commercial_channel "commercial_channel";
  price_pricing_version INTEGER;
  price_capacity_min INTEGER;
  price_capacity_max INTEGER;
  receipt_client_id UUID;
  receipt_operation_type VARCHAR(80);
  receipt_operation_reference VARCHAR(128);
  receipt_idempotency_key VARCHAR(128);
  actor_client_id UUID;
  actor_role "user_role";
  actor_deleted_at TIMESTAMPTZ(6);
BEGIN
  IF NEW."activated_at" IS NULL THEN RETURN NEW; END IF;

  SELECT "type", "operating_profile", COALESCE("commercial_channel", 'STANDARD'::"commercial_channel")
    INTO event_client_type, event_operating_profile, event_commercial_channel
    FROM "client" WHERE "id" = NEW."client_id";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event activation requires a valid Client.'
      USING ERRCODE = '23514';
  END IF;

  IF event_operating_profile = 'MANAGED'::"client_operating_profile" THEN
    IF event_client_type IS DISTINCT FROM 'PLANNER'::"client_type" THEN
      IF event_client_type IS DISTINCT FROM 'ORGANIZATION'::"client_type"
        OR NEW."access_mode" IS NULL
        OR NOT EXISTS (SELECT 1 FROM "service" WHERE "id" = NEW."service_id" AND "code" = 'ACCESS_CONTROL')
        OR NOT EXISTS (SELECT 1 FROM "app_user" WHERE "id" = NEW."assigned_planner_user_id"
          AND "client_id" = NEW."client_id" AND "role" = 'ORGANIZATION_PLANNER' AND "deleted_at" IS NULL)
      THEN
        RAISE EXCEPTION 'Managed Organization activation requires Access Control and an assigned Planner.'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    PERFORM 1
      FROM "service"
      WHERE "id" = NEW."activated_service_id"
        AND "id" = NEW."service_id"
        AND "is_active" = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Managed activation Service must match the active configured Service.'
        USING ERRCODE = '23514';
    END IF;

    IF NEW."activated_service_price_id" IS NOT NULL
      OR NEW."base_cost_credits" IS NOT NULL
      OR NEW."promotion_discount_credits" IS NOT NULL
      OR NEW."final_cost_credits" IS NOT NULL
      OR NEW."purchased_credits_used" IS NOT NULL
      OR NEW."credit_line_credits_used" IS NOT NULL
      OR NEW."credit_unit_value_mxn_cents_snapshot" IS NOT NULL
      OR NEW."activation_receipt_id" IS NOT NULL
    THEN
      RAISE EXCEPTION 'Managed activation cannot contain financial snapshots or a Receipt.'
        USING ERRCODE = '23514';
    END IF;

    SELECT "client_id", "role", "deleted_at"
      INTO actor_client_id, actor_role, actor_deleted_at
      FROM "app_user" WHERE "id" = NEW."activated_by_user_id";

    IF NOT FOUND OR actor_client_id IS NOT NULL OR actor_deleted_at IS NOT NULL
      OR actor_role IS DISTINCT FROM 'PLATFORM_ADMIN'::"user_role"
    THEN
      RAISE EXCEPTION 'Managed activation actor must be an active Platform Admin.'
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  SELECT "service_id", "client_type", "commercial_channel", "pricing_version", "capacity_min", "capacity_max"
    INTO price_service_id, price_client_type, price_commercial_channel, price_pricing_version,
      price_capacity_min, price_capacity_max
    FROM "service_price" WHERE "id" = NEW."activated_service_price_id";

  IF NOT FOUND OR price_service_id IS DISTINCT FROM NEW."activated_service_id"
    OR (price_pricing_version = 1 AND price_client_type IS DISTINCT FROM event_client_type)
    OR (price_pricing_version = 2 AND price_commercial_channel IS DISTINCT FROM event_commercial_channel)
    OR (price_pricing_version = 2 AND price_commercial_channel IN ('STANDARD', 'PARTNER')
      AND (NEW."capacity" IS NULL OR NEW."capacity" < price_capacity_min OR NEW."capacity" > price_capacity_max))
  THEN
    RAISE EXCEPTION 'Event activation price must match the activated Service and Client commercial context.'
      USING ERRCODE = '23514';
  END IF;

  SELECT "client_id", "operation_type", "operation_reference", "idempotency_key"
    INTO receipt_client_id, receipt_operation_type, receipt_operation_reference, receipt_idempotency_key
    FROM "receipt" WHERE "id" = NEW."activation_receipt_id";

  IF NOT FOUND OR receipt_client_id IS DISTINCT FROM NEW."client_id"
    OR receipt_operation_type IS DISTINCT FROM 'EVENT_ACTIVATION'
    OR receipt_operation_reference IS DISTINCT FROM NEW."id"::TEXT
    OR receipt_idempotency_key IS DISTINCT FROM NEW."activation_idempotency_key"
  THEN
    RAISE EXCEPTION 'Event activation Receipt must match the Event, Client, operation and idempotency key.'
      USING ERRCODE = '23514';
  END IF;

  SELECT "client_id", "role", "deleted_at"
    INTO actor_client_id, actor_role, actor_deleted_at
    FROM "app_user" WHERE "id" = NEW."activated_by_user_id";

  IF NOT FOUND OR actor_client_id IS DISTINCT FROM NEW."client_id" OR actor_deleted_at IS NOT NULL
    OR actor_role NOT IN ('INDEPENDENT_PLANNER', 'ORGANIZATION_ADMIN', 'ORGANIZATION_PLANNER')
    OR (actor_role = 'ORGANIZATION_PLANNER'
      AND NEW."activated_by_user_id" IS DISTINCT FROM NEW."assigned_planner_user_id")
  THEN
    RAISE EXCEPTION 'Event activation actor is not authorized for this Event and Client.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
