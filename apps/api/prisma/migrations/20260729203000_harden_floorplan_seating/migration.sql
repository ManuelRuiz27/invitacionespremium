DO $$
DECLARE
  incompatible_count BIGINT;
BEGIN
  SELECT count(*)
  INTO incompatible_count
  FROM "check_in" ci
  JOIN "event" e ON e."id" = ci."event_id"
  JOIN "assistant" a
    ON a."id" = ci."assistant_id"
    AND a."event_id" = ci."event_id"
    AND a."invitation_id" = ci."invitation_id"
  LEFT JOIN "floorplan_shape" fs ON fs."id" = a."floorplan_shape_id"
  LEFT JOIN "floorplan" f
    ON f."id" = fs."floorplan_id"
    AND f."event_id" = fs."event_id"
    AND f."deleted_at" IS NULL
  WHERE ci."reverted_at" IS NULL
    AND e."floorplan_enabled" = TRUE
    AND (
      a."floorplan_shape_id" IS NULL
      OR fs."event_id" IS DISTINCT FROM ci."event_id"
      OR fs."kind" IS DISTINCT FROM 'TABLE'::"floorplan_shape_kind"
      OR fs."deleted_at" IS NOT NULL
      OR f."id" IS NULL
    );

  IF incompatible_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = format('CHECK_IN_FLOORPLAN_PRECHECK_FAILED count=%s', incompatible_count);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION validate_check_in_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  locked_event_status event_status;
  locked_event_deleted_at timestamptz;
  locked_floorplan_enabled boolean;
  locked_token_expired_at timestamptz;
  locked_invitation_status invitation_response_status;
  locked_invitation_cancelled_at timestamptz;
  locked_invitation_deleted_at timestamptz;
  locked_contact_id uuid;
  locked_contact_event_id uuid;
  locked_contact_deleted_at timestamptz;
  locked_assistant_status assistant_response_status;
  locked_assistant_name varchar(160);
  locked_assistant_anonymized_at timestamptz;
  locked_assistant_deleted_at timestamptz;
  locked_assistant_floorplan_shape_id uuid;
  locked_shape_event_id uuid;
  locked_shape_kind floorplan_shape_kind;
  locked_shape_deleted_at timestamptz;
  locked_floorplan_deleted_at timestamptz;
BEGIN
  IF NEW."reverted_at" IS NOT NULL
    OR NEW."reverted_by_user_id" IS NOT NULL
    OR NEW."revert_idempotency_key" IS NOT NULL THEN
    RAISE EXCEPTION 'check_in cannot be created as reverted'
      USING ERRCODE = 'P0001', CONSTRAINT = 'check_in_insert_not_reverted';
  END IF;

  SELECT e."status", e."deleted_at", e."floorplan_enabled"
    INTO locked_event_status, locked_event_deleted_at, locked_floorplan_enabled
    FROM "event" e
    WHERE e."id" = NEW."event_id"
    FOR UPDATE;
  IF NOT FOUND OR locked_event_deleted_at IS NOT NULL
    OR locked_event_status NOT IN ('active', 'event_day') THEN
    RAISE EXCEPTION 'check_in requires an operational event'
      USING ERRCODE = 'P0001', CONSTRAINT = 'check_in_operational_event_required';
  END IF;

  SELECT st."expired_at"
    INTO locked_token_expired_at
    FROM "staff_token" st
    WHERE st."id" = NEW."staff_token_id"
      AND st."event_id" = NEW."event_id"
    FOR UPDATE;
  IF NOT FOUND OR locked_token_expired_at IS NOT NULL THEN
    RAISE EXCEPTION 'check_in requires an active staff token'
      USING ERRCODE = 'P0001', CONSTRAINT = 'check_in_active_staff_token_required';
  END IF;

  SELECT i."response_status", i."cancelled_at", i."deleted_at", i."contact_id"
    INTO locked_invitation_status, locked_invitation_cancelled_at, locked_invitation_deleted_at, locked_contact_id
    FROM "invitation" i
    WHERE i."id" = NEW."invitation_id"
      AND i."event_id" = NEW."event_id"
    FOR UPDATE;
  IF NOT FOUND OR locked_invitation_status <> 'CONFIRMED'
    OR locked_invitation_cancelled_at IS NOT NULL
    OR locked_invitation_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'check_in requires an active confirmed invitation'
      USING ERRCODE = 'P0001', CONSTRAINT = 'check_in_confirmed_invitation_required';
  END IF;

  SELECT c."event_id", c."deleted_at"
    INTO locked_contact_event_id, locked_contact_deleted_at
    FROM "contact" c
    WHERE c."id" = locked_contact_id
      AND c."event_id" = NEW."event_id"
    FOR UPDATE;
  IF NOT FOUND OR locked_contact_event_id <> NEW."event_id"
    OR locked_contact_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'check_in requires an active invitation contact'
      USING ERRCODE = 'P0001', CONSTRAINT = 'check_in_active_contact_required';
  END IF;

  SELECT
      a."response_status",
      a."name",
      a."anonymized_at",
      a."deleted_at",
      a."floorplan_shape_id"
    INTO
      locked_assistant_status,
      locked_assistant_name,
      locked_assistant_anonymized_at,
      locked_assistant_deleted_at,
      locked_assistant_floorplan_shape_id
    FROM "assistant" a
    WHERE a."id" = NEW."assistant_id"
      AND a."event_id" = NEW."event_id"
      AND a."invitation_id" = NEW."invitation_id"
    FOR UPDATE;
  IF NOT FOUND OR locked_assistant_status <> 'CONFIRMED'
    OR locked_assistant_name IS NULL
    OR locked_assistant_anonymized_at IS NOT NULL
    OR locked_assistant_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'check_in requires an active nominal confirmed assistant'
      USING ERRCODE = 'P0001', CONSTRAINT = 'check_in_confirmed_assistant_required';
  END IF;

  IF locked_floorplan_enabled THEN
    IF locked_assistant_floorplan_shape_id IS NULL THEN
      RAISE EXCEPTION 'check_in_floorplan_table_required'
        USING ERRCODE = 'P0001', CONSTRAINT = 'check_in_floorplan_table_required';
    END IF;

    SELECT fs."event_id", fs."kind", fs."deleted_at", f."deleted_at"
      INTO locked_shape_event_id, locked_shape_kind, locked_shape_deleted_at, locked_floorplan_deleted_at
      FROM "floorplan_shape" fs
      JOIN "floorplan" f
        ON f."id" = fs."floorplan_id"
        AND f."event_id" = fs."event_id"
      WHERE fs."id" = locked_assistant_floorplan_shape_id
      FOR UPDATE OF fs;
    IF NOT FOUND
      OR locked_shape_event_id <> NEW."event_id"
      OR locked_shape_kind <> 'TABLE'
      OR locked_shape_deleted_at IS NOT NULL
      OR locked_floorplan_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'check_in_floorplan_table_required'
        USING ERRCODE = 'P0001', CONSTRAINT = 'check_in_floorplan_table_required';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
