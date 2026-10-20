BEGIN;
ALTER TABLE check_in ADD COLUMN assistant_access_credential_id UUID;
ALTER TABLE assistant_access_credential ADD CONSTRAINT nominal_credential_id_assistant_event_key UNIQUE (id, assistant_id, event_id);
ALTER TABLE check_in ADD CONSTRAINT check_in_credential_assistant_event_fkey
  FOREIGN KEY (assistant_access_credential_id, assistant_id, event_id)
  REFERENCES assistant_access_credential(id, assistant_id, event_id) ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE INDEX check_in_credential_assistant_event_idx ON check_in(assistant_access_credential_id, assistant_id, event_id);

-- Preserve the latest legacy validator (20260729203000); add a strictly separate
-- nominal branch. Parent locks serialize service calls with revoke/reissue.
CREATE OR REPLACE FUNCTION validate_check_in_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  locked_event_status event_status;
  locked_access_mode event_access_mode;
  locked_service_id uuid;
  nominal boolean;
  locked_credential assistant_access_credential%ROWTYPE;
  locked_invitation_mode invitation_mode;
  locked_additional_limit integer;
  locked_contact_anonymized_at timestamptz;
  locked_assistant_primary boolean;
  locked_seat_id uuid;
  locked_seating_mode floorplan_seating_mode;
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

  SELECT e."status", e."deleted_at", e."floorplan_enabled", e."access_mode", e."service_id"
    INTO locked_event_status, locked_event_deleted_at, locked_floorplan_enabled, locked_access_mode, locked_service_id
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

  nominal := locked_access_mode = 'NOMINAL';
  IF locked_access_mode IS NULL THEN
    IF NEW.assistant_access_credential_id IS NOT NULL THEN
      RAISE EXCEPTION 'check_in_nominal_credential_required' USING ERRCODE = '23514';
    END IF;
  ELSIF nominal AND EXISTS (SELECT 1 FROM service WHERE id = locked_service_id AND code = 'ACCESS_CONTROL') THEN
    SELECT * INTO locked_credential FROM assistant_access_credential
      WHERE id = NEW.assistant_access_credential_id AND event_id = NEW.event_id AND assistant_id = NEW.assistant_id
      FOR UPDATE;
    IF NOT FOUND OR locked_credential.revoked_at IS NOT NULL OR locked_credential.qr_token_version <> 1 THEN
      RAISE EXCEPTION 'check_in_nominal_credential_required' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'check_in_access_mode_not_supported' USING ERRCODE = '23514';
  END IF;

  SELECT i."response_status", i."cancelled_at", i."deleted_at", i."contact_id", i."mode", i."additional_assistant_limit"
    INTO locked_invitation_status, locked_invitation_cancelled_at, locked_invitation_deleted_at, locked_contact_id, locked_invitation_mode, locked_additional_limit
    FROM "invitation" i
    WHERE i."id" = NEW."invitation_id"
      AND i."event_id" = NEW."event_id"
    FOR UPDATE;
  IF NOT FOUND OR locked_invitation_status IS DISTINCT FROM (CASE WHEN nominal THEN 'PENDING' ELSE 'CONFIRMED' END)::invitation_response_status
    OR (nominal AND (locked_invitation_mode <> 'INDIVIDUAL' OR locked_additional_limit <> 0))
    OR locked_invitation_cancelled_at IS NOT NULL
    OR locked_invitation_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'check_in requires an active confirmed invitation'
      USING ERRCODE = 'P0001', CONSTRAINT = 'check_in_confirmed_invitation_required';
  END IF;

  SELECT c."event_id", c."deleted_at", c."anonymized_at"
    INTO locked_contact_event_id, locked_contact_deleted_at, locked_contact_anonymized_at
    FROM "contact" c
    WHERE c."id" = locked_contact_id
      AND c."event_id" = NEW."event_id"
    FOR UPDATE;
  IF NOT FOUND OR locked_contact_event_id <> NEW."event_id"
    OR locked_contact_deleted_at IS NOT NULL
    OR (nominal AND locked_contact_anonymized_at IS NOT NULL) THEN
    RAISE EXCEPTION 'check_in requires an active invitation contact'
      USING ERRCODE = 'P0001', CONSTRAINT = 'check_in_active_contact_required';
  END IF;

  SELECT
      a."response_status",
      a."name",
      a."anonymized_at",
      a."deleted_at",
      a."floorplan_shape_id", a."floorplan_seat_id", a."is_primary"
    INTO
      locked_assistant_status,
      locked_assistant_name,
      locked_assistant_anonymized_at,
      locked_assistant_deleted_at,
      locked_assistant_floorplan_shape_id, locked_seat_id, locked_assistant_primary
    FROM "assistant" a
    WHERE a."id" = NEW."assistant_id"
      AND a."event_id" = NEW."event_id"
      AND a."invitation_id" = NEW."invitation_id"
    FOR UPDATE;
  IF NOT FOUND OR locked_assistant_status IS DISTINCT FROM (CASE WHEN nominal THEN 'PENDING' ELSE 'CONFIRMED' END)::assistant_response_status
    OR (nominal AND NOT locked_assistant_primary)
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

    SELECT fs."event_id", fs."kind", fs."deleted_at", f."deleted_at", f."seating_mode"
      INTO locked_shape_event_id, locked_shape_kind, locked_shape_deleted_at, locked_floorplan_deleted_at, locked_seating_mode
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
    IF locked_seating_mode = 'SEAT' THEN
      PERFORM 1 FROM floorplan_seat s
        JOIN floorplan f ON f.id = s.floorplan_id AND f.event_id = s.event_id
        WHERE s.id = locked_seat_id AND s.event_id = NEW.event_id
          AND s.floorplan_shape_id = locked_assistant_floorplan_shape_id
          AND s.deleted_at IS NULL AND NOT s.is_blocked AND f.deleted_at IS NULL
        FOR UPDATE OF s;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'check_in_floorplan_seat_required' USING ERRCODE = '23514', CONSTRAINT = 'check_in_floorplan_seat_required';
      END IF;
    END IF;
  END IF;

  -- The partial unique index remains the final arbiter for concurrent inserts.
  PERFORM 1 FROM check_in WHERE assistant_id = NEW.assistant_id AND reverted_at IS NULL ORDER BY id FOR UPDATE;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION protect_check_in_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor_role user_role;
  actor_client_id uuid;
  actor_deleted_at timestamptz;
  event_client_id uuid;
  event_planner_id uuid;
  event_status event_status;
  event_deleted_at timestamptz;
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'check_in is immutable'
      USING ERRCODE = 'P0001', CONSTRAINT = 'check_in_immutable';
  END IF;
  IF OLD."reverted_at" IS NOT NULL THEN
    RAISE EXCEPTION 'check_in reversal is irreversible'
      USING ERRCODE = 'P0001', CONSTRAINT = 'check_in_reversal_irreversible';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."event_id" IS DISTINCT FROM OLD."event_id"
    OR NEW."invitation_id" IS DISTINCT FROM OLD."invitation_id"
    OR NEW."assistant_id" IS DISTINCT FROM OLD."assistant_id"
    OR NEW."assistant_access_credential_id" IS DISTINCT FROM OLD."assistant_access_credential_id"
    OR NEW."staff_token_id" IS DISTINCT FROM OLD."staff_token_id"
    OR NEW."checked_in_at" IS DISTINCT FROM OLD."checked_in_at"
    OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
    OR NEW."request_signature" IS DISTINCT FROM OLD."request_signature"
    OR NEW."result_snapshot" IS DISTINCT FROM OLD."result_snapshot"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'check_in creation fields are immutable'
      USING ERRCODE = 'P0001', CONSTRAINT = 'check_in_creation_immutable';
  END IF;
  IF NEW."reverted_at" IS NULL OR NEW."reverted_by_user_id" IS NULL OR NEW."revert_idempotency_key" IS NULL THEN
    RAISE EXCEPTION 'check_in reversal must be complete'
      USING ERRCODE = 'P0001', CONSTRAINT = 'check_in_reversal_complete';
  END IF;

  SELECT u."role", u."client_id", u."deleted_at"
    INTO actor_role, actor_client_id, actor_deleted_at
    FROM "app_user" u WHERE u."id" = NEW."reverted_by_user_id";
  SELECT e."client_id", e."assigned_planner_user_id", e."status", e."deleted_at"
    INTO event_client_id, event_planner_id, event_status, event_deleted_at
    FROM "event" e WHERE e."id" = OLD."event_id";
  IF actor_role IS NULL OR event_status IS NULL OR actor_deleted_at IS NOT NULL
    OR actor_role NOT IN ('INDEPENDENT_PLANNER', 'ORGANIZATION_ADMIN', 'ORGANIZATION_PLANNER')
    OR actor_client_id IS DISTINCT FROM event_client_id
    OR (actor_role = 'ORGANIZATION_PLANNER' AND NEW."reverted_by_user_id" IS DISTINCT FROM event_planner_id)
    OR event_deleted_at IS NOT NULL
    OR event_status NOT IN ('active', 'event_day', 'closed') THEN
    RAISE EXCEPTION 'check_in reverter is not authorized'
      USING ERRCODE = 'P0001', CONSTRAINT = 'check_in_reverter_authorized';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
