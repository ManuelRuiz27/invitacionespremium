CREATE TABLE "staff_token" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "alias" VARCHAR(80) NOT NULL,
  "token_digest_sha256" CHAR(64) NOT NULL,
  "token_version" INTEGER NOT NULL DEFAULT 1,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expired_at" TIMESTAMPTZ(6),

  CONSTRAINT "staff_token_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_token_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "staff_token_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "staff_token_alias_check"
    CHECK (
      char_length("alias") BETWEEN 1 AND 80
      AND "alias" = btrim("alias")
    ),
  CONSTRAINT "staff_token_digest_check"
    CHECK ("token_digest_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "staff_token_version_check"
    CHECK ("token_version" > 0),
  CONSTRAINT "staff_token_expiration_check"
    CHECK ("expired_at" IS NULL OR "expired_at" >= "created_at")
);

CREATE UNIQUE INDEX "staff_token_token_digest_sha256_key"
  ON "staff_token"("token_digest_sha256");
CREATE INDEX "staff_token_event_id_expired_at_created_at_id_idx"
  ON "staff_token"("event_id", "expired_at", "created_at", "id");

CREATE OR REPLACE FUNCTION validate_staff_token_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_client_id UUID;
  target_creator_id UUID;
  target_status "event_status";
  target_deleted_at TIMESTAMPTZ;
  actor_client_id UUID;
  actor_role "user_role";
  actor_deleted_at TIMESTAMPTZ;
  active_count INTEGER;
BEGIN
  SELECT "client_id", "created_by_user_id", "status", "deleted_at"
  INTO target_client_id, target_creator_id, target_status, target_deleted_at
  FROM "event"
  WHERE "id" = NEW."event_id"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'staff_token event does not exist'
      USING ERRCODE = '23503', CONSTRAINT = 'staff_token_event_required';
  END IF;

  IF target_deleted_at IS NOT NULL OR target_status NOT IN ('active', 'event_day') THEN
    RAISE EXCEPTION 'staff_token requires an operational event'
      USING ERRCODE = 'P0001', CONSTRAINT = 'staff_token_operational_event_required';
  END IF;

  SELECT "client_id", "role", "deleted_at"
  INTO actor_client_id, actor_role, actor_deleted_at
  FROM "app_user"
  WHERE "id" = NEW."created_by_user_id";

  IF NOT FOUND
    OR actor_deleted_at IS NOT NULL
    OR actor_client_id IS DISTINCT FROM target_client_id
    OR actor_role NOT IN ('INDEPENDENT_PLANNER', 'ORGANIZATION_ADMIN', 'ORGANIZATION_PLANNER')
    OR (actor_role = 'ORGANIZATION_PLANNER' AND NEW."created_by_user_id" <> target_creator_id)
  THEN
    RAISE EXCEPTION 'staff_token creator is not authorized for the event'
      USING ERRCODE = 'P0001', CONSTRAINT = 'staff_token_creator_authorized';
  END IF;

  SELECT count(*)
  INTO active_count
  FROM "staff_token"
  WHERE "event_id" = NEW."event_id"
    AND "expired_at" IS NULL;

  IF active_count >= 3 THEN
    RAISE EXCEPTION 'staff_token active limit reached'
      USING ERRCODE = 'P0001', CONSTRAINT = 'staff_token_active_limit';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "staff_token_validate_insert"
  BEFORE INSERT ON "staff_token"
  FOR EACH ROW
  EXECUTE FUNCTION validate_staff_token_insert();

CREATE OR REPLACE FUNCTION protect_staff_token_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'staff_token is append-only'
      USING ERRCODE = 'P0001', CONSTRAINT = 'staff_token_append_only';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."event_id" IS DISTINCT FROM OLD."event_id"
    OR NEW."alias" IS DISTINCT FROM OLD."alias"
    OR NEW."token_digest_sha256" IS DISTINCT FROM OLD."token_digest_sha256"
    OR NEW."token_version" IS DISTINCT FROM OLD."token_version"
    OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'staff_token immutable fields cannot change'
      USING ERRCODE = 'P0001', CONSTRAINT = 'staff_token_immutable_fields';
  END IF;

  IF OLD."expired_at" IS NOT NULL
    AND NEW."expired_at" IS DISTINCT FROM OLD."expired_at"
  THEN
    RAISE EXCEPTION 'staff_token expiration is irreversible'
      USING ERRCODE = 'P0001', CONSTRAINT = 'staff_token_expiration_irreversible';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "staff_token_protect_update"
  BEFORE UPDATE ON "staff_token"
  FOR EACH ROW
  EXECUTE FUNCTION protect_staff_token_mutation();

CREATE TRIGGER "staff_token_protect_delete"
  BEFORE DELETE ON "staff_token"
  FOR EACH ROW
  EXECUTE FUNCTION protect_staff_token_mutation();

CREATE TRIGGER "staff_token_protect_truncate"
  BEFORE TRUNCATE ON "staff_token"
  FOR EACH STATEMENT
  EXECUTE FUNCTION protect_staff_token_mutation();

CREATE OR REPLACE FUNCTION expire_staff_tokens_for_event_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" IN ('closed', 'cancelled')
    AND NEW."status" IS DISTINCT FROM OLD."status"
  THEN
    UPDATE "staff_token"
    SET "expired_at" = transaction_timestamp()
    WHERE "event_id" = NEW."id"
      AND "expired_at" IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "event_expire_staff_tokens"
  AFTER UPDATE OF "status" ON "event"
  FOR EACH ROW
  EXECUTE FUNCTION expire_staff_tokens_for_event_state();
