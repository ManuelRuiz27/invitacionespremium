ALTER TABLE "event"
  ADD COLUMN "assigned_planner_user_id" UUID;

ALTER TABLE "event"
  ADD CONSTRAINT "event_assigned_planner_user_id_fkey"
  FOREIGN KEY ("assigned_planner_user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "event_client_id_assigned_planner_user_id_status_deleted_at_idx"
  ON "event"("client_id", "assigned_planner_user_id", "status", "deleted_at");

UPDATE "event" AS event
SET "assigned_planner_user_id" = event."created_by_user_id"
FROM "app_user" AS creator
WHERE creator."id" = event."created_by_user_id"
  AND creator."client_id" = event."client_id"
  AND creator."deleted_at" IS NULL
  AND creator."role" IN ('INDEPENDENT_PLANNER', 'ORGANIZATION_PLANNER');

CREATE OR REPLACE FUNCTION validate_event_context()
RETURNS TRIGGER AS $$
DECLARE
  creator_client_id UUID;
  creator_role "user_role";
  assigned_client_id UUID;
  assigned_role "user_role";
  event_client_type "client_type";
BEGIN
  SELECT "client_id", "role"
  INTO creator_client_id, creator_role
  FROM "app_user"
  WHERE "id" = NEW."created_by_user_id"
    AND "deleted_at" IS NULL;

  IF NOT FOUND OR (
    creator_role = 'PLATFORM_ADMIN' AND creator_client_id IS NOT NULL
  ) OR (
    creator_role <> 'PLATFORM_ADMIN' AND creator_client_id IS DISTINCT FROM NEW."client_id"
  ) THEN
    RAISE EXCEPTION 'Event creator is not authorized for the Event Client.'
      USING ERRCODE = '23514';
  END IF;

  SELECT "type"
  INTO event_client_type
  FROM "client"
  WHERE "id" = NEW."client_id"
    AND "deleted_at" IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event Client must exist and not be deleted.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."assigned_planner_user_id" IS NOT NULL THEN
    SELECT "client_id", "role"
    INTO assigned_client_id, assigned_role
    FROM "app_user"
    WHERE "id" = NEW."assigned_planner_user_id"
      AND "deleted_at" IS NULL;

    IF NOT FOUND
      OR assigned_client_id IS DISTINCT FROM NEW."client_id"
      OR (event_client_type = 'PLANNER' AND assigned_role <> 'INDEPENDENT_PLANNER')
      OR (event_client_type = 'ORGANIZATION' AND assigned_role <> 'ORGANIZATION_PLANNER')
    THEN
      RAISE EXCEPTION 'Assigned Planner is not valid for the Event Client.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW."time_zone" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_timezone_names
       WHERE "name" = NEW."time_zone"
     ) THEN
    RAISE EXCEPTION 'Event time zone must be a valid IANA identifier.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER "event_context_trigger" ON "event";

CREATE TRIGGER "event_context_trigger"
  BEFORE INSERT OR UPDATE OF "client_id", "created_by_user_id", "assigned_planner_user_id", "time_zone"
  ON "event"
  FOR EACH ROW
  EXECUTE FUNCTION validate_event_context();

CREATE OR REPLACE FUNCTION validate_event_activation_snapshot_references()
RETURNS TRIGGER AS $$
DECLARE
  event_client_type "client_type";
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

  SELECT "type", COALESCE("commercial_channel", 'STANDARD'::"commercial_channel")
    INTO event_client_type, event_commercial_channel
    FROM "client" WHERE "id" = NEW."client_id";

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
