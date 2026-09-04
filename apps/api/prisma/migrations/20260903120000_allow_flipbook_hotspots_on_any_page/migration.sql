-- Hotspots remain unique actions per active design, regardless of Flipbook page.
WITH duplicates AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "design_id", "action"
      ORDER BY "created_at" ASC, "id" ASC
    ) AS "rank"
  FROM "hotspot"
  WHERE "deleted_at" IS NULL
)
UPDATE "hotspot" AS hotspot
SET "deleted_at" = CURRENT_TIMESTAMP
FROM duplicates
WHERE hotspot."id" = duplicates."id"
  AND duplicates."rank" > 1;

DROP INDEX IF EXISTS "hotspot_one_qr_page_per_design";

CREATE UNIQUE INDEX "hotspot_one_active_action_per_design"
  ON "hotspot"("design_id", "action")
  WHERE "deleted_at" IS NULL;

CREATE OR REPLACE FUNCTION "enforce_hotspot_immutability"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."design_id" IS DISTINCT FROM OLD."design_id"
    OR NEW."event_id" IS DISTINCT FROM OLD."event_id"
    OR NEW."visual_owner_type" IS DISTINCT FROM OLD."visual_owner_type"
  THEN
    RAISE EXCEPTION 'hotspot visual ownership is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD."deleted_at" IS NOT NULL AND NEW."deleted_at" IS NULL THEN
    RAISE EXCEPTION 'hotspot cannot be restored operationally' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
