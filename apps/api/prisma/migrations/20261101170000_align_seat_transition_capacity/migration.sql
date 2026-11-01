-- Keep TABLE occupancy limits and structural protection in both modes.
-- Pending table-only assignments must not constrain derived SEAT capacity.
BEGIN;
CREATE OR REPLACE FUNCTION "assert_floorplan_shape_capacity"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  occupied integer;
  seating_mode floorplan_seating_mode;
BEGIN
  SELECT f."seating_mode" INTO seating_mode
  FROM "floorplan" f WHERE f."id" = NEW."floorplan_id" AND f."event_id" = NEW."event_id";

  IF seating_mode = 'SEAT' AND NEW."kind" = 'TABLE' AND NEW."deleted_at" IS NULL THEN
    NEW."capacity" := (
      SELECT count(*)::integer FROM "floorplan_seat" seat
      WHERE seat."floorplan_shape_id" = NEW."id"
        AND seat."floorplan_id" = NEW."floorplan_id" AND seat."event_id" = NEW."event_id"
        AND seat."deleted_at" IS NULL AND seat."is_blocked" = false
    );
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."deleted_at" IS NULL
    AND (NEW."deleted_at" IS NOT NULL OR NEW."kind" <> 'TABLE'
      OR (NEW."capacity" < OLD."capacity" AND seating_mode = 'TABLE'))
  THEN
    SELECT
      (SELECT count(*) FROM "assistant"
       WHERE "floorplan_shape_id" = OLD."id" AND "deleted_at" IS NULL)
      +
      (SELECT count(*) FROM "physical_pass"
       WHERE "revoked_at" IS NULL AND "floorplan_shape_id" = OLD."id" AND "deleted_at" IS NULL)
    INTO occupied;
    IF occupied > 0 AND (NEW."deleted_at" IS NOT NULL OR NEW."kind" <> 'TABLE' OR NEW."capacity" < occupied) THEN
      RAISE EXCEPTION 'FLOORPLAN_TABLE_OCCUPIED_OR_CAPACITY'
        USING ERRCODE = 'P0001', CONSTRAINT = 'floorplan_table_occupied_or_capacity';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER "floorplan_shape_capacity_trigger" ON "floorplan_shape";
CREATE TRIGGER "floorplan_shape_capacity_trigger"
BEFORE INSERT OR UPDATE ON "floorplan_shape"
FOR EACH ROW EXECUTE FUNCTION "assert_floorplan_shape_capacity"();

CREATE OR REPLACE FUNCTION "assert_assistant_seating"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  shape_event uuid;
  shape_kind floorplan_shape_kind;
  shape_capacity integer;
  shape_deleted_at timestamptz;
  shape_floorplan uuid;
  seating_mode floorplan_seating_mode;
  occupied integer;
BEGIN
  IF NEW."floorplan_shape_id" IS NULL THEN RETURN NEW; END IF;
  SELECT "event_id", "kind", "capacity", "deleted_at", "floorplan_id"
  INTO shape_event, shape_kind, shape_capacity, shape_deleted_at, shape_floorplan
  FROM "floorplan_shape"
  WHERE "id" = NEW."floorplan_shape_id"
  FOR UPDATE;
  IF shape_event IS NULL OR shape_event <> NEW."event_id"
    OR shape_kind <> 'TABLE' OR shape_deleted_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'SEATING_TABLE_INVALID'
      USING ERRCODE = 'P0001', CONSTRAINT = 'seating_table_invalid';
  END IF;

  SELECT f."seating_mode" INTO seating_mode FROM "floorplan" f WHERE f."id" = shape_floorplan;
  -- In SEAT, identity/eligibility/parent coherence and the unique active Seat
  -- index remain authoritative. Existing table-only rows await precision;
  -- the generic API still rejects new positive table assignments in SEAT.
  IF seating_mode = 'SEAT' THEN RETURN NEW; END IF;

  SELECT
    (SELECT count(*) FROM "assistant"
     WHERE "floorplan_shape_id" = NEW."floorplan_shape_id"
       AND "deleted_at" IS NULL AND "id" <> NEW."id")
    +
    (SELECT count(*) FROM "physical_pass"
     WHERE "revoked_at" IS NULL AND "floorplan_shape_id" = NEW."floorplan_shape_id" AND "deleted_at" IS NULL)
  INTO occupied;
  IF occupied >= shape_capacity THEN
    RAISE EXCEPTION 'SEATING_TABLE_CAPACITY_EXCEEDED'
      USING ERRCODE = 'P0001', CONSTRAINT = 'seating_table_capacity_exceeded';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
