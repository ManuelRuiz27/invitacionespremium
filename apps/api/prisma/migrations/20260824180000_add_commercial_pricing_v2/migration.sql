CREATE TYPE "commercial_channel" AS ENUM ('STANDARD', 'PARTNER', 'VENUE');
CREATE TYPE "venue_price_tier" AS ENUM ('ONE_TO_TWO', 'THREE_TO_FIVE', 'SIX_TO_TEN', 'ELEVEN_PLUS');

ALTER TABLE "client"
  ADD COLUMN "commercial_channel" "commercial_channel";

ALTER TABLE "service_price"
  ADD COLUMN "pricing_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "commercial_channel" "commercial_channel",
  ADD COLUMN "capacity_min" INTEGER,
  ADD COLUMN "capacity_max" INTEGER,
  ADD COLUMN "venue_tier" "venue_price_tier",
  ALTER COLUMN "client_type" DROP NOT NULL;

ALTER TABLE "service_price"
  ADD CONSTRAINT "service_price_pricing_version_check" CHECK ("pricing_version" IN (1, 2)),
  ADD CONSTRAINT "service_price_v2_shape_check" CHECK (
    (
      "pricing_version" = 1
      AND "client_type" IS NOT NULL
      AND "commercial_channel" IS NULL
      AND "capacity_min" IS NULL
      AND "capacity_max" IS NULL
      AND "venue_tier" IS NULL
    )
    OR
    (
      "pricing_version" = 2
      AND "client_type" IS NULL
      AND (
        (
          "commercial_channel" IN ('STANDARD', 'PARTNER')
          AND "capacity_min" IS NOT NULL
          AND "capacity_max" IS NOT NULL
          AND "capacity_min" >= 1
          AND "capacity_max" <= 150
          AND "capacity_min" <= "capacity_max"
          AND "venue_tier" IS NULL
        )
        OR
        (
          "commercial_channel" = 'VENUE'
          AND "capacity_min" IS NULL
          AND "capacity_max" IS NULL
          AND "venue_tier" IS NOT NULL
        )
      )
    )
  );

ALTER TABLE "service_price" DROP CONSTRAINT "service_price_no_overlap";

ALTER TABLE "service_price"
  ADD CONSTRAINT "service_price_legacy_no_overlap"
  EXCLUDE USING gist (
    "service_id" WITH =,
    "client_type" WITH =,
    tstzrange("valid_from", "valid_until", '[)') WITH &&
  ) WHERE ("pricing_version" = 1);

ALTER TABLE "service_price"
  ADD CONSTRAINT "service_price_capacity_rule_no_overlap"
  EXCLUDE USING gist (
    "service_id" WITH =,
    "commercial_channel" WITH =,
    int4range("capacity_min", "capacity_max", '[]') WITH &&,
    tstzrange("valid_from", "valid_until", '[)') WITH &&
  ) WHERE ("pricing_version" = 2 AND "commercial_channel" IN ('STANDARD', 'PARTNER'));

ALTER TABLE "service_price"
  ADD CONSTRAINT "service_price_venue_rule_no_overlap"
  EXCLUDE USING gist (
    "service_id" WITH =,
    "commercial_channel" WITH =,
    "venue_tier" WITH =,
    tstzrange("valid_from", "valid_until", '[)') WITH &&
  ) WHERE ("pricing_version" = 2 AND "commercial_channel" = 'VENUE');

CREATE INDEX "service_price_pricing_version_commercial_channel_validity_idx"
  ON "service_price"("pricing_version", "commercial_channel", "valid_from", "valid_until");
CREATE INDEX "service_price_service_channel_capacity_idx"
  ON "service_price"("service_id", "commercial_channel", "capacity_min", "capacity_max");
CREATE INDEX "service_price_service_channel_venue_tier_idx"
  ON "service_price"("service_id", "commercial_channel", "venue_tier");

CREATE OR REPLACE FUNCTION enforce_commercial_price_service_shape()
RETURNS TRIGGER AS $$
DECLARE
  resolved_service_code "service_code";
BEGIN
  SELECT "code" INTO resolved_service_code FROM "service" WHERE "id" = NEW."service_id";

  IF NEW."pricing_version" = 2
     AND NEW."commercial_channel" = 'VENUE'
     AND resolved_service_code <> 'PHYSICAL_QR'
  THEN
    RAISE EXCEPTION 'Venue pricing is only valid for PHYSICAL_QR.' USING ERRCODE = '23514';
  END IF;

  IF resolved_service_code = 'DEMO' AND NEW."credits" <> 0 THEN
    RAISE EXCEPTION 'DEMO service price must be zero.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER "service_price_demo_zero_trigger" ON "service_price";
CREATE TRIGGER "service_price_commercial_shape_trigger"
  BEFORE INSERT OR UPDATE OF "service_id", "pricing_version", "commercial_channel", "credits"
  ON "service_price"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_commercial_price_service_shape();

DO $$
DECLARE
  launch_at TIMESTAMPTZ(6) := CURRENT_TIMESTAMP;
BEGIN
  UPDATE "service_price"
  SET "valid_until" = launch_at, "updated_at" = launch_at
  WHERE "pricing_version" = 1
    AND "valid_until" IS NULL
    AND "valid_from" < launch_at;

  INSERT INTO "service_price" (
    "service_id", "pricing_version", "commercial_channel", "capacity_min", "capacity_max",
    "venue_tier", "credits", "valid_from", "updated_at"
  )
  SELECT service."id", 2, configured."channel"::"commercial_channel", configured."capacity_min",
    configured."capacity_max", configured."venue_tier"::"venue_price_tier", configured."credits",
    launch_at, launch_at
  FROM (
    VALUES
      ('PHYSICAL_QR'::"service_code", 'STANDARD', 1, 50, NULL, 125),
      ('PHYSICAL_QR'::"service_code", 'STANDARD', 51, 100, NULL, 150),
      ('PHYSICAL_QR'::"service_code", 'STANDARD', 101, 150, NULL, 175),
      ('FLYER'::"service_code", 'STANDARD', 1, 50, NULL, 225),
      ('FLYER'::"service_code", 'STANDARD', 51, 100, NULL, 275),
      ('FLYER'::"service_code", 'STANDARD', 101, 150, NULL, 325),
      ('FLIPBOOK'::"service_code", 'STANDARD', 1, 50, NULL, 300),
      ('FLIPBOOK'::"service_code", 'STANDARD', 51, 100, NULL, 350),
      ('FLIPBOOK'::"service_code", 'STANDARD', 101, 150, NULL, 400),
      ('PHYSICAL_QR'::"service_code", 'PARTNER', 1, 100, NULL, 120),
      ('FLYER'::"service_code", 'PARTNER', 1, 100, NULL, 215),
      ('FLIPBOOK'::"service_code", 'PARTNER', 1, 100, NULL, 275),
      ('PHYSICAL_QR'::"service_code", 'VENUE', NULL, NULL, 'ONE_TO_TWO', 120),
      ('PHYSICAL_QR'::"service_code", 'VENUE', NULL, NULL, 'THREE_TO_FIVE', 110),
      ('PHYSICAL_QR'::"service_code", 'VENUE', NULL, NULL, 'SIX_TO_TEN', 100),
      ('PHYSICAL_QR'::"service_code", 'VENUE', NULL, NULL, 'ELEVEN_PLUS', 90)
  ) AS configured("code", "channel", "capacity_min", "capacity_max", "venue_tier", "credits")
  JOIN "service" ON service."code" = configured."code";
END $$;

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
      AND NEW."activated_by_user_id" IS DISTINCT FROM NEW."created_by_user_id")
  THEN
    RAISE EXCEPTION 'Event activation actor is not authorized for this Event and Client.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
