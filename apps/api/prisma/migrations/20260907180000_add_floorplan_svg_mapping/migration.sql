ALTER TABLE "floorplan_shape" ADD COLUMN "source_element_id" VARCHAR(256);

CREATE UNIQUE INDEX "floorplan_shape_active_source_element_key"
  ON "floorplan_shape" ("floorplan_id", "source_element_id")
  WHERE "deleted_at" IS NULL AND "source_element_id" IS NOT NULL;

-- A newly mapped table in detailed seating has no seats yet; its derived
-- capacity is zero. Manual table capacity remains positive in TABLE mode.
ALTER TABLE "floorplan_shape" DROP CONSTRAINT "floorplan_shape_capacity_check";
ALTER TABLE "floorplan_shape" ADD CONSTRAINT "floorplan_shape_capacity_check"
  CHECK (("kind" = 'TABLE' AND "capacity" >= 0)
    OR ("kind" = 'DECORATIVE_ZONE' AND "capacity" = 0));

CREATE FUNCTION "assert_floorplan_zero_capacity_mode"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."kind" = 'TABLE' AND NEW."capacity" = 0 AND NEW."deleted_at" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "floorplan" WHERE "id" = NEW."floorplan_id" AND "seating_mode" = 'SEAT') THEN
    RAISE EXCEPTION 'FLOORPLAN_TABLE_CAPACITY_REQUIRED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "floorplan_zero_capacity_mode_trigger"
  BEFORE INSERT OR UPDATE OF "capacity", "kind", "floorplan_id", "deleted_at" ON "floorplan_shape"
  FOR EACH ROW EXECUTE FUNCTION "assert_floorplan_zero_capacity_mode"();

CREATE FUNCTION "assert_floorplan_table_mode_capacity"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."seating_mode" = 'TABLE' AND EXISTS (
    SELECT 1 FROM "floorplan_shape" WHERE "floorplan_id" = NEW."id"
      AND "kind" = 'TABLE' AND "capacity" = 0 AND "deleted_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'FLOORPLAN_TABLE_CAPACITY_REQUIRED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "floorplan_table_mode_capacity_trigger"
  BEFORE UPDATE OF "seating_mode" ON "floorplan"
  FOR EACH ROW EXECUTE FUNCTION "assert_floorplan_table_mode_capacity"();
