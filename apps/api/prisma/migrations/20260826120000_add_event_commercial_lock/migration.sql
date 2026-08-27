ALTER TABLE "event"
  ADD COLUMN "commercial_authorized_at" TIMESTAMPTZ(6),
  ADD COLUMN "commercial_authorized_by_user_id" UUID,
  ADD COLUMN "commercial_price_locked_at" TIMESTAMPTZ(6),
  ADD COLUMN "commercial_service_price_id" UUID,
  ADD COLUMN "commercial_base_cost_credits" INTEGER,
  ADD COLUMN "commercial_promotion_discount_credits" INTEGER,
  ADD COLUMN "commercial_final_cost_credits" INTEGER,
  ADD COLUMN "commercial_channel_snapshot" "commercial_channel",
  ADD COLUMN "commercial_capacity_snapshot" INTEGER,
  ADD COLUMN "commercial_capacity_min_snapshot" INTEGER,
  ADD COLUMN "commercial_capacity_max_snapshot" INTEGER,
  ADD COLUMN "commercial_venue_tier_snapshot" "venue_price_tier",
  ADD COLUMN "design_kickoff_at" TIMESTAMPTZ(6),
  ADD COLUMN "design_kickoff_by_user_id" UUID;

ALTER TABLE "event"
  ADD CONSTRAINT "event_commercial_authorized_by_user_id_fkey"
    FOREIGN KEY ("commercial_authorized_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "event_commercial_service_price_id_fkey"
    FOREIGN KEY ("commercial_service_price_id") REFERENCES "service_price"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "event_design_kickoff_by_user_id_fkey"
    FOREIGN KEY ("design_kickoff_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "event_commercial_lock_shape_check" CHECK (
    (
      "commercial_authorized_at" IS NULL
      AND "commercial_authorized_by_user_id" IS NULL
      AND "commercial_price_locked_at" IS NULL
      AND "commercial_service_price_id" IS NULL
      AND "commercial_base_cost_credits" IS NULL
      AND "commercial_promotion_discount_credits" IS NULL
      AND "commercial_final_cost_credits" IS NULL
      AND "commercial_channel_snapshot" IS NULL
      AND "commercial_capacity_snapshot" IS NULL
      AND "commercial_capacity_min_snapshot" IS NULL
      AND "commercial_capacity_max_snapshot" IS NULL
      AND "commercial_venue_tier_snapshot" IS NULL
    ) OR (
      "commercial_authorized_at" IS NOT NULL
      AND "commercial_authorized_by_user_id" IS NOT NULL
      AND "commercial_price_locked_at" IS NOT NULL
      AND "commercial_service_price_id" IS NOT NULL
      AND "commercial_base_cost_credits" IS NOT NULL
      AND "commercial_promotion_discount_credits" IS NOT NULL
      AND "commercial_final_cost_credits" IS NOT NULL
      AND "commercial_channel_snapshot" IS NOT NULL
      AND "commercial_capacity_snapshot" IS NOT NULL
      AND "commercial_base_cost_credits" >= 0
      AND "commercial_promotion_discount_credits" >= 0
      AND "commercial_promotion_discount_credits" <= "commercial_base_cost_credits"
      AND "commercial_final_cost_credits" = "commercial_base_cost_credits" - "commercial_promotion_discount_credits"
      AND (
        ("commercial_channel_snapshot" IN ('STANDARD', 'PARTNER')
          AND "commercial_capacity_min_snapshot" IS NOT NULL
          AND "commercial_capacity_max_snapshot" IS NOT NULL
          AND "commercial_venue_tier_snapshot" IS NULL)
        OR
        ("commercial_channel_snapshot" = 'VENUE'
          AND "commercial_capacity_min_snapshot" IS NULL
          AND "commercial_capacity_max_snapshot" IS NULL
          AND "commercial_venue_tier_snapshot" IS NOT NULL)
      )
    )
  ),
  ADD CONSTRAINT "event_design_kickoff_pair_check" CHECK (
    ("design_kickoff_at" IS NULL AND "design_kickoff_by_user_id" IS NULL)
    OR ("design_kickoff_at" IS NOT NULL AND "design_kickoff_by_user_id" IS NOT NULL)
  );

CREATE INDEX "event_commercial_authorized_at_idx" ON "event"("commercial_authorized_at");
CREATE INDEX "event_design_kickoff_at_idx" ON "event"("design_kickoff_at");

CREATE OR REPLACE FUNCTION validate_event_commercial_lock()
RETURNS TRIGGER AS $$
DECLARE
  price_row "service_price"%ROWTYPE;
  authorizer_role "user_role";
  kickoff_role "user_role";
  service_code "service_code";
BEGIN
  IF NEW."commercial_authorized_at" IS NULL THEN
    IF NEW."design_kickoff_at" IS NOT NULL THEN
      RAISE EXCEPTION 'Design kickoff requires a commercial lock.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO price_row FROM "service_price" WHERE "id" = NEW."commercial_service_price_id";
  IF NOT FOUND
    OR price_row."pricing_version" <> 2
    OR price_row."service_id" IS DISTINCT FROM NEW."service_id"
    OR price_row."commercial_channel" IS DISTINCT FROM NEW."commercial_channel_snapshot"
    OR price_row."credits" IS DISTINCT FROM NEW."commercial_base_cost_credits"
    OR price_row."capacity_min" IS DISTINCT FROM NEW."commercial_capacity_min_snapshot"
    OR price_row."capacity_max" IS DISTINCT FROM NEW."commercial_capacity_max_snapshot"
    OR price_row."venue_tier" IS DISTINCT FROM NEW."commercial_venue_tier_snapshot"
    OR NEW."capacity" IS DISTINCT FROM NEW."commercial_capacity_snapshot"
  THEN
    RAISE EXCEPTION 'Event commercial lock must match its Event and ServicePrice snapshot.' USING ERRCODE = '23514';
  END IF;

  IF NEW."commercial_channel_snapshot" IN ('STANDARD', 'PARTNER')
    AND (NEW."capacity" < price_row."capacity_min" OR NEW."capacity" > price_row."capacity_max")
  THEN
    RAISE EXCEPTION 'Event capacity is outside the commercial price range.' USING ERRCODE = '23514';
  END IF;

  SELECT "role" INTO authorizer_role FROM "app_user"
    WHERE "id" = NEW."commercial_authorized_by_user_id" AND "deleted_at" IS NULL;
  IF NOT FOUND OR authorizer_role <> 'PLATFORM_ADMIN' THEN
    RAISE EXCEPTION 'Commercial authorization requires a real Platform Admin actor.' USING ERRCODE = '23514';
  END IF;

  IF NEW."design_kickoff_at" IS NOT NULL THEN
    SELECT "code" INTO service_code FROM "service" WHERE "id" = NEW."service_id";
    SELECT "role" INTO kickoff_role FROM "app_user"
      WHERE "id" = NEW."design_kickoff_by_user_id" AND "deleted_at" IS NULL;
    IF service_code NOT IN ('FLYER', 'FLIPBOOK') OR NOT FOUND OR kickoff_role <> 'PLATFORM_ADMIN' THEN
      RAISE EXCEPTION 'Design kickoff requires Flyer/Flipbook and a real Platform Admin actor.' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "event_validate_commercial_lock"
  AFTER INSERT OR UPDATE ON "event"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_event_commercial_lock();
