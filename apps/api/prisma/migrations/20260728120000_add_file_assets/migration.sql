CREATE TYPE "file_asset_owner_type" AS ENUM (
  'FLYER',
  'FLIPBOOK_PAGE',
  'FLOORPLAN',
  'ALBUM_PHOTO',
  'GENERATED_REPORT',
  'INVITATION',
  'PHYSICAL_PASS'
);

CREATE TYPE "file_asset_type" AS ENUM (
  'FLYER_INITIAL_IMAGE',
  'FLYER_QR_IMAGE',
  'FLIPBOOK_PAGE_IMAGE',
  'FLOORPLAN_IMAGE',
  'ALBUM_PHOTO_IMAGE',
  'GENERATED_REPORT_PDF',
  'INVITATION_QR_SVG',
  'PHYSICAL_PASS_QR_SVG'
);

CREATE TYPE "file_asset_status" AS ENUM (
  'UPLOADING',
  'READY',
  'FAILED',
  'HIDDEN',
  'DELETED'
);

CREATE TYPE "storage_provider" AS ENUM ('LOCAL');

CREATE TABLE "file_asset" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "client_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "owner_type" "file_asset_owner_type" NOT NULL,
  "owner_id" UUID,
  "file_type" "file_asset_type" NOT NULL,
  "storage_provider" "storage_provider" NOT NULL DEFAULT 'LOCAL',
  "storage_key" VARCHAR(160) NOT NULL,
  "original_name" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(100) NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "checksum_sha256" CHAR(64),
  "width" INTEGER,
  "height" INTEGER,
  "created_by_user_id" UUID NOT NULL,
  "status" "file_asset_status" NOT NULL DEFAULT 'UPLOADING',
  "failure_code" VARCHAR(80),
  "associated_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),

  CONSTRAINT "file_asset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "file_asset_storage_key_key" UNIQUE ("storage_key"),
  CONSTRAINT "file_asset_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "file_asset_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "file_asset_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "file_asset_owner_file_type_check" CHECK (
    ("owner_type" = 'FLYER' AND "file_type" IN ('FLYER_INITIAL_IMAGE', 'FLYER_QR_IMAGE'))
    OR ("owner_type" = 'FLIPBOOK_PAGE' AND "file_type" = 'FLIPBOOK_PAGE_IMAGE')
    OR ("owner_type" = 'FLOORPLAN' AND "file_type" = 'FLOORPLAN_IMAGE')
    OR ("owner_type" = 'ALBUM_PHOTO' AND "file_type" = 'ALBUM_PHOTO_IMAGE')
    OR ("owner_type" = 'GENERATED_REPORT' AND "file_type" = 'GENERATED_REPORT_PDF')
    OR ("owner_type" = 'INVITATION' AND "file_type" = 'INVITATION_QR_SVG')
    OR ("owner_type" = 'PHYSICAL_PASS' AND "file_type" = 'PHYSICAL_PASS_QR_SVG')
  ),
  CONSTRAINT "file_asset_size_check" CHECK ("size_bytes" >= 0),
  CONSTRAINT "file_asset_checksum_check" CHECK (
    "checksum_sha256" IS NULL OR "checksum_sha256" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "file_asset_owner_association_check" CHECK (
    ("owner_id" IS NULL AND "associated_at" IS NULL)
    OR ("owner_id" IS NOT NULL AND "associated_at" IS NOT NULL)
  ),
  CONSTRAINT "file_asset_ready_metadata_check" CHECK (
    "status" <> 'READY'
    OR (
      "size_bytes" > 0
      AND "checksum_sha256" IS NOT NULL
      AND length(trim("mime_type")) > 0
      AND length(trim("original_name")) > 0
      AND (
        "file_type" NOT IN (
          'FLYER_INITIAL_IMAGE',
          'FLYER_QR_IMAGE',
          'FLIPBOOK_PAGE_IMAGE',
          'FLOORPLAN_IMAGE',
          'ALBUM_PHOTO_IMAGE'
        )
        OR ("width" > 0 AND "height" > 0)
      )
    )
  ),
  CONSTRAINT "file_asset_failed_code_check" CHECK (
    ("status" = 'FAILED' AND "failure_code" IS NOT NULL)
    OR ("status" <> 'FAILED' AND "failure_code" IS NULL)
  ),
  CONSTRAINT "file_asset_deleted_at_check" CHECK (
    ("status" = 'DELETED' AND "deleted_at" IS NOT NULL)
    OR ("status" <> 'DELETED' AND "deleted_at" IS NULL)
  )
);

CREATE INDEX "file_asset_client_id_event_id_status_deleted_at_idx"
  ON "file_asset"("client_id", "event_id", "status", "deleted_at");
CREATE INDEX "file_asset_event_id_owner_type_owner_id_idx"
  ON "file_asset"("event_id", "owner_type", "owner_id");
CREATE INDEX "file_asset_status_owner_id_created_at_idx"
  ON "file_asset"("status", "owner_id", "created_at");

CREATE FUNCTION "enforce_file_asset_invariants"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."client_id" IS DISTINCT FROM NEW."client_id"
    OR OLD."event_id" IS DISTINCT FROM NEW."event_id"
    OR OLD."owner_type" IS DISTINCT FROM NEW."owner_type"
    OR OLD."file_type" IS DISTINCT FROM NEW."file_type"
    OR OLD."storage_provider" IS DISTINCT FROM NEW."storage_provider"
    OR OLD."storage_key" IS DISTINCT FROM NEW."storage_key"
    OR OLD."created_by_user_id" IS DISTINCT FROM NEW."created_by_user_id"
  THEN
    RAISE EXCEPTION 'file asset identity is immutable' USING ERRCODE = '23514';
  END IF;

  IF OLD."owner_id" IS NOT NULL AND (
    OLD."owner_id" IS DISTINCT FROM NEW."owner_id"
    OR OLD."associated_at" IS DISTINCT FROM NEW."associated_at"
  ) THEN
    RAISE EXCEPTION 'file asset owner is immutable' USING ERRCODE = '23514';
  END IF;

  IF OLD."owner_id" IS NULL AND NEW."owner_id" IS NOT NULL
    AND (OLD."status" <> 'READY' OR NEW."status" <> 'READY')
  THEN
    RAISE EXCEPTION 'only a ready file asset can be associated' USING ERRCODE = '23514';
  END IF;

  IF OLD."status" IN ('READY', 'HIDDEN', 'DELETED') AND (
    OLD."original_name" IS DISTINCT FROM NEW."original_name"
    OR OLD."mime_type" IS DISTINCT FROM NEW."mime_type"
    OR OLD."size_bytes" IS DISTINCT FROM NEW."size_bytes"
    OR OLD."checksum_sha256" IS DISTINCT FROM NEW."checksum_sha256"
    OR OLD."width" IS DISTINCT FROM NEW."width"
    OR OLD."height" IS DISTINCT FROM NEW."height"
  ) THEN
    RAISE EXCEPTION 'file asset binary metadata is immutable' USING ERRCODE = '23514';
  END IF;

  IF NOT (
    (OLD."status" = 'UPLOADING' AND NEW."status" IN ('UPLOADING', 'READY', 'FAILED', 'DELETED'))
    OR (OLD."status" = 'READY' AND NEW."status" IN ('READY', 'HIDDEN', 'DELETED'))
    OR (OLD."status" = 'FAILED' AND NEW."status" IN ('FAILED', 'DELETED'))
    OR (OLD."status" = 'HIDDEN' AND NEW."status" IN ('HIDDEN', 'READY', 'DELETED'))
    OR (OLD."status" = 'DELETED' AND NEW."status" = 'DELETED')
  ) THEN
    RAISE EXCEPTION 'invalid file asset status transition' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "file_asset_enforce_invariants"
  BEFORE UPDATE ON "file_asset"
  FOR EACH ROW
  EXECUTE FUNCTION "enforce_file_asset_invariants"();

CREATE FUNCTION "reject_file_asset_truncate"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'file_asset cannot be truncated' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "file_asset_reject_truncate"
  BEFORE TRUNCATE ON "file_asset"
  FOR EACH STATEMENT
  EXECUTE FUNCTION "reject_file_asset_truncate"();
