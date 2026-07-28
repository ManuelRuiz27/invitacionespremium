CREATE TABLE "contact_group" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "normalized_name" VARCHAR(160) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "contact_group_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contact_group_name_check" CHECK (
    "name" = btrim("name")
    AND char_length("name") BETWEEN 1 AND 160
    AND "normalized_name" =
      lower(regexp_replace(btrim("name"), '\s+', ' ', 'g'))
  ),
  CONSTRAINT "contact_group_id_event_id_key" UNIQUE ("id", "event_id"),
  CONSTRAINT "contact_group_event_id_normalized_name_key"
    UNIQUE ("event_id", "normalized_name")
);

CREATE TABLE "contact" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "group_id" UUID,
  "name" VARCHAR(160),
  "whatsapp_phone_normalized" VARCHAR(20),
  "anonymized_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),

  CONSTRAINT "contact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contact_name_check" CHECK (
    "name" IS NULL
    OR ("name" = btrim("name") AND char_length("name") BETWEEN 1 AND 160)
  ),
  CONSTRAINT "contact_anonymization_check" CHECK (
    (
      "anonymized_at" IS NULL
      AND "name" IS NOT NULL
      AND "whatsapp_phone_normalized" IS NOT NULL
    )
    OR (
      "anonymized_at" IS NOT NULL
      AND "name" IS NULL
      AND "whatsapp_phone_normalized" IS NULL
    )
  ),
  CONSTRAINT "contact_phone_e164_check" CHECK (
    "whatsapp_phone_normalized" IS NULL
    OR "whatsapp_phone_normalized" ~ '^\+[1-9][0-9]{7,14}$'
  )
);

CREATE TABLE "contact_import_preview" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "total_rows" INTEGER NOT NULL,
  "valid_rows" INTEGER NOT NULL,
  "invalid_rows" INTEGER NOT NULL,
  "normalized_rows" JSONB NOT NULL,
  "committed_at" TIMESTAMPTZ(6),
  "commit_idempotency_key" VARCHAR(128),
  "result_snapshot" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "contact_import_preview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contact_import_preview_counts_check" CHECK (
    "total_rows" BETWEEN 0 AND 150
    AND "valid_rows" >= 0
    AND "invalid_rows" >= 0
    AND "valid_rows" + "invalid_rows" = "total_rows"
  ),
  CONSTRAINT "contact_import_preview_rows_check" CHECK (
    jsonb_typeof("normalized_rows") = 'array'
    AND jsonb_array_length("normalized_rows") = "total_rows"
  ),
  CONSTRAINT "contact_import_preview_commit_check" CHECK (
    (
      "committed_at" IS NULL
      AND "commit_idempotency_key" IS NULL
      AND "result_snapshot" IS NULL
    )
    OR (
      "committed_at" IS NOT NULL
      AND "commit_idempotency_key" IS NOT NULL
      AND char_length("commit_idempotency_key") BETWEEN 8 AND 128
      AND "result_snapshot" IS NOT NULL
    )
  ),
  CONSTRAINT "contact_import_preview_commit_idempotency_key_key"
    UNIQUE ("commit_idempotency_key")
);

CREATE INDEX "contact_group_event_id_created_at_idx"
  ON "contact_group"("event_id", "created_at");
CREATE INDEX "contact_event_id_deleted_at_created_at_idx"
  ON "contact"("event_id", "deleted_at", "created_at");
CREATE INDEX "contact_group_id_event_id_deleted_at_idx"
  ON "contact"("group_id", "event_id", "deleted_at");
CREATE INDEX "contact_import_preview_event_id_expires_at_idx"
  ON "contact_import_preview"("event_id", "expires_at");
CREATE INDEX "contact_import_preview_expires_at_committed_at_idx"
  ON "contact_import_preview"("expires_at", "committed_at");

ALTER TABLE "contact_group"
  ADD CONSTRAINT "contact_group_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "event"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contact"
  ADD CONSTRAINT "contact_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "event"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contact"
  ADD CONSTRAINT "contact_group_same_event_fkey"
  FOREIGN KEY ("group_id", "event_id")
  REFERENCES "contact_group"("id", "event_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contact_import_preview"
  ADD CONSTRAINT "contact_import_preview_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "event"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contact_import_preview"
  ADD CONSTRAINT "contact_import_preview_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
