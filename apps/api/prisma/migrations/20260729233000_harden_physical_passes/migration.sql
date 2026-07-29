DO $$
DECLARE
  invalid_count bigint;
BEGIN
  SELECT count(*) INTO invalid_count
  FROM "physical_pass" p
  JOIN "event" e ON e."id" = p."event_id"
  LEFT JOIN "staff_token" st ON st."id" = p."used_by_staff_token_id"
  WHERE
    (p."used_at" IS NOT NULL AND st."event_id" IS DISTINCT FROM p."event_id")
    OR p."pass_number" <= 0;
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'physical pass hardening precheck failed: % incompatible rows', invalid_count
      USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_hardening_precheck';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION "validate_physical_pass"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  locked_service service_code;
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

  SELECT s."code", e."capacity", e."floorplan_enabled", e."deleted_at", e."status"
  INTO locked_service, locked_capacity, locked_floorplan_enabled, locked_event_deleted_at, locked_event_status
  FROM "event" e
  LEFT JOIN "service" s ON s."id" = e."service_id"
  WHERE e."id" = NEW."event_id"
  FOR UPDATE OF e;

  IF NOT FOUND OR locked_service IS DISTINCT FROM 'PHYSICAL_QR' OR locked_event_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'PHYSICAL_PASS_SERVICE_MISMATCH'
      USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_service_mismatch';
  END IF;
  IF TG_OP = 'INSERT'
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
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."used_at" IS NOT NULL THEN
      RAISE EXCEPTION 'PHYSICAL_PASS_USED_IMMUTABLE'
        USING ERRCODE = 'P0001', CONSTRAINT = 'physical_pass_used_immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW."event_id" IS DISTINCT FROM OLD."event_id"
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
