CREATE TYPE "event_social_type" AS ENUM (
  'wedding',
  'quinceanera',
  'corporate',
  'birthday',
  'other'
);

CREATE TYPE "event_status" AS ENUM (
  'draft',
  'configured',
  'ready_to_activate',
  'active',
  'event_day',
  'closed',
  'album_published',
  'archived',
  'cancelled'
);

CREATE TABLE "event" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "client_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "service_id" UUID,
  "name" VARCHAR(160),
  "social_type" "event_social_type",
  "status" "event_status" NOT NULL DEFAULT 'draft',
  "event_date_time" TIMESTAMPTZ(6),
  "time_zone" VARCHAR(100),
  "capacity" INTEGER,
  "confirmation_enabled" BOOLEAN NOT NULL DEFAULT false,
  "floorplan_enabled" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),

  CONSTRAINT "event_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_name_check"
    CHECK ("name" IS NULL OR length(btrim("name")) > 0),
  CONSTRAINT "event_capacity_check"
    CHECK ("capacity" IS NULL OR "capacity" > 0)
);

CREATE INDEX "event_client_id_status_deleted_at_idx"
  ON "event"("client_id", "status", "deleted_at");
CREATE INDEX "event_created_by_user_id_status_deleted_at_idx"
  ON "event"("created_by_user_id", "status", "deleted_at");
CREATE INDEX "event_event_date_time_status_deleted_at_idx"
  ON "event"("event_date_time", "status", "deleted_at");

ALTER TABLE "event"
  ADD CONSTRAINT "event_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "client"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "event"
  ADD CONSTRAINT "event_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "event"
  ADD CONSTRAINT "event_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "service"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION validate_event_context()
RETURNS TRIGGER AS $$
DECLARE
  creator_client_id UUID;
BEGIN
  SELECT "client_id"
  INTO creator_client_id
  FROM "app_user"
  WHERE "id" = NEW."created_by_user_id"
    AND "deleted_at" IS NULL;

  IF creator_client_id IS DISTINCT FROM NEW."client_id" THEN
    RAISE EXCEPTION 'Event creator must belong to the Event Client.'
      USING ERRCODE = '23514';
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

CREATE TRIGGER "event_context_trigger"
  BEFORE INSERT OR UPDATE OF "client_id", "created_by_user_id", "time_zone"
  ON "event"
  FOR EACH ROW
  EXECUTE FUNCTION validate_event_context();
