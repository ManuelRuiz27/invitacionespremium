ALTER TYPE "file_asset_type" ADD VALUE IF NOT EXISTS 'FLOORPLAN_SVG';

ALTER TABLE "file_asset" DROP CONSTRAINT "file_asset_owner_file_type_check";
ALTER TABLE "file_asset"
  ADD CONSTRAINT "file_asset_owner_file_type_check" CHECK (
    ("owner_type" = 'FLYER' AND "file_type" IN ('FLYER_INITIAL_IMAGE', 'FLYER_QR_IMAGE'))
    OR ("owner_type" = 'FLIPBOOK_PAGE' AND "file_type" = 'FLIPBOOK_PAGE_IMAGE')
    OR ("owner_type" = 'FLOORPLAN' AND "file_type" IN ('FLOORPLAN_IMAGE', 'FLOORPLAN_SVG'))
    OR ("owner_type" = 'ALBUM_PHOTO' AND "file_type" = 'ALBUM_PHOTO_IMAGE')
    OR ("owner_type" = 'GENERATED_REPORT' AND "file_type" = 'GENERATED_REPORT_PDF')
    OR ("owner_type" = 'INVITATION' AND "file_type" = 'INVITATION_QR_SVG')
    OR ("owner_type" = 'PHYSICAL_PASS' AND "file_type" = 'PHYSICAL_PASS_QR_SVG')
  );

CREATE OR REPLACE FUNCTION "assert_floorplan_asset_compatible"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  event_client UUID;
  asset_client UUID;
  asset_event UUID;
  asset_owner_type "file_asset_owner_type";
  asset_owner UUID;
  asset_file_type "file_asset_type";
  asset_status "file_asset_status";
  asset_deleted_at TIMESTAMPTZ;
BEGIN
  SELECT "client_id" INTO event_client FROM "event" WHERE "id" = NEW."event_id";
  SELECT "client_id", "event_id", "owner_type", "owner_id", "file_type", "status", "deleted_at"
  INTO asset_client, asset_event, asset_owner_type, asset_owner, asset_file_type, asset_status, asset_deleted_at
  FROM "file_asset" WHERE "id" = NEW."image_asset_id";
  IF event_client IS NULL
    OR asset_client IS DISTINCT FROM event_client
    OR asset_event IS DISTINCT FROM NEW."event_id"
    OR asset_owner_type <> 'FLOORPLAN'
    OR asset_file_type NOT IN ('FLOORPLAN_IMAGE', 'FLOORPLAN_SVG')
    OR asset_status <> 'READY'
    OR asset_deleted_at IS NOT NULL
    OR asset_owner IS DISTINCT FROM NEW."id"
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FLOORPLAN_FILE_ASSET_INCOMPATIBLE';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "protect_active_floorplan_asset"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "floorplan" f
    JOIN "event" e ON e."id" = f."event_id"
    WHERE f."image_asset_id" = NEW."id"
      AND f."deleted_at" IS NULL
      AND (
        NEW."client_id" <> e."client_id"
        OR NEW."event_id" <> f."event_id"
        OR NEW."owner_type" <> 'FLOORPLAN'
        OR NEW."owner_id" <> f."id"
        OR NEW."file_type" NOT IN ('FLOORPLAN_IMAGE', 'FLOORPLAN_SVG')
        OR NEW."status" <> 'READY'
        OR NEW."deleted_at" IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FLOORPLAN_FILE_ASSET_IN_USE';
  END IF;
  RETURN NEW;
END;
$$;
