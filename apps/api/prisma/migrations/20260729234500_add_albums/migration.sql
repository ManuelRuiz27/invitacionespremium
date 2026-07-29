ALTER TYPE "event_state_action" ADD VALUE IF NOT EXISTS 'publish_album';
ALTER TYPE "event_state_action" ADD VALUE IF NOT EXISTS 'unpublish_album';
ALTER TYPE "event_state_action" ADD VALUE IF NOT EXISTS 'expire_album';

ALTER TABLE "invitation"
  ADD COLUMN "album_token_nonce" VARCHAR(64),
  ADD COLUMN "album_token_version" INTEGER,
  ADD COLUMN "album_access_expires_at" TIMESTAMPTZ(6),
  ADD CONSTRAINT "invitation_album_token_complete_check" CHECK (
    ("album_token_nonce" IS NULL AND "album_token_version" IS NULL AND "album_access_expires_at" IS NULL)
    OR (
      "album_token_nonce" IS NOT NULL
      AND "album_token_version" IS NOT NULL
      AND "album_token_version" > 0
      AND "album_access_expires_at" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "invitation_album_token_nonce_check" CHECK (
    "album_token_nonce" IS NULL OR "album_token_nonce" ~ '^[0-9a-f]{64}$'
  );

CREATE UNIQUE INDEX "invitation_album_token_nonce_key"
  ON "invitation"("album_token_nonce");

CREATE TABLE "album" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "thank_you_message" VARCHAR(600),
  "theme_settings" JSONB NOT NULL,
  "external_button_label" VARCHAR(80),
  "external_url" VARCHAR(2048),
  "published_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6),
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),

  CONSTRAINT "album_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "album_event_id_key" UNIQUE ("event_id"),
  CONSTRAINT "album_id_event_id_key" UNIQUE ("id", "event_id"),
  CONSTRAINT "album_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "album_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "album_title_plain_text_check" CHECK (
    char_length("title") BETWEEN 1 AND 120
    AND "title" = btrim("title")
    AND "title" !~ '[<>[:cntrl:]]'
  ),
  CONSTRAINT "album_thank_you_plain_text_check" CHECK (
    "thank_you_message" IS NULL
    OR (
      char_length("thank_you_message") BETWEEN 1 AND 600
      AND "thank_you_message" = btrim("thank_you_message")
      AND "thank_you_message" !~ '[<>[:cntrl:]]'
    )
  ),
  CONSTRAINT "album_theme_settings_check" CHECK (
    jsonb_typeof("theme_settings") = 'object'
    AND "theme_settings" ?& ARRAY['backgroundColor', 'textColor', 'accentColor']
    AND ("theme_settings" - ARRAY['backgroundColor', 'textColor', 'accentColor']) = '{}'::jsonb
    AND ("theme_settings"->>'backgroundColor') ~ '^#[0-9A-F]{6}$'
    AND ("theme_settings"->>'textColor') ~ '^#[0-9A-F]{6}$'
    AND ("theme_settings"->>'accentColor') ~ '^#[0-9A-F]{6}$'
  ),
  CONSTRAINT "album_external_button_pair_check" CHECK (
    ("external_button_label" IS NULL AND "external_url" IS NULL)
    OR (
      "external_button_label" IS NOT NULL
      AND char_length("external_button_label") BETWEEN 1 AND 80
      AND "external_button_label" = btrim("external_button_label")
      AND "external_button_label" !~ '[<>[:cntrl:]]'
      AND "external_url" IS NOT NULL
      AND "is_valid_event_destination_url"("external_url")
    )
  ),
  CONSTRAINT "album_publication_pair_check" CHECK (
    ("published_at" IS NULL AND "expires_at" IS NULL)
    OR (
      "published_at" IS NOT NULL
      AND "expires_at" IS NOT NULL
      AND "expires_at" > "published_at"
    )
  )
);

CREATE INDEX "album_expires_at_deleted_at_idx"
  ON "album"("expires_at", "deleted_at");

CREATE TABLE "album_photo" (
  "id" UUID NOT NULL,
  "album_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "file_asset_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),

  CONSTRAINT "album_photo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "album_photo_id_album_id_event_id_key" UNIQUE ("id", "album_id", "event_id"),
  CONSTRAINT "album_photo_file_asset_id_key" UNIQUE ("file_asset_id"),
  CONSTRAINT "album_photo_album_id_event_id_fkey"
    FOREIGN KEY ("album_id", "event_id") REFERENCES "album"("id", "event_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "album_photo_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "event"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "album_photo_file_asset_id_fkey"
    FOREIGN KEY ("file_asset_id") REFERENCES "file_asset"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "album_photo_position_check" CHECK ("position" > 0)
);

CREATE INDEX "album_photo_album_id_event_id_deleted_at_position_idx"
  ON "album_photo"("album_id", "event_id", "deleted_at", "position");
CREATE UNIQUE INDEX "album_photo_active_position_key"
  ON "album_photo"("album_id", "position")
  WHERE "deleted_at" IS NULL;

CREATE OR REPLACE FUNCTION "validate_album_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  "event_status" event_status;
  "service" service_code;
BEGIN
  SELECT e."status", s."code"
  INTO "event_status", "service"
  FROM "event" e
  LEFT JOIN "service" s ON s."id" = e."service_id"
  WHERE e."id" = NEW."event_id" AND e."deleted_at" IS NULL
  FOR UPDATE OF e;

  IF NOT FOUND OR "service" NOT IN ('FLYER', 'FLIPBOOK') THEN
    RAISE EXCEPTION 'ALBUM_SERVICE_NOT_SUPPORTED'
      USING ERRCODE = 'P0001', CONSTRAINT = 'album_service_compatible';
  END IF;

  IF TG_OP = 'INSERT' AND "event_status" NOT IN ('active', 'event_day', 'closed') THEN
    RAISE EXCEPTION 'ALBUM_EVENT_STATE_INVALID'
      USING ERRCODE = 'P0001', CONSTRAINT = 'album_event_state';
  END IF;

  IF TG_OP = 'UPDATE'
    AND (
      OLD."title" IS DISTINCT FROM NEW."title"
      OR OLD."thank_you_message" IS DISTINCT FROM NEW."thank_you_message"
      OR OLD."theme_settings" IS DISTINCT FROM NEW."theme_settings"
      OR OLD."external_button_label" IS DISTINCT FROM NEW."external_button_label"
      OR OLD."external_url" IS DISTINCT FROM NEW."external_url"
      OR OLD."deleted_at" IS DISTINCT FROM NEW."deleted_at"
    )
    AND "event_status" NOT IN ('active', 'event_day', 'closed')
  THEN
    RAISE EXCEPTION 'ALBUM_EVENT_STATE_INVALID'
      USING ERRCODE = 'P0001', CONSTRAINT = 'album_event_state';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    OLD."event_id" IS DISTINCT FROM NEW."event_id"
    OR OLD."created_by_user_id" IS DISTINCT FROM NEW."created_by_user_id"
    OR OLD."created_at" IS DISTINCT FROM NEW."created_at"
  ) THEN
    RAISE EXCEPTION 'ALBUM_IDENTITY_IMMUTABLE'
      USING ERRCODE = 'P0001', CONSTRAINT = 'album_identity_immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "album_validate_mutation"
  BEFORE INSERT OR UPDATE ON "album"
  FOR EACH ROW EXECUTE FUNCTION "validate_album_mutation"();

CREATE OR REPLACE FUNCTION "validate_album_photo_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  "event_status" event_status;
BEGIN
  SELECT e."status"
  INTO "event_status"
  FROM "event" e
  JOIN "album" a ON a."event_id" = e."id"
  WHERE a."id" = NEW."album_id"
    AND a."event_id" = NEW."event_id"
    AND a."deleted_at" IS NULL
    AND e."deleted_at" IS NULL
  FOR UPDATE OF e;

  IF NOT FOUND OR "event_status" NOT IN ('active', 'event_day', 'closed') THEN
    RAISE EXCEPTION 'ALBUM_EVENT_STATE_INVALID'
      USING ERRCODE = 'P0001', CONSTRAINT = 'album_photo_event_state';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    OLD."album_id" IS DISTINCT FROM NEW."album_id"
    OR OLD."event_id" IS DISTINCT FROM NEW."event_id"
    OR OLD."file_asset_id" IS DISTINCT FROM NEW."file_asset_id"
    OR OLD."created_at" IS DISTINCT FROM NEW."created_at"
  ) THEN
    RAISE EXCEPTION 'ALBUM_PHOTO_IDENTITY_IMMUTABLE'
      USING ERRCODE = 'P0001', CONSTRAINT = 'album_photo_identity_immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "album_photo_validate_mutation"
  BEFORE INSERT OR UPDATE ON "album_photo"
  FOR EACH ROW EXECUTE FUNCTION "validate_album_photo_mutation"();

CREATE OR REPLACE FUNCTION "check_album_photo_integrity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  "target_album_id" UUID;
  "invalid_count" BIGINT;
  "active_count" INTEGER;
  "minimum_position" INTEGER;
  "maximum_position" INTEGER;
BEGIN
  "target_album_id" := COALESCE(NEW."album_id", OLD."album_id");

  SELECT count(*), min("position"), max("position")
  INTO "active_count", "minimum_position", "maximum_position"
  FROM "album_photo"
  WHERE "album_id" = "target_album_id" AND "deleted_at" IS NULL;

  IF "active_count" > 35 THEN
    RAISE EXCEPTION 'ALBUM_PHOTO_LIMIT_EXCEEDED'
      USING ERRCODE = 'P0001', CONSTRAINT = 'album_photo_active_limit';
  END IF;
  IF "active_count" > 0
    AND ("minimum_position" <> 1 OR "maximum_position" <> "active_count")
  THEN
    RAISE EXCEPTION 'ALBUM_PHOTO_POSITION_INVALID'
      USING ERRCODE = 'P0001', CONSTRAINT = 'album_photo_contiguous_positions';
  END IF;

  SELECT count(*)
  INTO "invalid_count"
  FROM "album_photo" p
  JOIN "album" a ON a."id" = p."album_id" AND a."event_id" = p."event_id"
  JOIN "event" e ON e."id" = p."event_id"
  LEFT JOIN "file_asset" f ON f."id" = p."file_asset_id"
  WHERE p."album_id" = "target_album_id"
    AND p."deleted_at" IS NULL
    AND (
      f."id" IS NULL
      OR f."client_id" IS DISTINCT FROM e."client_id"
      OR f."event_id" IS DISTINCT FROM p."event_id"
      OR f."owner_type" IS DISTINCT FROM 'ALBUM_PHOTO'
      OR f."file_type" IS DISTINCT FROM 'ALBUM_PHOTO_IMAGE'
      OR f."owner_id" IS DISTINCT FROM p."id"
      OR f."status" IS DISTINCT FROM 'READY'
      OR f."deleted_at" IS NOT NULL
      OR f."mime_type" NOT IN ('image/jpeg', 'image/png')
    );
  IF "invalid_count" > 0 THEN
    RAISE EXCEPTION 'ALBUM_PHOTO_FILE_ASSET_INVALID'
      USING ERRCODE = 'P0001', CONSTRAINT = 'album_photo_file_asset_compatible';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "album_photo_integrity_constraint"
  AFTER INSERT OR UPDATE ON "album_photo"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_album_photo_integrity"();

CREATE OR REPLACE FUNCTION "check_album_photo_after_file_asset_change"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  "invalid_count" BIGINT;
BEGIN
  SELECT count(*)
  INTO "invalid_count"
  FROM "album_photo" p
  JOIN "event" e ON e."id" = p."event_id"
  WHERE p."file_asset_id" = NEW."id"
    AND p."deleted_at" IS NULL
    AND (
      NEW."client_id" IS DISTINCT FROM e."client_id"
      OR NEW."event_id" IS DISTINCT FROM p."event_id"
      OR NEW."owner_type" IS DISTINCT FROM 'ALBUM_PHOTO'
      OR NEW."file_type" IS DISTINCT FROM 'ALBUM_PHOTO_IMAGE'
      OR NEW."owner_id" IS DISTINCT FROM p."id"
      OR NEW."status" IS DISTINCT FROM 'READY'
      OR NEW."deleted_at" IS NOT NULL
      OR NEW."mime_type" NOT IN ('image/jpeg', 'image/png')
    );
  IF "invalid_count" > 0 THEN
    RAISE EXCEPTION 'ALBUM_PHOTO_FILE_ASSET_INVALID'
      USING ERRCODE = 'P0001', CONSTRAINT = 'album_photo_file_asset_compatible';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "album_photo_file_asset_constraint"
  AFTER UPDATE ON "file_asset"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_album_photo_after_file_asset_change"();

CREATE OR REPLACE FUNCTION "check_album_publication_integrity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  "target_event_id" UUID;
  "target_album_id" UUID;
  "album_expires_at" TIMESTAMPTZ;
  "photo_count" INTEGER;
  "invalid_count" BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'event' THEN
    "target_event_id" := COALESCE(NEW."id", OLD."id");
  ELSE
    "target_event_id" := COALESCE(NEW."event_id", OLD."event_id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "event"
    WHERE "id" = "target_event_id" AND "status" = 'album_published'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT a."id", a."expires_at"
  INTO "target_album_id", "album_expires_at"
  FROM "album" a
  WHERE a."event_id" = "target_event_id"
    AND a."deleted_at" IS NULL
    AND a."published_at" IS NOT NULL
    AND a."expires_at" > a."published_at";

  IF "target_album_id" IS NULL THEN
    RAISE EXCEPTION 'ALBUM_PUBLICATION_INVALID'
      USING ERRCODE = 'P0001', CONSTRAINT = 'event_album_published_valid';
  END IF;

  SELECT count(*) INTO "photo_count"
  FROM "album_photo"
  WHERE "album_id" = "target_album_id" AND "deleted_at" IS NULL;
  IF "photo_count" NOT BETWEEN 1 AND 35 THEN
    RAISE EXCEPTION 'ALBUM_PUBLICATION_INVALID'
      USING ERRCODE = 'P0001', CONSTRAINT = 'event_album_published_valid';
  END IF;

  SELECT count(*)
  INTO "invalid_count"
  FROM "invitation" i
  JOIN "contact" c ON c."id" = i."contact_id" AND c."event_id" = i."event_id"
  WHERE i."event_id" = "target_event_id"
    AND (
      (
        i."deleted_at" IS NULL
        AND i."cancelled_at" IS NULL
        AND c."deleted_at" IS NULL
        AND EXISTS (
          SELECT 1
          FROM "assistant" ast
          JOIN "check_in" ci ON ci."assistant_id" = ast."id"
            AND ci."event_id" = ast."event_id"
            AND ci."invitation_id" = ast."invitation_id"
            AND ci."reverted_at" IS NULL
          WHERE ast."invitation_id" = i."id"
            AND ast."event_id" = i."event_id"
            AND ast."deleted_at" IS NULL
        )
      ) IS DISTINCT FROM (i."album_token_nonce" IS NOT NULL)
      OR (
        i."album_token_nonce" IS NOT NULL
        AND i."album_access_expires_at" IS DISTINCT FROM "album_expires_at"
      )
    );
  IF "invalid_count" > 0 THEN
    RAISE EXCEPTION 'ALBUM_INVITATION_ELIGIBILITY_INVALID'
      USING ERRCODE = 'P0001', CONSTRAINT = 'album_invitation_eligibility';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "event_album_publication_constraint"
  AFTER INSERT OR UPDATE ON "event"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_album_publication_integrity"();

CREATE CONSTRAINT TRIGGER "album_publication_constraint"
  AFTER INSERT OR UPDATE ON "album"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_album_publication_integrity"();

CREATE OR REPLACE FUNCTION "check_invitation_album_token_integrity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  "album_expires_at" TIMESTAMPTZ;
  "eligible" BOOLEAN;
BEGIN
  IF NEW."album_token_nonce" IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT a."expires_at"
  INTO "album_expires_at"
  FROM "event" e
  JOIN "album" a ON a."event_id" = e."id"
  WHERE e."id" = NEW."event_id"
    AND e."status" = 'album_published'
    AND e."deleted_at" IS NULL
    AND a."deleted_at" IS NULL
    AND a."published_at" IS NOT NULL;

  SELECT (
    NEW."deleted_at" IS NULL
    AND NEW."cancelled_at" IS NULL
    AND c."deleted_at" IS NULL
    AND EXISTS (
      SELECT 1
      FROM "assistant" ast
      JOIN "check_in" ci ON ci."assistant_id" = ast."id"
        AND ci."event_id" = ast."event_id"
        AND ci."invitation_id" = ast."invitation_id"
        AND ci."reverted_at" IS NULL
      WHERE ast."invitation_id" = NEW."id"
        AND ast."event_id" = NEW."event_id"
        AND ast."deleted_at" IS NULL
    )
  )
  INTO "eligible"
  FROM "contact" c
  WHERE c."id" = NEW."contact_id" AND c."event_id" = NEW."event_id";

  IF "album_expires_at" IS NULL
    OR NEW."album_access_expires_at" IS DISTINCT FROM "album_expires_at"
    OR "eligible" IS DISTINCT FROM TRUE
  THEN
    RAISE EXCEPTION 'ALBUM_TOKEN_INVALID'
      USING ERRCODE = 'P0001', CONSTRAINT = 'invitation_album_token_eligible';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "invitation_album_token_constraint"
  AFTER INSERT OR UPDATE ON "invitation"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_invitation_album_token_integrity"();

CREATE OR REPLACE FUNCTION "reject_album_hard_delete"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ALBUM_HARD_DELETE_FORBIDDEN'
    USING ERRCODE = 'P0001', CONSTRAINT = 'album_hard_delete_forbidden';
END;
$$;

CREATE TRIGGER "album_reject_delete"
  BEFORE DELETE ON "album"
  FOR EACH ROW EXECUTE FUNCTION "reject_album_hard_delete"();
CREATE TRIGGER "album_photo_reject_delete"
  BEFORE DELETE ON "album_photo"
  FOR EACH ROW EXECUTE FUNCTION "reject_album_hard_delete"();
CREATE TRIGGER "album_reject_truncate"
  BEFORE TRUNCATE ON "album"
  FOR EACH STATEMENT EXECUTE FUNCTION "reject_album_hard_delete"();
CREATE TRIGGER "album_photo_reject_truncate"
  BEFORE TRUNCATE ON "album_photo"
  FOR EACH STATEMENT EXECUTE FUNCTION "reject_album_hard_delete"();
