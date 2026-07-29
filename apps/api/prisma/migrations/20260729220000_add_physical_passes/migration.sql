DO $$
DECLARE
  invalid_count bigint;
BEGIN
  SELECT count(*) INTO invalid_count
  FROM "event" e
  JOIN "service" s ON s."id" = e."service_id"
  WHERE s."code" = 'PHYSICAL_QR' AND e."capacity" IS NOT NULL AND e."capacity" <= 0;
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'physical pass precheck failed: % incompatible events', invalid_count
      USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_precheck';
  END IF;
END
$$;

CREATE TABLE "physical_pass" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "pass_number" INTEGER NOT NULL,
  "floorplan_shape_id" UUID,
  "qr_token_nonce" VARCHAR(64) NOT NULL,
  "qr_token_version" INTEGER NOT NULL DEFAULT 1,
  "used_at" TIMESTAMPTZ(6),
  "used_by_staff_token_id" UUID,
  "use_idempotency_key" VARCHAR(128),
  "use_request_signature" CHAR(64),
  "use_result_snapshot" JSONB,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "physical_pass_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "physical_pass_number_positive" CHECK ("pass_number" > 0),
  CONSTRAINT "physical_pass_token_version_positive" CHECK ("qr_token_version" > 0),
  CONSTRAINT "physical_pass_nonce_format" CHECK ("qr_token_nonce" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "physical_pass_use_signature_format"
    CHECK ("use_request_signature" IS NULL OR "use_request_signature" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "physical_pass_use_complete" CHECK (
    (
      "used_at" IS NULL
      AND "used_by_staff_token_id" IS NULL
      AND "use_idempotency_key" IS NULL
      AND "use_request_signature" IS NULL
      AND "use_result_snapshot" IS NULL
    )
    OR
    (
      "used_at" IS NOT NULL
      AND "used_by_staff_token_id" IS NOT NULL
      AND "use_idempotency_key" IS NOT NULL
      AND "use_request_signature" IS NOT NULL
      AND "use_result_snapshot" IS NOT NULL
    )
  )
);

CREATE TABLE "physical_pass_generation_operation" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "request_signature" CHAR(64) NOT NULL,
  "result_snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "physical_pass_generation_operation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "physical_pass_generation_signature_format"
    CHECK ("request_signature" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "physical_pass_event_id_pass_number_key"
  ON "physical_pass"("event_id", "pass_number");
CREATE UNIQUE INDEX "physical_pass_id_event_id_key"
  ON "physical_pass"("id", "event_id");
CREATE UNIQUE INDEX "physical_pass_qr_token_nonce_key"
  ON "physical_pass"("qr_token_nonce");
CREATE UNIQUE INDEX "physical_pass_use_idempotency_key_key"
  ON "physical_pass"("use_idempotency_key") WHERE "use_idempotency_key" IS NOT NULL;
CREATE INDEX "physical_pass_event_id_deleted_at_pass_number_idx"
  ON "physical_pass"("event_id", "deleted_at", "pass_number");
CREATE INDEX "physical_pass_floorplan_shape_id_event_id_deleted_at_idx"
  ON "physical_pass"("floorplan_shape_id", "event_id", "deleted_at");
CREATE INDEX "physical_pass_used_by_staff_token_id_event_id_idx"
  ON "physical_pass"("used_by_staff_token_id", "event_id");
CREATE UNIQUE INDEX "physical_pass_generation_operation_idempotency_key_key"
  ON "physical_pass_generation_operation"("idempotency_key");
CREATE INDEX "physical_pass_generation_operation_event_id_created_at_idx"
  ON "physical_pass_generation_operation"("event_id", "created_at");

ALTER TABLE "physical_pass"
  ADD CONSTRAINT "physical_pass_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "physical_pass_floorplan_shape_id_event_id_fkey"
  FOREIGN KEY ("floorplan_shape_id", "event_id")
  REFERENCES "floorplan_shape"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "physical_pass_used_by_staff_token_id_event_id_fkey"
  FOREIGN KEY ("used_by_staff_token_id", "event_id")
  REFERENCES "staff_token"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "physical_pass_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "physical_pass_generation_operation"
  ADD CONSTRAINT "physical_pass_generation_operation_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "validate_physical_pass"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  locked_service service_code;
  locked_capacity integer;
  locked_floorplan_enabled boolean;
  locked_event_deleted_at timestamptz;
  locked_shape_kind floorplan_shape_kind;
  locked_shape_deleted_at timestamptz;
  locked_shape_floorplan uuid;
  active_floorplan uuid;
  shape_capacity integer;
  occupied integer;
BEGIN
  IF TG_OP = 'INSERT' AND NEW."used_at" IS NOT NULL THEN
    RAISE EXCEPTION 'PHYSICAL_PASS_USED_IMMUTABLE'
      USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_used_immutable';
  END IF;

  SELECT s."code", e."capacity", e."floorplan_enabled", e."deleted_at"
  INTO locked_service, locked_capacity, locked_floorplan_enabled, locked_event_deleted_at
  FROM "event" e
  LEFT JOIN "service" s ON s."id" = e."service_id"
  WHERE e."id" = NEW."event_id"
  FOR UPDATE OF e;

  IF NOT FOUND OR locked_service IS DISTINCT FROM 'PHYSICAL_QR' OR locked_event_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'PHYSICAL_PASS_SERVICE_MISMATCH'
      USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_service_mismatch';
  END IF;
  IF locked_capacity IS NULL OR locked_capacity <= 0 THEN
    RAISE EXCEPTION 'PHYSICAL_PASS_CAPACITY_EXCEEDED'
      USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_event_capacity';
  END IF;

  SELECT count(*) INTO occupied
  FROM "physical_pass"
  WHERE "event_id" = NEW."event_id"
    AND "deleted_at" IS NULL
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
         AND "deleted_at" IS NULL AND "id" <> NEW."id")
    INTO occupied;
    IF NEW."deleted_at" IS NULL AND occupied >= shape_capacity THEN
      RAISE EXCEPTION 'PHYSICAL_PASS_CAPACITY_EXCEEDED'
        USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_table_capacity';
    END IF;
  END IF;

  IF NEW."used_at" IS NOT NULL THEN
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

CREATE TRIGGER "physical_pass_validate_trigger"
BEFORE INSERT OR UPDATE ON "physical_pass"
FOR EACH ROW EXECUTE FUNCTION "validate_physical_pass"();

CREATE OR REPLACE FUNCTION "protect_physical_pass"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."used_at" IS NOT NULL THEN
      RAISE EXCEPTION 'PHYSICAL_PASS_USED_IMMUTABLE'
        USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_used_immutable';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."used_at" IS NOT NULL THEN
    IF NEW."event_id" IS DISTINCT FROM OLD."event_id"
      OR NEW."pass_number" IS DISTINCT FROM OLD."pass_number"
      OR NEW."floorplan_shape_id" IS DISTINCT FROM OLD."floorplan_shape_id"
      OR NEW."qr_token_nonce" IS DISTINCT FROM OLD."qr_token_nonce"
      OR NEW."qr_token_version" IS DISTINCT FROM OLD."qr_token_version"
      OR NEW."used_at" IS DISTINCT FROM OLD."used_at"
      OR NEW."used_by_staff_token_id" IS DISTINCT FROM OLD."used_by_staff_token_id"
      OR NEW."use_idempotency_key" IS DISTINCT FROM OLD."use_idempotency_key"
      OR NEW."use_request_signature" IS DISTINCT FROM OLD."use_request_signature"
      OR NEW."use_result_snapshot" IS DISTINCT FROM OLD."use_result_snapshot"
      OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
      OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
      OR NEW."deleted_at" IS DISTINCT FROM OLD."deleted_at"
    THEN
      RAISE EXCEPTION 'PHYSICAL_PASS_USED_IMMUTABLE'
        USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_used_immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "physical_pass_protect_trigger"
BEFORE UPDATE OR DELETE ON "physical_pass"
FOR EACH ROW EXECUTE FUNCTION "protect_physical_pass"();

CREATE OR REPLACE FUNCTION "protect_physical_pass_generation_operation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'PHYSICAL_PASS_GENERATION_OPERATION_IMMUTABLE'
    USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_generation_operation_immutable';
END;
$$;

CREATE TRIGGER "physical_pass_generation_operation_immutable_trigger"
BEFORE UPDATE OR DELETE OR TRUNCATE ON "physical_pass_generation_operation"
FOR EACH STATEMENT EXECUTE FUNCTION "protect_physical_pass_generation_operation"();

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
       WHERE "floorplan_shape_id" = OLD."id" AND "deleted_at" IS NULL)
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
     WHERE "floorplan_shape_id" = NEW."floorplan_shape_id" AND "deleted_at" IS NULL)
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
  IF NEW."capacity" IS DISTINCT FROM OLD."capacity"
    OR NEW."floorplan_enabled" IS DISTINCT FROM OLD."floorplan_enabled"
    OR NEW."service_id" IS DISTINCT FROM OLD."service_id"
  THEN
    SELECT count(*) INTO active_passes
    FROM "physical_pass" WHERE "event_id" = OLD."id" AND "deleted_at" IS NULL;
    IF active_passes > 0 THEN
      IF NEW."capacity" IS NULL OR NEW."capacity" < active_passes THEN
        RAISE EXCEPTION 'PHYSICAL_PASS_CAPACITY_EXCEEDED'
          USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_event_capacity';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM "service" WHERE "id" = NEW."service_id" AND "code" = 'PHYSICAL_QR'
      ) THEN
        RAISE EXCEPTION 'PHYSICAL_PASS_SERVICE_MISMATCH'
          USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_service_mismatch';
      END IF;
      SELECT count(*) INTO invalid_tables
      FROM "physical_pass"
      WHERE "event_id" = OLD."id" AND "deleted_at" IS NULL
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

CREATE TRIGGER "event_physical_pass_configuration_trigger"
BEFORE UPDATE OF "capacity", "floorplan_enabled", "service_id" ON "event"
FOR EACH ROW EXECUTE FUNCTION "protect_event_physical_pass_configuration"();
