ALTER TABLE "contact_import_preview"
  ALTER COLUMN "normalized_rows" DROP NOT NULL,
  ADD COLUMN "pii_purged_at" TIMESTAMPTZ(6);

ALTER TABLE "contact_import_preview"
  DROP CONSTRAINT "contact_import_preview_rows_check",
  DROP CONSTRAINT "contact_import_preview_commit_check";

UPDATE "contact_import_preview"
SET "normalized_rows" = NULL
WHERE "committed_at" IS NOT NULL;

ALTER TABLE "contact_import_preview"
  ADD CONSTRAINT "contact_import_preview_state_check" CHECK (
    (
      "committed_at" IS NULL
      AND "commit_idempotency_key" IS NULL
      AND "result_snapshot" IS NULL
      AND "pii_purged_at" IS NULL
      AND "normalized_rows" IS NOT NULL
      AND jsonb_typeof("normalized_rows") = 'array'
      AND jsonb_array_length("normalized_rows") = "total_rows"
    )
    OR (
      "committed_at" IS NOT NULL
      AND "commit_idempotency_key" IS NOT NULL
      AND char_length("commit_idempotency_key") BETWEEN 8 AND 128
      AND "result_snapshot" IS NOT NULL
      AND "normalized_rows" IS NULL
    )
  );

CREATE FUNCTION "contact_import_snapshot_is_redacted"("snapshot" JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    jsonb_typeof("snapshot") = 'object'
    AND jsonb_typeof("snapshot" -> 'contacts') = 'array'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements("snapshot" -> 'contacts') AS "contact"
      WHERE
        jsonb_typeof("contact") <> 'object'
        OR NOT ("contact" ? 'name')
        OR "contact" -> 'name' IS DISTINCT FROM 'null'::jsonb
        OR NOT ("contact" ? 'whatsappPhone')
        OR "contact" -> 'whatsappPhone' IS DISTINCT FROM 'null'::jsonb
        OR NOT ("contact" ? 'anonymizedAt')
        OR "contact" -> 'anonymizedAt' IS NULL
        OR "contact" -> 'anonymizedAt' = 'null'::jsonb
    );
$$;

CREATE FUNCTION "enforce_contact_import_preview_privacy"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."committed_at" IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW."event_id" IS DISTINCT FROM OLD."event_id"
    OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
    OR NEW."commit_idempotency_key" IS DISTINCT FROM OLD."commit_idempotency_key"
    OR NEW."committed_at" IS DISTINCT FROM OLD."committed_at"
  THEN
    RAISE EXCEPTION 'confirmed contact_import_preview identity is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."normalized_rows" IS NOT NULL THEN
    RAISE EXCEPTION 'confirmed contact_import_preview cannot retain normalized rows'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."pii_purged_at" IS NOT NULL THEN
    IF NEW."pii_purged_at" IS DISTINCT FROM OLD."pii_purged_at"
      OR NEW."result_snapshot" IS DISTINCT FROM OLD."result_snapshot"
    THEN
      RAISE EXCEPTION 'redacted contact_import_preview is immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."result_snapshot" IS DISTINCT FROM OLD."result_snapshot"
    OR NEW."pii_purged_at" IS NOT NULL
  THEN
    IF NEW."pii_purged_at" IS NULL
      OR NOT "contact_import_snapshot_is_redacted"(NEW."result_snapshot")
    THEN
      RAISE EXCEPTION 'contact_import_preview privacy redaction is invalid'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION "prevent_confirmed_contact_import_preview_delete"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."committed_at" IS NOT NULL THEN
    RAISE EXCEPTION 'confirmed contact_import_preview cannot be deleted'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

CREATE FUNCTION "prevent_contact_import_preview_truncate"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'contact_import_preview cannot be truncated'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "contact_import_preview_enforce_privacy"
  BEFORE UPDATE ON "contact_import_preview"
  FOR EACH ROW
  EXECUTE FUNCTION "enforce_contact_import_preview_privacy"();

CREATE TRIGGER "contact_import_preview_prevent_confirmed_delete"
  BEFORE DELETE ON "contact_import_preview"
  FOR EACH ROW
  EXECUTE FUNCTION "prevent_confirmed_contact_import_preview_delete"();

CREATE TRIGGER "contact_import_preview_prevent_truncate"
  BEFORE TRUNCATE ON "contact_import_preview"
  FOR EACH STATEMENT
  EXECUTE FUNCTION "prevent_contact_import_preview_truncate"();
