DO $$
DECLARE
  orphan_event_count bigint;
  orphan_invitation_count bigint;
  orphan_assistant_count bigint;
  orphan_staff_token_count bigint;
  orphan_reverter_count bigint;
BEGIN
  SELECT count(*) INTO orphan_event_count
  FROM "check_in" ci
  LEFT JOIN "event" e ON e."id" = ci."event_id"
  WHERE e."id" IS NULL;

  SELECT count(*) INTO orphan_invitation_count
  FROM "check_in" ci
  LEFT JOIN "invitation" i
    ON i."id" = ci."invitation_id"
   AND i."event_id" = ci."event_id"
  WHERE i."id" IS NULL;

  SELECT count(*) INTO orphan_assistant_count
  FROM "check_in" ci
  LEFT JOIN "assistant" a
    ON a."id" = ci."assistant_id"
   AND a."event_id" = ci."event_id"
   AND a."invitation_id" = ci."invitation_id"
  WHERE a."id" IS NULL;

  SELECT count(*) INTO orphan_staff_token_count
  FROM "check_in" ci
  LEFT JOIN "staff_token" st
    ON st."id" = ci."staff_token_id"
   AND st."event_id" = ci."event_id"
  WHERE st."id" IS NULL;

  SELECT count(*) INTO orphan_reverter_count
  FROM "check_in" ci
  LEFT JOIN "app_user" u ON u."id" = ci."reverted_by_user_id"
  WHERE ci."reverted_by_user_id" IS NOT NULL
    AND u."id" IS NULL;

  IF orphan_event_count > 0
    OR orphan_invitation_count > 0
    OR orphan_assistant_count > 0
    OR orphan_staff_token_count > 0
    OR orphan_reverter_count > 0 THEN
    RAISE EXCEPTION
      'check_in orphan validation failed: event=%, invitation=%, assistant=%, staff_token=%, reverter=%',
      orphan_event_count,
      orphan_invitation_count,
      orphan_assistant_count,
      orphan_staff_token_count,
      orphan_reverter_count
      USING ERRCODE = 'P0001', CONSTRAINT = 'check_in_orphan_validation';
  END IF;
END;
$$;

ALTER TABLE "check_in"
  ALTER COLUMN "id" DROP DEFAULT,
  ADD CONSTRAINT "check_in_event_fkey"
    FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "check_in_invitation_event_fkey"
    FOREIGN KEY ("invitation_id", "event_id")
    REFERENCES "invitation"("id", "event_id") ON DELETE RESTRICT,
  ADD CONSTRAINT "check_in_assistant_event_invitation_fkey"
    FOREIGN KEY ("assistant_id", "event_id", "invitation_id")
    REFERENCES "assistant"("id", "event_id", "invitation_id") ON DELETE RESTRICT,
  ADD CONSTRAINT "check_in_staff_token_event_fkey"
    FOREIGN KEY ("staff_token_id", "event_id")
    REFERENCES "staff_token"("id", "event_id") ON DELETE RESTRICT,
  ADD CONSTRAINT "check_in_reverted_by_user_fkey"
    FOREIGN KEY ("reverted_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION validate_check_in_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  locked_event_status event_status;
  locked_event_deleted_at timestamptz;
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
BEGIN
  IF NEW."reverted_at" IS NOT NULL
    OR NEW."reverted_by_user_id" IS NOT NULL
    OR NEW."revert_idempotency_key" IS NOT NULL THEN
    RAISE EXCEPTION 'check_in cannot be created as reverted'
      USING ERRCODE = 'P0001', CONSTRAINT = 'check_in_insert_not_reverted';
  END IF;

  SELECT e."status", e."deleted_at"
    INTO locked_event_status, locked_event_deleted_at
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

  SELECT a."response_status", a."name", a."anonymized_at", a."deleted_at"
    INTO locked_assistant_status, locked_assistant_name, locked_assistant_anonymized_at, locked_assistant_deleted_at
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

  RETURN NEW;
END;
$$;
