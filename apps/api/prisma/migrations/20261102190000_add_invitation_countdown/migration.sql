CREATE TABLE "invitation_countdown" (
  "id" UUID NOT NULL,
  "design_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "visual_owner_type" "hotspot_visual_owner_type" NOT NULL,
  "flipbook_page_id" UUID,
  "x" DECIMAL(9,8) NOT NULL,
  "y" DECIMAL(9,8) NOT NULL,
  "width" DECIMAL(9,8) NOT NULL,
  "height" DECIMAL(9,8) NOT NULL,
  "number_font" VARCHAR(20) NOT NULL,
  "label_font" VARCHAR(20) NOT NULL,
  "number_weight" INTEGER NOT NULL,
  "label_weight" INTEGER NOT NULL,
  "layout" VARCHAR(10) NOT NULL,
  "number_color" VARCHAR(7) NOT NULL,
  "label_color" VARCHAR(7) NOT NULL,
  "background_color" VARCHAR(7) NOT NULL,
  "border_color" VARCHAR(7) NOT NULL,
  "shadow_color" VARCHAR(7) NOT NULL,
  "background_opacity" DOUBLE PRECISION NOT NULL,
  "frame" VARCHAR(10) NOT NULL,
  "shadow" VARCHAR(10) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "invitation_countdown_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invitation_countdown_design_fkey" FOREIGN KEY ("design_id", "event_id")
    REFERENCES "invitation_design"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invitation_countdown_page_fkey" FOREIGN KEY ("flipbook_page_id", "event_id", "design_id")
    REFERENCES "flipbook_page"("id", "event_id", "design_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invitation_countdown_geometry_check" CHECK (
    "x" >= 0 AND "y" >= 0 AND "width" > 0 AND "height" > 0
    AND "x" + "width" <= 1 AND "y" + "height" <= 1),
  CONSTRAINT "invitation_countdown_owner_check" CHECK (
    ("visual_owner_type" = 'FLYER' AND "flipbook_page_id" IS NULL)
    OR ("visual_owner_type" = 'FLIPBOOK_PAGE' AND "flipbook_page_id" IS NOT NULL)),
  CONSTRAINT "invitation_countdown_catalog_check" CHECK (
    "number_font" IN ('montserrat','playfair','system') AND "label_font" IN ('montserrat','playfair','system')
    AND "number_weight" IN (400,500,600,700) AND "label_weight" IN (400,500,600,700)
    AND "layout" IN ('row','grid') AND "frame" IN ('none','thin','double','rounded')
    AND "shadow" IN ('none','soft','strong') AND "revision" > 0),
  CONSTRAINT "invitation_countdown_colors_check" CHECK (
    "number_color" ~ '^#[0-9A-F]{6}$' AND "label_color" ~ '^#[0-9A-F]{6}$'
    AND "background_color" ~ '^#[0-9A-F]{6}$' AND "border_color" ~ '^#[0-9A-F]{6}$'
    AND "shadow_color" ~ '^#[0-9A-F]{6}$' AND "background_opacity" >= 0 AND "background_opacity" <= 1)
);

CREATE UNIQUE INDEX "invitation_countdown_design_id_key" ON "invitation_countdown"("design_id");
CREATE UNIQUE INDEX "invitation_countdown_design_id_event_id_key" ON "invitation_countdown"("design_id", "event_id");
CREATE INDEX "invitation_countdown_flipbook_page_id_deleted_at_idx" ON "invitation_countdown"("flipbook_page_id", "deleted_at");

CREATE FUNCTION "guard_invitation_countdown"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE design_type "invitation_design_type";
DECLARE design_deleted TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'countdown uses logical deletion' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM "event" WHERE "id" = NEW."event_id" FOR UPDATE;
  SELECT "type", "deleted_at" INTO design_type, design_deleted FROM "invitation_design"
    WHERE "id" = NEW."design_id" AND "event_id" = NEW."event_id" FOR UPDATE;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."design_id" IS DISTINCT FROM OLD."design_id"
      OR NEW."event_id" IS DISTINCT FROM OLD."event_id" OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
      OR NEW."revision" <> OLD."revision" + 1 THEN
      RAISE EXCEPTION 'countdown identity and revision are protected' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."revision" <> 1 THEN
    RAISE EXCEPTION 'countdown initial revision must be one' USING ERRCODE = '23514';
  END IF;
  IF NEW."deleted_at" IS NULL THEN
    IF design_type IS NULL OR design_deleted IS NOT NULL
      OR (design_type = 'FLYER' AND NEW."visual_owner_type" <> 'FLYER')
      OR (design_type = 'FLIPBOOK' AND NEW."visual_owner_type" <> 'FLIPBOOK_PAGE') THEN
      RAISE EXCEPTION 'countdown visual owner is invalid' USING ERRCODE = '23514';
    END IF;
    IF NEW."flipbook_page_id" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "flipbook_page" WHERE "id" = NEW."flipbook_page_id"
        AND "design_id" = NEW."design_id" AND "event_id" = NEW."event_id" AND "deleted_at" IS NULL
    ) THEN
      RAISE EXCEPTION 'countdown requires an active page' USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW."updated_at" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "invitation_countdown_guard" BEFORE INSERT OR UPDATE OR DELETE ON "invitation_countdown"
FOR EACH ROW EXECUTE FUNCTION "guard_invitation_countdown"();

CREATE FUNCTION "retire_invitation_countdown"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."deleted_at" IS NULL AND NEW."deleted_at" IS NOT NULL THEN
    IF TG_TABLE_NAME = 'flipbook_page' THEN
      UPDATE "invitation_countdown" SET "deleted_at" = NEW."deleted_at", "revision" = "revision" + 1
        WHERE "flipbook_page_id" = NEW."id" AND "deleted_at" IS NULL;
    ELSE
      UPDATE "invitation_countdown" SET "deleted_at" = NEW."deleted_at", "revision" = "revision" + 1
        WHERE "design_id" = NEW."id" AND "deleted_at" IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "flipbook_page_retire_countdown" AFTER UPDATE ON "flipbook_page"
FOR EACH ROW EXECUTE FUNCTION "retire_invitation_countdown"();
CREATE TRIGGER "invitation_design_retire_countdown" AFTER UPDATE ON "invitation_design"
FOR EACH ROW EXECUTE FUNCTION "retire_invitation_countdown"();

CREATE FUNCTION "deny_countdown_truncate"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'countdown cannot be truncated' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "invitation_countdown_no_truncate" BEFORE TRUNCATE ON "invitation_countdown"
FOR EACH STATEMENT EXECUTE FUNCTION "deny_countdown_truncate"();
