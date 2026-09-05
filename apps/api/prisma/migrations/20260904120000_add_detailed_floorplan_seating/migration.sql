CREATE TYPE "floorplan_seating_mode" AS ENUM ('TABLE', 'SEAT');
ALTER TYPE "seating_action" ADD VALUE 'ASSIGN_SEATS';

ALTER TABLE "floorplan"
  ADD COLUMN "seating_mode" "floorplan_seating_mode" NOT NULL DEFAULT 'TABLE';

ALTER TABLE "assistant"
  ADD COLUMN "floorplan_seat_id" UUID;

CREATE TABLE "floorplan_seat" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "floorplan_id" UUID NOT NULL,
  "floorplan_shape_id" UUID NOT NULL,
  "label" VARCHAR(120) NOT NULL,
  "normalized_label" VARCHAR(120) NOT NULL,
  "x" DECIMAL(9,8) NOT NULL,
  "y" DECIMAL(9,8) NOT NULL,
  "is_blocked" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "floorplan_seat_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "floorplan_seat_coordinates_check" CHECK (
    "x" >= 0 AND "x" <= 1 AND "y" >= 0 AND "y" <= 1
  ),
  CONSTRAINT "floorplan_seat_label_check" CHECK (
    length(btrim("label")) BETWEEN 1 AND 120
    AND length(btrim("normalized_label")) BETWEEN 1 AND 120
  )
);

CREATE UNIQUE INDEX "floorplan_seat_id_event_id_floorplan_shape_id_key"
  ON "floorplan_seat"("id", "event_id", "floorplan_shape_id");
CREATE UNIQUE INDEX "floorplan_seat_active_label_key"
  ON "floorplan_seat"("floorplan_shape_id", "normalized_label") WHERE "deleted_at" IS NULL;
CREATE INDEX "floorplan_seat_floorplan_id_deleted_at_idx"
  ON "floorplan_seat"("floorplan_id", "deleted_at");
CREATE INDEX "floorplan_seat_floorplan_shape_id_deleted_at_idx"
  ON "floorplan_seat"("floorplan_shape_id", "deleted_at");
CREATE INDEX "assistant_floorplan_seat_id_event_id_idx"
  ON "assistant"("floorplan_seat_id", "event_id");
CREATE UNIQUE INDEX "assistant_active_floorplan_seat_key"
  ON "assistant"("floorplan_seat_id")
  WHERE "floorplan_seat_id" IS NOT NULL AND "deleted_at" IS NULL;

ALTER TABLE "floorplan_seat"
  ADD CONSTRAINT "floorplan_seat_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "floorplan_seat_floorplan_id_event_id_fkey"
    FOREIGN KEY ("floorplan_id", "event_id") REFERENCES "floorplan"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "floorplan_seat_shape_id_event_id_fkey"
    FOREIGN KEY ("floorplan_shape_id", "event_id") REFERENCES "floorplan_shape"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assistant"
  ADD CONSTRAINT "assistant_floorplan_seat_id_event_shape_id_fkey"
    FOREIGN KEY ("floorplan_seat_id", "event_id", "floorplan_shape_id")
    REFERENCES "floorplan_seat"("id", "event_id", "floorplan_shape_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "assert_floorplan_seat_integrity"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  shape_kind "floorplan_shape_kind";
  shape_floorplan UUID;
  shape_deleted_at TIMESTAMPTZ;
  occupied INTEGER;
BEGIN
  SELECT "kind", "floorplan_id", "deleted_at"
    INTO shape_kind, shape_floorplan, shape_deleted_at
    FROM "floorplan_shape"
    WHERE "id" = NEW."floorplan_shape_id" AND "event_id" = NEW."event_id"
    FOR UPDATE;
  IF NOT FOUND OR shape_kind <> 'TABLE' OR shape_deleted_at IS NOT NULL OR shape_floorplan <> NEW."floorplan_id" THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FLOORPLAN_SEAT_PARENT_INVALID';
  END IF;
  IF (OLD."deleted_at" IS NULL AND NEW."deleted_at" IS NOT NULL)
     OR (OLD."is_blocked" = FALSE AND NEW."is_blocked" = TRUE) THEN
    SELECT count(*) INTO occupied FROM "assistant"
      WHERE "floorplan_seat_id" = OLD."id" AND "deleted_at" IS NULL;
    IF occupied > 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FLOORPLAN_SEAT_OCCUPIED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "floorplan_seat_integrity_trigger"
BEFORE INSERT OR UPDATE OF "event_id", "floorplan_id", "floorplan_shape_id", "is_blocked", "deleted_at"
ON "floorplan_seat" FOR EACH ROW EXECUTE FUNCTION "assert_floorplan_seat_integrity"();

CREATE OR REPLACE FUNCTION "sync_floorplan_seat_capacity"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  target_shape UUID;
BEGIN
  target_shape := COALESCE(NEW."floorplan_shape_id", OLD."floorplan_shape_id");
  UPDATE "floorplan_shape" s
  SET "capacity" = (
    SELECT count(*)::integer FROM "floorplan_seat" fs
    WHERE fs."floorplan_shape_id" = target_shape AND fs."deleted_at" IS NULL AND fs."is_blocked" = FALSE
  ), "updated_at" = CURRENT_TIMESTAMP
  WHERE s."id" = target_shape
    AND EXISTS (
      SELECT 1 FROM "floorplan" f WHERE f."id" = s."floorplan_id" AND f."seating_mode" = 'SEAT'
    );
  RETURN NULL;
END;
$$;

CREATE TRIGGER "floorplan_seat_capacity_trigger"
AFTER INSERT OR UPDATE OF "floorplan_shape_id", "is_blocked", "deleted_at" OR DELETE
ON "floorplan_seat" FOR EACH ROW EXECUTE FUNCTION "sync_floorplan_seat_capacity"();

CREATE OR REPLACE FUNCTION "assert_assistant_floorplan_seat"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  seat_blocked BOOLEAN;
  seat_deleted_at TIMESTAMPTZ;
  floorplan_mode "floorplan_seating_mode";
BEGIN
  IF NEW."floorplan_seat_id" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT fs."is_blocked", fs."deleted_at", f."seating_mode"
    INTO seat_blocked, seat_deleted_at, floorplan_mode
    FROM "floorplan_seat" fs
    JOIN "floorplan" f ON f."id" = fs."floorplan_id" AND f."event_id" = fs."event_id"
    WHERE fs."id" = NEW."floorplan_seat_id" AND fs."event_id" = NEW."event_id"
    FOR UPDATE OF fs;
  IF NOT FOUND OR seat_blocked OR seat_deleted_at IS NOT NULL OR floorplan_mode <> 'SEAT' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SEATING_SEAT_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "assistant_floorplan_seat_trigger"
BEFORE INSERT OR UPDATE OF "floorplan_seat_id", "floorplan_shape_id", "event_id", "deleted_at"
ON "assistant" FOR EACH ROW EXECUTE FUNCTION "assert_assistant_floorplan_seat"();

CREATE OR REPLACE FUNCTION "assert_floorplan_seating_mode"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."seating_mode" = 'SEAT' AND NEW."seating_mode" = 'TABLE' THEN
    IF EXISTS (SELECT 1 FROM "check_in" WHERE "reverted_at" IS NULL AND "event_id" = NEW."event_id") THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FLOORPLAN_SEAT_MODE_CHECKIN_EXISTS';
    END IF;
    UPDATE "assistant" SET "floorplan_seat_id" = NULL
      WHERE "event_id" = NEW."event_id" AND "floorplan_seat_id" IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "floorplan_seating_mode_trigger"
BEFORE UPDATE OF "seating_mode" ON "floorplan"
FOR EACH ROW EXECUTE FUNCTION "assert_floorplan_seating_mode"();
