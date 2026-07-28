CREATE TYPE "invitation_mode" AS ENUM ('INDIVIDUAL', 'FAMILY_NOMINAL');
CREATE TYPE "invitation_response_status" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');
CREATE TYPE "assistant_response_status" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

ALTER TABLE "contact"
  ADD CONSTRAINT "contact_id_event_id_key" UNIQUE ("id", "event_id");

CREATE TABLE "invitation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "contact_id" UUID NOT NULL,
  "mode" "invitation_mode" NOT NULL DEFAULT 'INDIVIDUAL',
  "response_status" "invitation_response_status" NOT NULL DEFAULT 'PENDING',
  "additional_assistant_limit" INTEGER NOT NULL DEFAULT 0,
  "invitation_token_nonce" VARCHAR(64) NOT NULL,
  "invitation_token_version" INTEGER NOT NULL DEFAULT 1,
  "qr_token_nonce" VARCHAR(64) NOT NULL,
  "qr_token_version" INTEGER NOT NULL DEFAULT 1,
  "cancelled_at" TIMESTAMPTZ(6),
  "cancelled_by_user_id" UUID,
  "cancel_idempotency_key" VARCHAR(128),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),

  CONSTRAINT "invitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invitation_contact_id_key" UNIQUE ("contact_id"),
  CONSTRAINT "invitation_contact_id_event_id_key" UNIQUE ("contact_id", "event_id"),
  CONSTRAINT "invitation_id_event_id_key" UNIQUE ("id", "event_id"),
  CONSTRAINT "invitation_invitation_token_nonce_key" UNIQUE ("invitation_token_nonce"),
  CONSTRAINT "invitation_qr_token_nonce_key" UNIQUE ("qr_token_nonce"),
  CONSTRAINT "invitation_cancel_idempotency_key_key" UNIQUE ("cancel_idempotency_key"),
  CONSTRAINT "invitation_limits_tokens_check" CHECK (
    "additional_assistant_limit" >= 0
    AND "invitation_token_version" = 1
    AND "qr_token_version" = 1
    AND "invitation_token_nonce" ~ '^[0-9a-f]{64}$'
    AND "qr_token_nonce" ~ '^[0-9a-f]{64}$'
    AND "invitation_token_nonce" <> "qr_token_nonce"
  ),
  CONSTRAINT "invitation_cancellation_check" CHECK (
    (
      "cancelled_at" IS NULL
      AND "cancelled_by_user_id" IS NULL
      AND "cancel_idempotency_key" IS NULL
    )
    OR (
      "cancelled_at" IS NOT NULL
      AND "cancelled_by_user_id" IS NOT NULL
      AND "cancel_idempotency_key" IS NOT NULL
      AND char_length("cancel_idempotency_key") BETWEEN 8 AND 128
    )
  )
);

CREATE TABLE "assistant" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "invitation_id" UUID NOT NULL,
  "name" VARCHAR(160),
  "is_primary" BOOLEAN NOT NULL DEFAULT FALSE,
  "response_status" "assistant_response_status" NOT NULL DEFAULT 'PENDING',
  "anonymized_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),

  CONSTRAINT "assistant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assistant_name_privacy_check" CHECK (
    (
      "anonymized_at" IS NULL
      AND "name" IS NOT NULL
      AND "name" = btrim("name")
      AND char_length("name") BETWEEN 1 AND 160
    )
    OR (
      "anonymized_at" IS NOT NULL
      AND "name" IS NULL
    )
  )
);

CREATE INDEX "invitation_event_id_deleted_at_created_at_idx"
  ON "invitation"("event_id", "deleted_at", "created_at");
CREATE INDEX "invitation_cancelled_at_idx" ON "invitation"("cancelled_at");
CREATE INDEX "assistant_invitation_id_deleted_at_created_at_idx"
  ON "assistant"("invitation_id", "deleted_at", "created_at");
CREATE INDEX "assistant_event_id_deleted_at_idx"
  ON "assistant"("event_id", "deleted_at");
CREATE UNIQUE INDEX "assistant_one_active_primary_per_invitation"
  ON "assistant"("invitation_id")
  WHERE "is_primary" AND "deleted_at" IS NULL;

ALTER TABLE "invitation"
  ADD CONSTRAINT "invitation_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "event"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invitation_contact_same_event_fkey"
  FOREIGN KEY ("contact_id", "event_id") REFERENCES "contact"("id", "event_id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invitation_cancelled_by_user_id_fkey"
  FOREIGN KEY ("cancelled_by_user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assistant"
  ADD CONSTRAINT "assistant_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "event"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "assistant_invitation_same_event_fkey"
  FOREIGN KEY ("invitation_id", "event_id") REFERENCES "invitation"("id", "event_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "invitation" (
  "event_id",
  "contact_id",
  "invitation_token_nonce",
  "qr_token_nonce",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  "contact"."event_id",
  "contact"."id",
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  "contact"."created_at",
  "contact"."updated_at",
  "contact"."deleted_at"
FROM "contact"
ON CONFLICT ("contact_id") DO NOTHING;

INSERT INTO "assistant" (
  "event_id",
  "invitation_id",
  "name",
  "is_primary",
  "anonymized_at",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  "contact"."event_id",
  "invitation"."id",
  CASE WHEN "contact"."anonymized_at" IS NULL THEN "contact"."name" ELSE NULL END,
  TRUE,
  "contact"."anonymized_at",
  "contact"."created_at",
  "contact"."updated_at",
  "contact"."deleted_at"
FROM "invitation"
JOIN "contact" ON "contact"."id" = "invitation"."contact_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "assistant"
  WHERE "assistant"."invitation_id" = "invitation"."id"
    AND "assistant"."is_primary"
);

CREATE FUNCTION "validate_invitation_assistant_invariants"("target_invitation_id" UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  "active_count" INTEGER;
  "primary_count" INTEGER;
  "allowed_additional" INTEGER;
  "invitation_deleted_at" TIMESTAMPTZ(6);
BEGIN
  SELECT "additional_assistant_limit", "deleted_at"
  INTO "allowed_additional", "invitation_deleted_at"
  FROM "invitation"
  WHERE "id" = "target_invitation_id";

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    count(*) FILTER (WHERE "deleted_at" IS NULL),
    count(*) FILTER (WHERE "deleted_at" IS NULL AND "is_primary")
  INTO "active_count", "primary_count"
  FROM "assistant"
  WHERE "invitation_id" = "target_invitation_id";

  IF "invitation_deleted_at" IS NULL THEN
    IF "primary_count" <> 1 THEN
      RAISE EXCEPTION 'invitation must have exactly one active primary assistant'
        USING ERRCODE = '23514';
    END IF;
    IF "active_count" > 1 + "allowed_additional" THEN
      RAISE EXCEPTION 'invitation active assistant limit exceeded'
        USING ERRCODE = '23514';
    END IF;
  ELSIF "active_count" <> 0 THEN
    RAISE EXCEPTION 'deleted invitation cannot have active assistants'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION "enforce_invitation_immutability"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."event_id" IS DISTINCT FROM OLD."event_id"
    OR NEW."contact_id" IS DISTINCT FROM OLD."contact_id"
    OR NEW."invitation_token_nonce" IS DISTINCT FROM OLD."invitation_token_nonce"
    OR NEW."invitation_token_version" IS DISTINCT FROM OLD."invitation_token_version"
    OR NEW."qr_token_nonce" IS DISTINCT FROM OLD."qr_token_nonce"
    OR NEW."qr_token_version" IS DISTINCT FROM OLD."qr_token_version"
  THEN
    RAISE EXCEPTION 'invitation identity and token material are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."cancelled_at" IS NOT NULL
    AND (
      NEW."cancelled_at" IS DISTINCT FROM OLD."cancelled_at"
      OR NEW."cancelled_by_user_id" IS DISTINCT FROM OLD."cancelled_by_user_id"
      OR NEW."cancel_idempotency_key" IS DISTINCT FROM OLD."cancel_idempotency_key"
    )
  THEN
    RAISE EXCEPTION 'cancelled invitation cannot be reactivated or changed'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION "protect_primary_assistant"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  "parent_deleted_at" TIMESTAMPTZ(6);
BEGIN
  IF TG_OP = 'DELETE' AND OLD."is_primary" THEN
    RAISE EXCEPTION 'primary assistant cannot be deleted'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."event_id" IS DISTINCT FROM OLD."event_id"
      OR NEW."invitation_id" IS DISTINCT FROM OLD."invitation_id"
    THEN
      RAISE EXCEPTION 'assistant ownership is immutable'
        USING ERRCODE = '23514';
    END IF;

    IF OLD."is_primary" AND NEW."is_primary" IS DISTINCT FROM OLD."is_primary" THEN
      RAISE EXCEPTION 'primary assistant cannot be reassigned'
        USING ERRCODE = '23514';
    END IF;

    IF OLD."is_primary"
      AND OLD."deleted_at" IS NULL
      AND NEW."deleted_at" IS NOT NULL
    THEN
      SELECT "deleted_at" INTO "parent_deleted_at"
      FROM "invitation"
      WHERE "id" = OLD."invitation_id";
      IF "parent_deleted_at" IS NULL THEN
        RAISE EXCEPTION 'primary assistant cannot be deleted directly'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    IF OLD."deleted_at" IS NOT NULL AND NEW."deleted_at" IS NULL THEN
      RAISE EXCEPTION 'assistant cannot be reactivated directly'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE FUNCTION "check_invitation_after_assistant_change"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM "validate_invitation_assistant_invariants"(COALESCE(NEW."invitation_id", OLD."invitation_id"));
  IF TG_OP = 'UPDATE' AND NEW."invitation_id" IS DISTINCT FROM OLD."invitation_id" THEN
    PERFORM "validate_invitation_assistant_invariants"(OLD."invitation_id");
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION "check_invitation_after_invitation_change"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM "validate_invitation_assistant_invariants"(NEW."id");
  RETURN NULL;
END;
$$;

CREATE TRIGGER "invitation_enforce_immutability"
  BEFORE UPDATE ON "invitation"
  FOR EACH ROW
  EXECUTE FUNCTION "enforce_invitation_immutability"();

CREATE TRIGGER "assistant_protect_primary"
  BEFORE UPDATE OR DELETE ON "assistant"
  FOR EACH ROW
  EXECUTE FUNCTION "protect_primary_assistant"();

CREATE CONSTRAINT TRIGGER "assistant_validate_invitation"
  AFTER INSERT OR UPDATE OR DELETE ON "assistant"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION "check_invitation_after_assistant_change"();

CREATE CONSTRAINT TRIGGER "invitation_validate_assistants"
  AFTER INSERT OR UPDATE OF "additional_assistant_limit", "deleted_at" ON "invitation"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION "check_invitation_after_invitation_change"();
