CREATE TYPE "floorplan_shape_kind" AS ENUM ('TABLE', 'DECORATIVE_ZONE');
CREATE TYPE "floorplan_geometry" AS ENUM ('RECTANGLE', 'SQUARE', 'CIRCLE', 'POLYGON');
CREATE TYPE "seating_action" AS ENUM ('ASSIGN', 'ASSIGN_FAMILY', 'ASSIGN_GROUP', 'UPDATE');

CREATE TABLE "floorplan" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "image_asset_id" UUID NOT NULL,
  "locked_at" TIMESTAMPTZ(6),
  "locked_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "floorplan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "floorplan_lock_consistency_check"
    CHECK (("locked_at" IS NULL) = ("locked_by_user_id" IS NULL))
);

CREATE TABLE "floorplan_shape" (
  "id" UUID NOT NULL,
  "floorplan_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "kind" "floorplan_shape_kind" NOT NULL,
  "geometry" "floorplan_geometry" NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "normalized_name" VARCHAR(120) NOT NULL,
  "capacity" INTEGER NOT NULL,
  "x" DECIMAL(9,8) NOT NULL,
  "y" DECIMAL(9,8) NOT NULL,
  "width" DECIMAL(9,8) NOT NULL,
  "height" DECIMAL(9,8) NOT NULL,
  "rotation" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "polygon_points" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "floorplan_shape_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "floorplan_shape_name_check"
    CHECK (length(btrim("name")) BETWEEN 1 AND 120 AND length(btrim("normalized_name")) BETWEEN 1 AND 120),
  CONSTRAINT "floorplan_shape_capacity_check"
    CHECK (
      ("kind" = 'TABLE' AND "capacity" > 0)
      OR ("kind" = 'DECORATIVE_ZONE' AND "capacity" = 0)
    ),
  CONSTRAINT "floorplan_shape_coordinates_check"
    CHECK (
      "x" >= 0 AND "x" <= 1
      AND "y" >= 0 AND "y" <= 1
      AND "width" > 0 AND "width" <= 1
      AND "height" > 0 AND "height" <= 1
      AND "x" + "width" <= 1
      AND "y" + "height" <= 1
      AND "rotation" >= 0 AND "rotation" < 360
    ),
  CONSTRAINT "floorplan_shape_equal_sides_check"
    CHECK ("geometry" NOT IN ('SQUARE', 'CIRCLE') OR "width" = "height")
);

CREATE TABLE "seating_operation" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "action" "seating_action" NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "request_signature" CHAR(64) NOT NULL,
  "result_snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seating_operation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "seating_operation_signature_check"
    CHECK ("request_signature" ~ '^[0-9a-f]{64}$')
);

ALTER TABLE "assistant" ADD COLUMN "floorplan_shape_id" UUID;

DO $$
DECLARE
  invalid_count BIGINT;
BEGIN
  SELECT count(*) INTO invalid_count
  FROM "assistant" a
  WHERE a."floorplan_shape_id" IS NOT NULL;
  IF invalid_count <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FLOORPLAN_MIGRATION_PRECHECK_FAILED',
      DETAIL = format('invalid_count=%s', invalid_count);
  END IF;
END;
$$;

CREATE UNIQUE INDEX "floorplan_id_event_id_key" ON "floorplan"("id", "event_id");
CREATE UNIQUE INDEX "floorplan_image_asset_id_key" ON "floorplan"("image_asset_id");
CREATE UNIQUE INDEX "floorplan_one_active_per_event_key"
  ON "floorplan"("event_id") WHERE "deleted_at" IS NULL;
CREATE INDEX "floorplan_event_id_deleted_at_idx" ON "floorplan"("event_id", "deleted_at");

CREATE UNIQUE INDEX "floorplan_shape_id_event_id_key" ON "floorplan_shape"("id", "event_id");
CREATE INDEX "floorplan_shape_floorplan_id_deleted_at_idx"
  ON "floorplan_shape"("floorplan_id", "deleted_at");
CREATE INDEX "floorplan_shape_event_id_kind_deleted_at_idx"
  ON "floorplan_shape"("event_id", "kind", "deleted_at");
CREATE UNIQUE INDEX "floorplan_shape_active_name_key"
  ON "floorplan_shape"("floorplan_id", "normalized_name") WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "seating_operation_idempotency_key_key"
  ON "seating_operation"("idempotency_key");
CREATE INDEX "seating_operation_event_id_action_created_at_idx"
  ON "seating_operation"("event_id", "action", "created_at");
CREATE INDEX "assistant_floorplan_shape_id_event_id_idx"
  ON "assistant"("floorplan_shape_id", "event_id");

ALTER TABLE "floorplan"
  ADD CONSTRAINT "floorplan_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "floorplan_image_asset_id_fkey"
  FOREIGN KEY ("image_asset_id") REFERENCES "file_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "floorplan_locked_by_user_id_fkey"
  FOREIGN KEY ("locked_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "floorplan_shape"
  ADD CONSTRAINT "floorplan_shape_floorplan_id_event_id_fkey"
  FOREIGN KEY ("floorplan_id", "event_id") REFERENCES "floorplan"("id", "event_id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "floorplan_shape_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "seating_operation"
  ADD CONSTRAINT "seating_operation_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assistant"
  ADD CONSTRAINT "assistant_floorplan_shape_id_event_id_fkey"
  FOREIGN KEY ("floorplan_shape_id", "event_id") REFERENCES "floorplan_shape"("id", "event_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "floorplan_polygon_points_valid"(points JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  point JSONB;
  px NUMERIC;
  py NUMERIC;
BEGIN
  IF jsonb_typeof(points) <> 'array' OR jsonb_array_length(points) NOT BETWEEN 3 AND 64 THEN
    RETURN FALSE;
  END IF;
  FOR point IN SELECT value FROM jsonb_array_elements(points)
  LOOP
    IF jsonb_typeof(point) <> 'object'
      OR NOT (point ? 'x' AND point ? 'y')
      OR (SELECT count(*) FROM jsonb_object_keys(point)) <> 2
      OR jsonb_typeof(point->'x') <> 'number'
      OR jsonb_typeof(point->'y') <> 'number'
    THEN
      RETURN FALSE;
    END IF;
    px := (point->>'x')::numeric;
    py := (point->>'y')::numeric;
    IF px < 0 OR px > 1 OR py < 0 OR py > 1 THEN
      RETURN FALSE;
    END IF;
  END LOOP;
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$;

ALTER TABLE "floorplan_shape"
  ADD CONSTRAINT "floorplan_shape_polygon_check"
  CHECK (
    ("geometry" = 'POLYGON' AND "floorplan_polygon_points_valid"("polygon_points"))
    OR ("geometry" <> 'POLYGON' AND "polygon_points" IS NULL)
  );

CREATE OR REPLACE FUNCTION "assert_floorplan_asset_compatible"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  event_client UUID;
  asset_client UUID;
  asset_event UUID;
  asset_owner_type "file_asset_owner_type";
  asset_owner UUID;
  asset_file_type "file_asset_type";
  asset_status "file_asset_status";
  asset_deleted_at TIMESTAMPTZ;
BEGIN
  SELECT "client_id" INTO event_client FROM "event" WHERE "id" = NEW."event_id";
  SELECT "client_id", "event_id", "owner_type", "owner_id", "file_type", "status", "deleted_at"
  INTO asset_client, asset_event, asset_owner_type, asset_owner, asset_file_type, asset_status, asset_deleted_at
  FROM "file_asset" WHERE "id" = NEW."image_asset_id";
  IF event_client IS NULL
    OR asset_client IS DISTINCT FROM event_client
    OR asset_event IS DISTINCT FROM NEW."event_id"
    OR asset_owner_type <> 'FLOORPLAN'
    OR asset_file_type <> 'FLOORPLAN_IMAGE'
    OR asset_status <> 'READY'
    OR asset_deleted_at IS NOT NULL
    OR asset_owner IS DISTINCT FROM NEW."id"
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FLOORPLAN_FILE_ASSET_INCOMPATIBLE';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "floorplan_asset_compatible_trigger"
AFTER INSERT OR UPDATE OF "event_id", "image_asset_id" ON "floorplan"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_floorplan_asset_compatible"();

CREATE OR REPLACE FUNCTION "protect_active_floorplan_asset"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "floorplan" f
    JOIN "event" e ON e."id" = f."event_id"
    WHERE f."image_asset_id" = NEW."id"
      AND f."deleted_at" IS NULL
      AND (
        NEW."client_id" <> e."client_id"
        OR NEW."event_id" <> f."event_id"
        OR NEW."owner_type" <> 'FLOORPLAN'
        OR NEW."owner_id" <> f."id"
        OR NEW."file_type" <> 'FLOORPLAN_IMAGE'
        OR NEW."status" <> 'READY'
        OR NEW."deleted_at" IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FLOORPLAN_FILE_ASSET_IN_USE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "protect_active_floorplan_asset_trigger"
BEFORE UPDATE ON "file_asset"
FOR EACH ROW EXECUTE FUNCTION "protect_active_floorplan_asset"();

CREATE OR REPLACE FUNCTION "assert_floorplan_shape_capacity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  occupied INTEGER;
BEGIN
  IF OLD."deleted_at" IS NULL
    AND (NEW."deleted_at" IS NOT NULL OR NEW."kind" <> 'TABLE' OR NEW."capacity" < OLD."capacity")
  THEN
    SELECT count(*) INTO occupied
    FROM "assistant"
    WHERE "floorplan_shape_id" = OLD."id" AND "deleted_at" IS NULL;
    IF occupied > 0 AND (NEW."deleted_at" IS NOT NULL OR NEW."kind" <> 'TABLE' OR NEW."capacity" < occupied) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FLOORPLAN_TABLE_OCCUPIED_OR_CAPACITY';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "floorplan_shape_capacity_trigger"
BEFORE UPDATE ON "floorplan_shape"
FOR EACH ROW EXECUTE FUNCTION "assert_floorplan_shape_capacity"();

CREATE OR REPLACE FUNCTION "assert_assistant_seating"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  shape_event UUID;
  shape_kind "floorplan_shape_kind";
  shape_capacity INTEGER;
  shape_deleted_at TIMESTAMPTZ;
  occupied INTEGER;
BEGIN
  IF NEW."floorplan_shape_id" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "event_id", "kind", "capacity", "deleted_at"
  INTO shape_event, shape_kind, shape_capacity, shape_deleted_at
  FROM "floorplan_shape"
  WHERE "id" = NEW."floorplan_shape_id"
  FOR UPDATE;
  IF shape_event IS NULL
    OR shape_event <> NEW."event_id"
    OR shape_kind <> 'TABLE'
    OR shape_deleted_at IS NOT NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SEATING_TABLE_INVALID';
  END IF;
  SELECT count(*) INTO occupied
  FROM "assistant"
  WHERE "floorplan_shape_id" = NEW."floorplan_shape_id"
    AND "deleted_at" IS NULL
    AND "id" <> NEW."id";
  IF occupied >= shape_capacity THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SEATING_TABLE_CAPACITY_EXCEEDED';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "assistant_seating_trigger"
BEFORE INSERT OR UPDATE OF "floorplan_shape_id", "event_id", "deleted_at" ON "assistant"
FOR EACH ROW EXECUTE FUNCTION "assert_assistant_seating"();
