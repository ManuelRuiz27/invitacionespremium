BEGIN;
ALTER TABLE physical_pass
  ADD COLUMN revoked_at TIMESTAMPTZ(6),
  ADD COLUMN revoked_by_user_id UUID REFERENCES app_user(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN revocation_reason_code VARCHAR(64),
  ADD COLUMN revoke_idempotency_key VARCHAR(128),
  ADD COLUMN revoke_request_signature CHAR(64),
  ADD COLUMN revoke_result_snapshot JSONB,
  ADD CONSTRAINT physical_pass_revocation_complete CHECK (
    (revoked_at IS NULL AND revoked_by_user_id IS NULL AND revocation_reason_code IS NULL
      AND revoke_idempotency_key IS NULL AND revoke_request_signature IS NULL AND revoke_result_snapshot IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL AND revocation_reason_code IS NOT NULL
      AND revoke_idempotency_key IS NOT NULL AND revoke_request_signature IS NOT NULL AND revoke_result_snapshot IS NOT NULL
      AND used_at IS NULL AND deleted_at IS NULL AND revoked_at >= created_at
      AND revocation_reason_code ~ '^[A-Z][A-Z0-9_]{0,63}$'
      AND length(btrim(revoke_idempotency_key)) BETWEEN 8 AND 128
      AND revoke_request_signature ~ '^[0-9a-f]{64}$' AND jsonb_typeof(revoke_result_snapshot) = 'object'));
CREATE UNIQUE INDEX physical_pass_revoke_idempotency_key_key ON physical_pass(revoke_idempotency_key);
CREATE INDEX physical_pass_revoked_by_user_id_idx ON physical_pass(revoked_by_user_id);

-- Additive extension of the final validators (20260729233000 and 20260729220000).
-- API order: Event -> Staff (use only) -> Pass -> Floorplan/Table.
-- Direct SQL taking child row locks first can be aborted by PostgreSQL; never skip validation.
CREATE OR REPLACE FUNCTION "validate_physical_pass"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  locked_service service_code;
  locked_mode event_access_mode;
  target_event event%ROWTYPE;
  anonymous boolean;
  actor app_user%ROWTYPE;
  locked_capacity integer;
  locked_floorplan_enabled boolean;
  locked_event_deleted_at timestamptz;
  locked_event_status event_status;
  locked_shape_kind floorplan_shape_kind;
  locked_shape_deleted_at timestamptz;
  locked_shape_floorplan uuid;
  active_floorplan uuid;
  shape_capacity integer;
  occupied integer;
  staff_event_id uuid;
  staff_expired_at timestamptz;
BEGIN
  IF TG_OP = 'INSERT' AND NEW."used_at" IS NOT NULL THEN
    RAISE EXCEPTION 'PHYSICAL_PASS_USED_IMMUTABLE'
      USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_used_immutable';
  END IF;

  SELECT s."code", e."capacity", e."floorplan_enabled", e."deleted_at", e."status", e."access_mode"
  INTO locked_service, locked_capacity, locked_floorplan_enabled, locked_event_deleted_at, locked_event_status, locked_mode
  FROM "event" e
  LEFT JOIN "service" s ON s."id" = e."service_id"
  WHERE e."id" = NEW."event_id"
  FOR UPDATE OF e;

  IF NOT FOUND OR locked_event_deleted_at IS NOT NULL OR NOT COALESCE((
    (locked_service = 'PHYSICAL_QR' AND locked_mode IS NULL)
    OR (locked_service = 'ACCESS_CONTROL' AND locked_mode = 'ANONYMOUS')
  ), FALSE) THEN
    RAISE EXCEPTION 'PHYSICAL_PASS_SERVICE_MISMATCH'
      USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_service_mismatch';
  END IF;
  anonymous := locked_service = 'ACCESS_CONTROL' AND locked_mode = 'ANONYMOUS';
  IF anonymous THEN
    SELECT * INTO target_event FROM event WHERE id = NEW.event_id;
    IF NOT EXISTS (SELECT 1 FROM client WHERE id = target_event.client_id AND type = 'ORGANIZATION'
      AND operating_profile = 'MANAGED' AND status = 'ACTIVE' AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'PHYSICAL_PASS_SERVICE_MISMATCH' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'INSERT' THEN
      SELECT * INTO actor FROM app_user WHERE id = NEW.created_by_user_id FOR SHARE;
      IF NOT FOUND OR actor.role <> 'PLATFORM_ADMIN' OR actor.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'PHYSICAL_PASS_PROVIDER_REQUIRED' USING ERRCODE = '23514';
      END IF;
      IF NEW.pass_number <> (SELECT COALESCE(max(pass_number),0) + 1 FROM physical_pass WHERE event_id = NEW.event_id) THEN
        RAISE EXCEPTION 'PHYSICAL_PASS_NUMBER_NOT_CONSECUTIVE' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'PHYSICAL_PASS_ANONYMOUS_HISTORY_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'PHYSICAL_PASS_REVOCATION_NOT_ALLOWED' USING ERRCODE = '23514';
  END IF;
  IF NEW.revoked_at IS NOT NULL THEN
    IF TG_OP = 'INSERT' OR OLD.revoked_at IS NOT NULL OR OLD.used_at IS NOT NULL OR NEW.used_at IS NOT NULL THEN
      RAISE EXCEPTION 'PHYSICAL_PASS_REVOCATION_NOT_ALLOWED' USING ERRCODE = '23514';
    END IF;
    IF locked_event_status NOT IN ('draft', 'configured', 'ready_to_activate', 'active', 'event_day') THEN
      RAISE EXCEPTION 'PHYSICAL_PASS_EVENT_NOT_MUTABLE' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO actor FROM app_user WHERE id = NEW.revoked_by_user_id FOR SHARE;
    IF NOT FOUND OR actor.deleted_at IS NOT NULL OR actor.client_id IS DISTINCT FROM target_event.client_id
      OR NOT (actor.role = 'ORGANIZATION_ADMIN' OR (actor.role = 'ORGANIZATION_PLANNER'
        AND actor.id = target_event.assigned_planner_user_id)) THEN
      RAISE EXCEPTION 'PHYSICAL_PASS_REVOKER_NOT_AUTHORIZED' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF (TG_OP = 'INSERT' OR (anonymous AND NEW.used_at IS NULL))
    AND locked_event_status NOT IN ('draft', 'configured', 'ready_to_activate', 'active', 'event_day')
  THEN
    RAISE EXCEPTION 'PHYSICAL_PASS_EVENT_NOT_MUTABLE'
      USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_generation_state';
  END IF;
  IF locked_capacity IS NULL OR locked_capacity <= 0 THEN
    RAISE EXCEPTION 'PHYSICAL_PASS_CAPACITY_EXCEEDED'
      USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_event_capacity';
  END IF;

  SELECT count(*) INTO occupied
  FROM "physical_pass"
  WHERE "event_id" = NEW."event_id"
    AND "deleted_at" IS NULL AND "revoked_at" IS NULL
    AND "id" <> NEW."id";
  IF NEW."deleted_at" IS NULL AND occupied >= locked_capacity THEN
    RAISE EXCEPTION 'PHYSICAL_PASS_CAPACITY_EXCEEDED'
      USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_event_capacity';
  END IF;

  IF locked_floorplan_enabled AND NEW."floorplan_shape_id" IS NULL THEN
    RAISE EXCEPTION 'PHYSICAL_PASS_TABLE_INVALID'
      USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_table_required';
  ELSIF NOT locked_floorplan_enabled AND NEW."floorplan_shape_id" IS NOT NULL THEN
    RAISE EXCEPTION 'PHYSICAL_PASS_TABLE_INVALID'
      USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_table_forbidden';
  END IF;

  IF NEW."floorplan_shape_id" IS NOT NULL THEN
    SELECT fs."kind", fs."deleted_at", fs."floorplan_id", fs."capacity"
    INTO locked_shape_kind, locked_shape_deleted_at, locked_shape_floorplan, shape_capacity
    FROM "floorplan_shape" fs
    WHERE fs."id" = NEW."floorplan_shape_id" AND fs."event_id" = NEW."event_id"
    FOR UPDATE;
    SELECT f."id" INTO active_floorplan
    FROM "floorplan" f
    WHERE f."id" = locked_shape_floorplan AND f."event_id" = NEW."event_id" AND f."deleted_at" IS NULL
    FOR UPDATE;
    IF anonymous AND EXISTS (SELECT 1 FROM floorplan WHERE id = active_floorplan AND seating_mode <> 'TABLE') THEN
      RAISE EXCEPTION 'PHYSICAL_PASS_TABLE_INVALID' USING ERRCODE = '23514';
    END IF;
    IF locked_shape_kind IS DISTINCT FROM 'TABLE'
      OR locked_shape_deleted_at IS NOT NULL
      OR active_floorplan IS NULL
    THEN
      RAISE EXCEPTION 'PHYSICAL_PASS_TABLE_INVALID'
        USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_table_invalid';
    END IF;
    SELECT
      (SELECT count(*) FROM "assistant"
       WHERE "floorplan_shape_id" = NEW."floorplan_shape_id" AND "deleted_at" IS NULL)
      +
      (SELECT count(*) FROM "physical_pass"
       WHERE "floorplan_shape_id" = NEW."floorplan_shape_id"
         AND "deleted_at" IS NULL AND "revoked_at" IS NULL AND "id" <> NEW."id")
    INTO occupied;
    IF NEW."deleted_at" IS NULL AND occupied >= shape_capacity THEN
      RAISE EXCEPTION 'PHYSICAL_PASS_CAPACITY_EXCEEDED'
        USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_table_capacity';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."used_at" IS NULL AND NEW."used_at" IS NOT NULL THEN
    IF NEW."deleted_at" IS NOT NULL
      OR locked_event_deleted_at IS NOT NULL
      OR locked_event_status NOT IN ('active', 'event_day')
    THEN
      RAISE EXCEPTION 'PHYSICAL_PASS_USE_EVENT_NOT_OPERATIONAL'
        USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_use_event_not_operational';
    END IF;
    SELECT st."event_id", st."expired_at"
    INTO staff_event_id, staff_expired_at
    FROM "staff_token" st
    WHERE st."id" = NEW."used_by_staff_token_id"
    FOR UPDATE;
    IF NOT FOUND OR staff_event_id IS DISTINCT FROM NEW."event_id" THEN
      RAISE EXCEPTION 'PHYSICAL_PASS_STAFF_INVALID'
        USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_staff_event';
    END IF;
    IF staff_expired_at IS NOT NULL THEN
      RAISE EXCEPTION 'PHYSICAL_PASS_USE_STAFF_EXPIRED'
        USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_use_staff_expired';
    END IF;
  ELSIF NEW."used_at" IS NOT NULL THEN
    PERFORM 1
    FROM "staff_token" st
    WHERE st."id" = NEW."used_by_staff_token_id"
      AND st."event_id" = NEW."event_id"
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PHYSICAL_PASS_STAFF_INVALID'
        USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_staff_event';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "protect_physical_pass"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE anonymous boolean;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    -- Row visibility in an older snapshot cannot decide whether history exists.
    RAISE EXCEPTION 'PHYSICAL_PASS_HISTORY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  SELECT access_mode = 'ANONYMOUS' INTO anonymous FROM event WHERE id = OLD.event_id FOR UPDATE;
  IF anonymous AND (TG_OP = 'DELETE' OR OLD.revoked_at IS NOT NULL
    OR (TG_OP = 'UPDATE' AND OLD.used_at IS NOT NULL AND NEW IS DISTINCT FROM OLD)) THEN
    RAISE EXCEPTION 'PHYSICAL_PASS_ANONYMOUS_HISTORY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD."used_at" IS NOT NULL THEN
      RAISE EXCEPTION 'PHYSICAL_PASS_USED_IMMUTABLE'
        USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_used_immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.revoked_at IS NOT NULL AND NEW.floorplan_shape_id IS DISTINCT FROM OLD.floorplan_shape_id THEN
    RAISE EXCEPTION 'PHYSICAL_PASS_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."event_id" IS DISTINCT FROM OLD."event_id"
    OR NEW."pass_number" IS DISTINCT FROM OLD."pass_number"
    OR NEW."qr_token_nonce" IS DISTINCT FROM OLD."qr_token_nonce"
    OR NEW."qr_token_version" IS DISTINCT FROM OLD."qr_token_version"
    OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'PHYSICAL_PASS_IDENTITY_IMMUTABLE'
      USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_identity_immutable';
  END IF;

  IF OLD."used_at" IS NOT NULL AND (
    NEW."floorplan_shape_id" IS DISTINCT FROM OLD."floorplan_shape_id"
    OR NEW."used_at" IS DISTINCT FROM OLD."used_at"
    OR NEW."used_by_staff_token_id" IS DISTINCT FROM OLD."used_by_staff_token_id"
    OR NEW."use_idempotency_key" IS DISTINCT FROM OLD."use_idempotency_key"
    OR NEW."use_request_signature" IS DISTINCT FROM OLD."use_request_signature"
    OR NEW."use_result_snapshot" IS DISTINCT FROM OLD."use_result_snapshot"
    OR NEW."deleted_at" IS DISTINCT FROM OLD."deleted_at"
  ) THEN
    RAISE EXCEPTION 'PHYSICAL_PASS_USED_IMMUTABLE'
      USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_used_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER physical_pass_protect_truncate BEFORE TRUNCATE ON physical_pass
FOR EACH STATEMENT EXECUTE FUNCTION protect_physical_pass();
CREATE OR REPLACE FUNCTION "assert_floorplan_shape_capacity"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  occupied integer;
BEGIN
  IF OLD."deleted_at" IS NULL
    AND (NEW."deleted_at" IS NOT NULL OR NEW."kind" <> 'TABLE' OR NEW."capacity" < OLD."capacity")
  THEN
    SELECT
      (SELECT count(*) FROM "assistant"
       WHERE "floorplan_shape_id" = OLD."id" AND "deleted_at" IS NULL)
      +
      (SELECT count(*) FROM "physical_pass"
       WHERE "revoked_at" IS NULL AND "floorplan_shape_id" = OLD."id" AND "deleted_at" IS NULL)
    INTO occupied;
    IF occupied > 0 AND (NEW."deleted_at" IS NOT NULL OR NEW."kind" <> 'TABLE' OR NEW."capacity" < occupied) THEN
      RAISE EXCEPTION 'FLOORPLAN_TABLE_OCCUPIED_OR_CAPACITY'
        USING ERRCODE = 'P0001', CONSTRAINT = 'floorplan_table_occupied_or_capacity';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "assert_assistant_seating"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  shape_event uuid;
  shape_kind floorplan_shape_kind;
  shape_capacity integer;
  shape_deleted_at timestamptz;
  occupied integer;
BEGIN
  IF NEW."floorplan_shape_id" IS NULL THEN RETURN NEW; END IF;
  SELECT "event_id", "kind", "capacity", "deleted_at"
  INTO shape_event, shape_kind, shape_capacity, shape_deleted_at
  FROM "floorplan_shape"
  WHERE "id" = NEW."floorplan_shape_id"
  FOR UPDATE;
  IF shape_event IS NULL OR shape_event <> NEW."event_id"
    OR shape_kind <> 'TABLE' OR shape_deleted_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'SEATING_TABLE_INVALID'
      USING ERRCODE = 'P0001', CONSTRAINT = 'seating_table_invalid';
  END IF;
  SELECT
    (SELECT count(*) FROM "assistant"
     WHERE "floorplan_shape_id" = NEW."floorplan_shape_id"
       AND "deleted_at" IS NULL AND "id" <> NEW."id")
    +
    (SELECT count(*) FROM "physical_pass"
     WHERE "revoked_at" IS NULL AND "floorplan_shape_id" = NEW."floorplan_shape_id" AND "deleted_at" IS NULL)
  INTO occupied;
  IF occupied >= shape_capacity THEN
    RAISE EXCEPTION 'SEATING_TABLE_CAPACITY_EXCEEDED'
      USING ERRCODE = 'P0001', CONSTRAINT = 'seating_table_capacity_exceeded';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "protect_event_physical_pass_configuration"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  active_passes integer;
  invalid_tables integer;
BEGIN
  IF NEW.access_mode = 'ANONYMOUS' AND EXISTS (
    SELECT 1 FROM floorplan WHERE event_id = NEW.id AND deleted_at IS NULL AND seating_mode <> 'TABLE'
  ) THEN
    RAISE EXCEPTION 'PHYSICAL_PASS_TABLE_INVALID' USING ERRCODE = '23514';
  END IF;
  IF NEW."capacity" IS DISTINCT FROM OLD."capacity"
    OR NEW."floorplan_enabled" IS DISTINCT FROM OLD."floorplan_enabled"
    OR NEW."service_id" IS DISTINCT FROM OLD."service_id"
    OR NEW.access_mode IS DISTINCT FROM OLD.access_mode
  THEN
    SELECT count(*) INTO active_passes
    FROM "physical_pass" WHERE "event_id" = OLD."id" AND "deleted_at" IS NULL AND revoked_at IS NULL;
    IF active_passes > 0 THEN
      IF NEW."capacity" IS NULL OR NEW."capacity" < active_passes THEN
        RAISE EXCEPTION 'PHYSICAL_PASS_CAPACITY_EXCEEDED'
          USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_event_capacity';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM "service" WHERE "id" = NEW."service_id" AND (("code" = 'PHYSICAL_QR' AND NEW.access_mode IS NULL)
          OR ("code" = 'ACCESS_CONTROL' AND NEW.access_mode = 'ANONYMOUS'))
      ) THEN
        RAISE EXCEPTION 'PHYSICAL_PASS_SERVICE_MISMATCH'
          USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_service_mismatch';
      END IF;
      SELECT count(*) INTO invalid_tables
      FROM "physical_pass"
      WHERE "event_id" = OLD."id" AND "deleted_at" IS NULL AND revoked_at IS NULL
        AND (
          (NEW."floorplan_enabled" AND "floorplan_shape_id" IS NULL)
          OR (NOT NEW."floorplan_enabled" AND "floorplan_shape_id" IS NOT NULL)
        );
      IF invalid_tables > 0 THEN
        RAISE EXCEPTION 'PHYSICAL_PASS_TABLE_INVALID'
          USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_event_floorplan_mode';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


DROP TRIGGER event_physical_pass_configuration_trigger ON event;
CREATE TRIGGER event_physical_pass_configuration_trigger
BEFORE UPDATE OF capacity, floorplan_enabled, service_id, access_mode ON event
FOR EACH ROW EXECUTE FUNCTION protect_event_physical_pass_configuration();

CREATE FUNCTION assert_anonymous_floorplan_mode() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM event WHERE id = NEW.event_id FOR UPDATE;
  IF NEW.seating_mode <> 'TABLE' AND EXISTS (SELECT 1 FROM event WHERE id = NEW.event_id AND access_mode = 'ANONYMOUS') THEN
    RAISE EXCEPTION 'PHYSICAL_PASS_TABLE_INVALID' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER anonymous_floorplan_table_mode BEFORE INSERT OR UPDATE OF event_id, seating_mode ON floorplan
FOR EACH ROW EXECUTE FUNCTION assert_anonymous_floorplan_mode();
COMMIT;
