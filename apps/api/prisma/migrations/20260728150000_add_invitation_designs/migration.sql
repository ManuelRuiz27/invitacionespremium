CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "invitation_design_type" AS ENUM ('FLYER', 'FLIPBOOK');
CREATE TYPE "hotspot_visual_owner_type" AS ENUM ('FLYER', 'FLIPBOOK_PAGE');
CREATE TYPE "hotspot_action" AS ENUM (
  'RSVP',
  'LOCATION',
  'GIFT_REGISTRY',
  'QR_AREA',
  'EXTERNAL_LINK'
);

CREATE TABLE "invitation_design" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "type" "invitation_design_type" NOT NULL,
  "flyer_initial_asset_id" UUID,
  "flyer_qr_asset_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),

  CONSTRAINT "invitation_design_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invitation_design_id_event_id_key" UNIQUE ("id", "event_id"),
  CONSTRAINT "invitation_design_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invitation_design_flyer_initial_asset_id_fkey"
    FOREIGN KEY ("flyer_initial_asset_id") REFERENCES "file_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invitation_design_flyer_qr_asset_id_fkey"
    FOREIGN KEY ("flyer_qr_asset_id") REFERENCES "file_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invitation_design_shape_check" CHECK (
    ("type" = 'FLYER' AND "flyer_initial_asset_id" IS NOT NULL AND "flyer_qr_asset_id" IS NOT NULL)
    OR ("type" = 'FLIPBOOK' AND "flyer_initial_asset_id" IS NULL AND "flyer_qr_asset_id" IS NULL)
  ),
  CONSTRAINT "invitation_design_flyer_assets_distinct_check" CHECK (
    "flyer_initial_asset_id" IS NULL
    OR "flyer_qr_asset_id" IS NULL
    OR "flyer_initial_asset_id" <> "flyer_qr_asset_id"
  ),
  CONSTRAINT "invitation_design_flyer_initial_asset_id_key" UNIQUE ("flyer_initial_asset_id"),
  CONSTRAINT "invitation_design_flyer_qr_asset_id_key" UNIQUE ("flyer_qr_asset_id")
);

ALTER TABLE "invitation_design"
  ADD CONSTRAINT "invitation_design_one_active_per_event"
  EXCLUDE USING gist ("event_id" WITH =)
  WHERE ("deleted_at" IS NULL)
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "invitation_design_event_id_type_deleted_at_idx"
  ON "invitation_design"("event_id", "type", "deleted_at");

CREATE TABLE "flipbook_page" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "design_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "file_asset_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),

  CONSTRAINT "flipbook_page_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flipbook_page_id_event_id_design_id_key" UNIQUE ("id", "event_id", "design_id"),
  CONSTRAINT "flipbook_page_file_asset_id_key" UNIQUE ("file_asset_id"),
  CONSTRAINT "flipbook_page_design_id_event_id_fkey"
    FOREIGN KEY ("design_id", "event_id")
    REFERENCES "invitation_design"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "flipbook_page_file_asset_id_fkey"
    FOREIGN KEY ("file_asset_id") REFERENCES "file_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "flipbook_page_position_check" CHECK ("position" > 0)
);

ALTER TABLE "flipbook_page"
  ADD CONSTRAINT "flipbook_page_active_position_excl"
  EXCLUDE USING gist ("design_id" WITH =, "position" WITH =)
  WHERE ("deleted_at" IS NULL)
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "flipbook_page_event_id_design_id_deleted_at_position_idx"
  ON "flipbook_page"("event_id", "design_id", "deleted_at", "position");

CREATE TABLE "hotspot" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "design_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "visual_owner_type" "hotspot_visual_owner_type" NOT NULL,
  "flipbook_page_id" UUID,
  "action" "hotspot_action" NOT NULL,
  "x" DECIMAL(9,8) NOT NULL,
  "y" DECIMAL(9,8) NOT NULL,
  "width" DECIMAL(9,8) NOT NULL,
  "height" DECIMAL(9,8) NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "url" VARCHAR(2048),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),

  CONSTRAINT "hotspot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hotspot_design_id_event_id_fkey"
    FOREIGN KEY ("design_id", "event_id")
    REFERENCES "invitation_design"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "hotspot_flipbook_page_id_event_id_design_id_fkey"
    FOREIGN KEY ("flipbook_page_id", "event_id", "design_id")
    REFERENCES "flipbook_page"("id", "event_id", "design_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "hotspot_owner_shape_check" CHECK (
    ("visual_owner_type" = 'FLYER' AND "flipbook_page_id" IS NULL)
    OR ("visual_owner_type" = 'FLIPBOOK_PAGE' AND "flipbook_page_id" IS NOT NULL)
  ),
  CONSTRAINT "hotspot_coordinates_check" CHECK (
    "x" >= 0 AND "x" <= 1
    AND "y" >= 0 AND "y" <= 1
    AND "width" > 0 AND "width" <= 1
    AND "height" > 0 AND "height" <= 1
    AND "x" + "width" <= 1
    AND "y" + "height" <= 1
  ),
  CONSTRAINT "hotspot_priority_check" CHECK ("priority" >= 0),
  CONSTRAINT "hotspot_url_shape_check" CHECK (
    ("action" = 'EXTERNAL_LINK' AND "url" IS NOT NULL AND "url" ~ '^https://')
    OR ("action" <> 'EXTERNAL_LINK' AND "url" IS NULL)
  )
);

CREATE INDEX "hotspot_event_id_design_id_deleted_at_priority_idx"
  ON "hotspot"("event_id", "design_id", "deleted_at", "priority");
CREATE INDEX "hotspot_flipbook_page_id_deleted_at_idx"
  ON "hotspot"("flipbook_page_id", "deleted_at");

CREATE FUNCTION "lock_invitation_design_parent"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1
  FROM "invitation_design"
  WHERE "id" = COALESCE(NEW."design_id", OLD."design_id")
  FOR UPDATE;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER "flipbook_page_lock_design"
  BEFORE INSERT OR UPDATE OR DELETE ON "flipbook_page"
  FOR EACH ROW
  EXECUTE FUNCTION "lock_invitation_design_parent"();

CREATE TRIGGER "hotspot_lock_design"
  BEFORE INSERT OR UPDATE OR DELETE ON "hotspot"
  FOR EACH ROW
  EXECUTE FUNCTION "lock_invitation_design_parent"();

CREATE FUNCTION "enforce_invitation_design_immutability"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."event_id" IS DISTINCT FROM OLD."event_id"
    OR NEW."type" IS DISTINCT FROM OLD."type"
  THEN
    RAISE EXCEPTION 'invitation design identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD."deleted_at" IS NOT NULL AND NEW."deleted_at" IS NULL THEN
    RAISE EXCEPTION 'invitation design cannot be restored operationally' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION "enforce_flipbook_page_immutability"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."design_id" IS DISTINCT FROM OLD."design_id"
    OR NEW."event_id" IS DISTINCT FROM OLD."event_id"
  THEN
    RAISE EXCEPTION 'flipbook page ownership is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD."deleted_at" IS NOT NULL AND NEW."deleted_at" IS NULL THEN
    RAISE EXCEPTION 'flipbook page cannot be restored operationally' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION "enforce_hotspot_immutability"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."design_id" IS DISTINCT FROM OLD."design_id"
    OR NEW."event_id" IS DISTINCT FROM OLD."event_id"
    OR NEW."visual_owner_type" IS DISTINCT FROM OLD."visual_owner_type"
    OR NEW."flipbook_page_id" IS DISTINCT FROM OLD."flipbook_page_id"
  THEN
    RAISE EXCEPTION 'hotspot visual ownership is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD."deleted_at" IS NOT NULL AND NEW."deleted_at" IS NULL THEN
    RAISE EXCEPTION 'hotspot cannot be restored operationally' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "invitation_design_enforce_immutability"
  BEFORE UPDATE ON "invitation_design"
  FOR EACH ROW EXECUTE FUNCTION "enforce_invitation_design_immutability"();
CREATE TRIGGER "flipbook_page_enforce_immutability"
  BEFORE UPDATE ON "flipbook_page"
  FOR EACH ROW EXECUTE FUNCTION "enforce_flipbook_page_immutability"();
CREATE TRIGGER "hotspot_enforce_immutability"
  BEFORE UPDATE ON "hotspot"
  FOR EACH ROW EXECUTE FUNCTION "enforce_hotspot_immutability"();

CREATE FUNCTION "validate_invitation_design_invariants"("target_design_id" UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  "design_row" "invitation_design"%ROWTYPE;
  "event_client_id" UUID;
  "service_code_value" "service_code";
  "active_page_count" INTEGER;
  "invalid_page_count" INTEGER;
  "invalid_hotspot_count" INTEGER;
  "external_link_count" INTEGER;
BEGIN
  SELECT * INTO "design_row"
  FROM "invitation_design"
  WHERE "id" = "target_design_id";
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT "event"."client_id", "service"."code"
  INTO "event_client_id", "service_code_value"
  FROM "event"
  LEFT JOIN "service" ON "service"."id" = "event"."service_id"
  WHERE "event"."id" = "design_row"."event_id";

  IF "design_row"."deleted_at" IS NULL THEN
    IF ("design_row"."type" = 'FLYER' AND "service_code_value" IS DISTINCT FROM 'FLYER')
      OR ("design_row"."type" = 'FLIPBOOK' AND "service_code_value" IS DISTINCT FROM 'FLIPBOOK')
    THEN
      RAISE EXCEPTION 'invitation design is incompatible with configured service'
        USING ERRCODE = '23514';
    END IF;

    IF "design_row"."type" = 'FLYER' THEN
      IF NOT EXISTS (
        SELECT 1 FROM "file_asset"
        WHERE "id" = "design_row"."flyer_initial_asset_id"
          AND "client_id" = "event_client_id"
          AND "event_id" = "design_row"."event_id"
          AND "owner_type" = 'FLYER'
          AND "owner_id" = "design_row"."id"
          AND "file_type" = 'FLYER_INITIAL_IMAGE'
          AND "status" = 'READY'
          AND "deleted_at" IS NULL
      ) OR NOT EXISTS (
        SELECT 1 FROM "file_asset"
        WHERE "id" = "design_row"."flyer_qr_asset_id"
          AND "client_id" = "event_client_id"
          AND "event_id" = "design_row"."event_id"
          AND "owner_type" = 'FLYER'
          AND "owner_id" = "design_row"."id"
          AND "file_type" = 'FLYER_QR_IMAGE'
          AND "status" = 'READY'
          AND "deleted_at" IS NULL
      ) THEN
        RAISE EXCEPTION 'flyer assets must be ready and owned by the design'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  SELECT count(*) INTO "active_page_count"
  FROM "flipbook_page"
  WHERE "design_id" = "target_design_id" AND "deleted_at" IS NULL;

  IF "active_page_count" > 10 THEN
    RAISE EXCEPTION 'flipbook page limit exceeded' USING ERRCODE = '23514';
  END IF;
  IF "active_page_count" > 0 AND EXISTS (
    SELECT 1
    FROM generate_series(1, "active_page_count") AS expected("position")
    LEFT JOIN "flipbook_page" page
      ON page."design_id" = "target_design_id"
      AND page."deleted_at" IS NULL
      AND page."position" = expected."position"
    WHERE page."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'flipbook page positions must be continuous' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO "invalid_page_count"
  FROM "flipbook_page" page
  LEFT JOIN "file_asset" asset ON asset."id" = page."file_asset_id"
  WHERE page."design_id" = "target_design_id"
    AND page."deleted_at" IS NULL
    AND (
      "design_row"."deleted_at" IS NOT NULL
      OR "design_row"."type" <> 'FLIPBOOK'
      OR page."event_id" <> "design_row"."event_id"
      OR asset."client_id" <> "event_client_id"
      OR asset."event_id" <> page."event_id"
      OR asset."owner_type" <> 'FLIPBOOK_PAGE'
      OR asset."owner_id" <> page."id"
      OR asset."file_type" <> 'FLIPBOOK_PAGE_IMAGE'
      OR asset."status" <> 'READY'
      OR asset."deleted_at" IS NOT NULL
    );
  IF "invalid_page_count" > 0 THEN
    RAISE EXCEPTION 'flipbook page asset or ownership is invalid' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO "invalid_hotspot_count"
  FROM "hotspot"
  WHERE "design_id" = "target_design_id"
    AND "deleted_at" IS NULL
    AND (
      "design_row"."deleted_at" IS NOT NULL
      OR ("design_row"."type" = 'FLYER' AND "visual_owner_type" <> 'FLYER')
      OR ("design_row"."type" = 'FLIPBOOK' AND "visual_owner_type" <> 'FLIPBOOK_PAGE')
    );
  IF "invalid_hotspot_count" > 0 THEN
    RAISE EXCEPTION 'hotspot visual owner is incompatible with design' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO "external_link_count"
  FROM "hotspot"
  WHERE "design_id" = "target_design_id"
    AND "action" = 'EXTERNAL_LINK'
    AND "deleted_at" IS NULL;
  IF "external_link_count" > 3 THEN
    RAISE EXCEPTION 'external hotspot link limit exceeded' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION "check_invitation_design_after_change"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM "validate_invitation_design_invariants"(COALESCE(NEW."id", OLD."id"));
  RETURN NULL;
END;
$$;

CREATE FUNCTION "check_invitation_design_child_after_change"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM "validate_invitation_design_invariants"(COALESCE(NEW."design_id", OLD."design_id"));
  RETURN NULL;
END;
$$;

CREATE FUNCTION "check_invitation_design_after_file_asset_change"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(NEW."owner_type", OLD."owner_type") = 'FLYER' THEN
    IF COALESCE(NEW."owner_id", OLD."owner_id") IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM "invitation_design"
      WHERE "id" = COALESCE(NEW."owner_id", OLD."owner_id")
        AND "event_id" = COALESCE(NEW."event_id", OLD."event_id")
        AND "type" = 'FLYER'
        AND (
          COALESCE(NEW."status", OLD."status") = 'HIDDEN'
          OR "deleted_at" IS NULL
        )
    ) THEN
      RAISE EXCEPTION 'flyer file asset owner does not exist or is incompatible'
        USING ERRCODE = '23514';
    END IF;
    PERFORM "validate_invitation_design_invariants"(COALESCE(NEW."owner_id", OLD."owner_id"));
  ELSIF COALESCE(NEW."owner_type", OLD."owner_type") = 'FLIPBOOK_PAGE' THEN
    IF COALESCE(NEW."owner_id", OLD."owner_id") IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM "flipbook_page"
      WHERE "id" = COALESCE(NEW."owner_id", OLD."owner_id")
        AND "event_id" = COALESCE(NEW."event_id", OLD."event_id")
        AND (
          COALESCE(NEW."status", OLD."status") = 'HIDDEN'
          OR "deleted_at" IS NULL
        )
    ) THEN
      RAISE EXCEPTION 'flipbook file asset owner does not exist or is incompatible'
        USING ERRCODE = '23514';
    END IF;
    PERFORM "validate_invitation_design_invariants"(
      (SELECT "design_id" FROM "flipbook_page" WHERE "id" = COALESCE(NEW."owner_id", OLD."owner_id"))
    );
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION "check_invitation_design_after_event_service_change"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM "validate_invitation_design_invariants"(
    (SELECT "id" FROM "invitation_design" WHERE "event_id" = NEW."id" AND "deleted_at" IS NULL)
  );
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "invitation_design_validate"
  AFTER INSERT OR UPDATE OR DELETE ON "invitation_design"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_invitation_design_after_change"();
CREATE CONSTRAINT TRIGGER "flipbook_page_validate_design"
  AFTER INSERT OR UPDATE OR DELETE ON "flipbook_page"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_invitation_design_child_after_change"();
CREATE CONSTRAINT TRIGGER "hotspot_validate_design"
  AFTER INSERT OR UPDATE OR DELETE ON "hotspot"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_invitation_design_child_after_change"();
CREATE CONSTRAINT TRIGGER "file_asset_validate_invitation_design"
  AFTER UPDATE ON "file_asset"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_invitation_design_after_file_asset_change"();
CREATE CONSTRAINT TRIGGER "event_validate_invitation_design"
  AFTER UPDATE OF "service_id" ON "event"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_invitation_design_after_event_service_change"();

CREATE FUNCTION "reject_invitation_design_truncate"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% cannot be truncated', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "invitation_design_reject_truncate"
  BEFORE TRUNCATE ON "invitation_design"
  FOR EACH STATEMENT EXECUTE FUNCTION "reject_invitation_design_truncate"();
CREATE TRIGGER "flipbook_page_reject_truncate"
  BEFORE TRUNCATE ON "flipbook_page"
  FOR EACH STATEMENT EXECUTE FUNCTION "reject_invitation_design_truncate"();
CREATE TRIGGER "hotspot_reject_truncate"
  BEFORE TRUNCATE ON "hotspot"
  FOR EACH STATEMENT EXECUTE FUNCTION "reject_invitation_design_truncate"();
