CREATE FUNCTION "is_valid_external_hotspot_url"("value" TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  "authority" TEXT;
  "port_value" INTEGER;
BEGIN
  IF "value" = ''
    OR "value" <> btrim("value")
    OR "value" ~ '[[:space:][:cntrl:]]'
    OR position('?' IN "value") > 0
    OR position('#' IN "value") > 0
    OR position(chr(92) IN "value") > 0
    OR "value" !~* '^https://'
  THEN
    RETURN FALSE;
  END IF;

  "authority" := split_part(substring("value" FROM 9), '/', 1);
  IF "authority" = ''
    OR position('@' IN "authority") > 0
    OR "authority" !~ '^([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]{0,61}[A-Za-z0-9])(\.([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]{0,61}[A-Za-z0-9]))*(:[0-9]{1,5})?$'
  THEN
    RETURN FALSE;
  END IF;

  IF "authority" ~ ':[0-9]+$' THEN
    "port_value" := substring("authority" FROM ':([0-9]+)$')::INTEGER;
    IF "port_value" > 65535 THEN
      RETURN FALSE;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$;

ALTER TABLE "hotspot"
  DROP CONSTRAINT "hotspot_url_shape_check";

ALTER TABLE "hotspot"
  ADD CONSTRAINT "hotspot_url_shape_check" CHECK (
    (
      "action" = 'EXTERNAL_LINK'
      AND "url" IS NOT NULL
      AND "is_valid_external_hotspot_url"("url")
    )
    OR ("action" <> 'EXTERNAL_LINK' AND "url" IS NULL)
  );

CREATE UNIQUE INDEX "hotspot_one_qr_page_per_design"
  ON "hotspot"("design_id")
  WHERE (
    "visual_owner_type" = 'FLIPBOOK_PAGE'
    AND "action" = 'QR_AREA'
    AND "deleted_at" IS NULL
  );

CREATE FUNCTION "validate_active_hotspot_visual_owners"("target_design_id" UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF "target_design_id" IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "hotspot" hotspot
    JOIN "invitation_design" design ON design."id" = hotspot."design_id"
    LEFT JOIN "flipbook_page" page
      ON page."id" = hotspot."flipbook_page_id"
      AND page."event_id" = hotspot."event_id"
      AND page."design_id" = hotspot."design_id"
    WHERE hotspot."design_id" = "target_design_id"
      AND hotspot."deleted_at" IS NULL
      AND (
        design."deleted_at" IS NOT NULL
        OR (
          design."type" = 'FLYER'
          AND (
            hotspot."visual_owner_type" <> 'FLYER'
            OR hotspot."flipbook_page_id" IS NOT NULL
          )
        )
        OR (
          design."type" = 'FLIPBOOK'
          AND (
            hotspot."visual_owner_type" <> 'FLIPBOOK_PAGE'
            OR page."id" IS NULL
            OR page."deleted_at" IS NOT NULL
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'active hotspot visual owner is invalid'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION "check_active_hotspot_visual_owners_from_hotspot"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM "validate_active_hotspot_visual_owners"(COALESCE(NEW."design_id", OLD."design_id"));
  RETURN NULL;
END;
$$;

CREATE FUNCTION "check_active_hotspot_visual_owners_from_page"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM "validate_active_hotspot_visual_owners"(COALESCE(NEW."design_id", OLD."design_id"));
  RETURN NULL;
END;
$$;

CREATE FUNCTION "check_active_hotspot_visual_owners_from_design"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM "validate_active_hotspot_visual_owners"(COALESCE(NEW."id", OLD."id"));
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "hotspot_validate_active_visual_owner"
  AFTER INSERT OR UPDATE OR DELETE ON "hotspot"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION "check_active_hotspot_visual_owners_from_hotspot"();

CREATE CONSTRAINT TRIGGER "flipbook_page_validate_active_hotspots"
  AFTER UPDATE OR DELETE ON "flipbook_page"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION "check_active_hotspot_visual_owners_from_page"();

CREATE CONSTRAINT TRIGGER "invitation_design_validate_active_hotspots"
  AFTER UPDATE OR DELETE ON "invitation_design"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION "check_active_hotspot_visual_owners_from_design"();

DO $$
DECLARE
  "design_id" UUID;
BEGIN
  FOR "design_id" IN SELECT "id" FROM "invitation_design" LOOP
    PERFORM "validate_active_hotspot_visual_owners"("design_id");
  END LOOP;
END;
$$;
