CREATE UNIQUE INDEX "staff_token_id_event_id_key"
  ON "staff_token"("id", "event_id");
CREATE UNIQUE INDEX "assistant_id_event_id_invitation_id_key"
  ON "assistant"("id", "event_id", "invitation_id");

CREATE TABLE "check_in" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "invitation_id" UUID NOT NULL,
  "assistant_id" UUID NOT NULL,
  "staff_token_id" UUID NOT NULL,
  "checked_in_at" TIMESTAMPTZ(6) NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "request_signature" CHAR(64) NOT NULL,
  "result_snapshot" JSONB NOT NULL,
  "reverted_at" TIMESTAMPTZ(6),
  "reverted_by_user_id" UUID,
  "revert_idempotency_key" VARCHAR(128),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "check_in_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "check_in_time_order_check"
    CHECK ("checked_in_at" >= "created_at" AND ("reverted_at" IS NULL OR "reverted_at" >= "checked_in_at")),
  CONSTRAINT "check_in_reversal_complete_check"
    CHECK (
      ("reverted_at" IS NULL AND "reverted_by_user_id" IS NULL AND "revert_idempotency_key" IS NULL)
      OR
      ("reverted_at" IS NOT NULL AND "reverted_by_user_id" IS NOT NULL AND "revert_idempotency_key" IS NOT NULL)
    ),
  CONSTRAINT "check_in_signature_check"
    CHECK ("request_signature" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "check_in_snapshot_object_check"
    CHECK (jsonb_typeof("result_snapshot") = 'object')
);

CREATE UNIQUE INDEX "check_in_idempotency_key_key" ON "check_in"("idempotency_key");
CREATE UNIQUE INDEX "check_in_revert_idempotency_key_key"
  ON "check_in"("revert_idempotency_key") WHERE "revert_idempotency_key" IS NOT NULL;
CREATE UNIQUE INDEX "check_in_one_active_per_assistant"
  ON "check_in"("assistant_id") WHERE "reverted_at" IS NULL;
CREATE INDEX "check_in_event_id_invitation_id_checked_in_at_id_idx"
  ON "check_in"("event_id", "invitation_id", "checked_in_at", "id");
CREATE INDEX "check_in_assistant_id_reverted_at_idx"
  ON "check_in"("assistant_id", "reverted_at");

CREATE OR REPLACE FUNCTION validate_check_in_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  event_status event_status;
  event_deleted_at timestamptz;
  token_expired_at timestamptz;
  invitation_status invitation_response_status;
  invitation_cancelled_at timestamptz;
  invitation_deleted_at timestamptz;
  contact_deleted_at timestamptz;
  assistant_status assistant_response_status;
  assistant_name varchar(160);
  assistant_anonymized_at timestamptz;
  assistant_deleted_at timestamptz;
BEGIN
  SELECT e."status", e."deleted_at"
    INTO event_status, event_deleted_at
    FROM "event" e WHERE e."id" = NEW."event_id";
  IF event_status IS NULL OR event_deleted_at IS NOT NULL OR event_status NOT IN ('active', 'event_day') THEN
    RAISE EXCEPTION 'check_in requires an operational event'
      USING ERRCODE = 'P0001', CONSTRAINT = 'check_in_operational_event_required';
  END IF;

  SELECT st."expired_at" INTO token_expired_at
    FROM "staff_token" st
    WHERE st."id" = NEW."staff_token_id" AND st."event_id" = NEW."event_id";
  IF NOT FOUND OR token_expired_at IS NOT NULL THEN
    RAISE EXCEPTION 'check_in requires an active staff token'
      USING ERRCODE = 'P0001', CONSTRAINT = 'check_in_active_staff_token_required';
  END IF;

  SELECT i."response_status", i."cancelled_at", i."deleted_at", c."deleted_at"
    INTO invitation_status, invitation_cancelled_at, invitation_deleted_at, contact_deleted_at
    FROM "invitation" i
    JOIN "contact" c ON c."id" = i."contact_id" AND c."event_id" = i."event_id"
    WHERE i."id" = NEW."invitation_id" AND i."event_id" = NEW."event_id";
  IF NOT FOUND OR invitation_status <> 'CONFIRMED' OR invitation_cancelled_at IS NOT NULL
    OR invitation_deleted_at IS NOT NULL OR contact_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'check_in requires an active confirmed invitation'
      USING ERRCODE = 'P0001', CONSTRAINT = 'check_in_confirmed_invitation_required';
  END IF;

  SELECT a."response_status", a."name", a."anonymized_at", a."deleted_at"
    INTO assistant_status, assistant_name, assistant_anonymized_at, assistant_deleted_at
    FROM "assistant" a
    WHERE a."id" = NEW."assistant_id"
      AND a."event_id" = NEW."event_id"
      AND a."invitation_id" = NEW."invitation_id";
  IF NOT FOUND OR assistant_status <> 'CONFIRMED' OR assistant_name IS NULL
    OR assistant_anonymized_at IS NOT NULL OR assistant_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'check_in requires an active nominal confirmed assistant'
      USING ERRCODE = 'P0001', CONSTRAINT = 'check_in_confirmed_assistant_required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "check_in_validate_insert"
  BEFORE INSERT ON "check_in"
  FOR EACH ROW EXECUTE FUNCTION validate_check_in_insert();

CREATE OR REPLACE FUNCTION protect_check_in_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor_role user_role;
  actor_client_id uuid;
  actor_deleted_at timestamptz;
  event_client_id uuid;
  event_creator_id uuid;
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
  SELECT e."client_id", e."created_by_user_id", e."status", e."deleted_at"
    INTO event_client_id, event_creator_id, event_status, event_deleted_at
    FROM "event" e WHERE e."id" = OLD."event_id";
  IF actor_deleted_at IS NOT NULL
    OR actor_role NOT IN ('INDEPENDENT_PLANNER', 'ORGANIZATION_ADMIN', 'ORGANIZATION_PLANNER')
    OR actor_client_id IS DISTINCT FROM event_client_id
    OR (actor_role = 'ORGANIZATION_PLANNER' AND NEW."reverted_by_user_id" <> event_creator_id)
    OR event_deleted_at IS NOT NULL
    OR event_status NOT IN ('active', 'event_day', 'closed') THEN
    RAISE EXCEPTION 'check_in reverter is not authorized'
      USING ERRCODE = 'P0001', CONSTRAINT = 'check_in_reverter_authorized';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "check_in_protect_update"
  BEFORE UPDATE ON "check_in"
  FOR EACH ROW EXECUTE FUNCTION protect_check_in_mutation();
CREATE TRIGGER "check_in_protect_delete"
  BEFORE DELETE ON "check_in"
  FOR EACH ROW EXECUTE FUNCTION protect_check_in_mutation();
CREATE TRIGGER "check_in_protect_truncate"
  BEFORE TRUNCATE ON "check_in"
  FOR EACH STATEMENT EXECUTE FUNCTION protect_check_in_mutation();
