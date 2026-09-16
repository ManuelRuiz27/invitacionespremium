ALTER TABLE "event"
  DROP CONSTRAINT "event_activation_snapshot_check";

ALTER TABLE "event"
  ADD CONSTRAINT "event_activation_snapshot_check" CHECK (
    (
      "activated_at" IS NULL
      AND "activated_by_user_id" IS NULL
      AND "activated_service_id" IS NULL
      AND "activated_service_price_id" IS NULL
      AND "base_cost_credits" IS NULL
      AND "promotion_discount_credits" IS NULL
      AND "final_cost_credits" IS NULL
      AND "purchased_credits_used" IS NULL
      AND "credit_line_credits_used" IS NULL
      AND "credit_unit_value_mxn_cents_snapshot" IS NULL
      AND "activation_receipt_id" IS NULL
      AND "activation_idempotency_key" IS NULL
    )
    OR
    (
      "activated_at" IS NOT NULL
      AND "activated_by_user_id" IS NOT NULL
      AND "activated_service_id" IS NOT NULL
      AND "activation_idempotency_key" IS NOT NULL
      AND char_length("activation_idempotency_key") BETWEEN 8 AND 128
      AND (
        (
          "activated_service_price_id" IS NULL
          AND "base_cost_credits" IS NULL
          AND "promotion_discount_credits" IS NULL
          AND "final_cost_credits" IS NULL
          AND "purchased_credits_used" IS NULL
          AND "credit_line_credits_used" IS NULL
          AND "credit_unit_value_mxn_cents_snapshot" IS NULL
          AND "activation_receipt_id" IS NULL
        )
        OR
        (
          "activated_service_price_id" IS NOT NULL
          AND "base_cost_credits" IS NOT NULL
          AND "promotion_discount_credits" IS NOT NULL
          AND "final_cost_credits" IS NOT NULL
          AND "purchased_credits_used" IS NOT NULL
          AND "credit_line_credits_used" IS NOT NULL
          AND "activation_receipt_id" IS NOT NULL
          AND "base_cost_credits" >= 0
          AND "promotion_discount_credits" = 0
          AND "final_cost_credits" = "base_cost_credits" - "promotion_discount_credits"
          AND "purchased_credits_used" >= 0
          AND "credit_line_credits_used" >= 0
          AND "purchased_credits_used" + "credit_line_credits_used" = "final_cost_credits"
          AND (
            (
              "credit_line_credits_used" = 0
              AND "credit_unit_value_mxn_cents_snapshot" IS NULL
            )
            OR
            (
              "credit_line_credits_used" > 0
              AND "credit_unit_value_mxn_cents_snapshot" > 0
            )
          )
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION validate_event_activation_snapshot_references()
RETURNS TRIGGER AS $$
DECLARE
  event_client_type "client_type";
  event_operating_profile "client_operating_profile";
  event_commercial_channel "commercial_channel";
  price_service_id UUID;
  price_client_type "client_type";
  price_commercial_channel "commercial_channel";
  price_pricing_version INTEGER;
  price_capacity_min INTEGER;
  price_capacity_max INTEGER;
  receipt_client_id UUID;
  receipt_operation_type VARCHAR(80);
  receipt_operation_reference VARCHAR(128);
  receipt_idempotency_key VARCHAR(128);
  actor_client_id UUID;
  actor_role "user_role";
  actor_deleted_at TIMESTAMPTZ(6);
BEGIN
  IF NEW."activated_at" IS NULL THEN RETURN NEW; END IF;

  SELECT "type", "operating_profile", COALESCE("commercial_channel", 'STANDARD'::"commercial_channel")
    INTO event_client_type, event_operating_profile, event_commercial_channel
    FROM "client" WHERE "id" = NEW."client_id";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event activation requires a valid Client.'
      USING ERRCODE = '23514';
  END IF;

  IF event_operating_profile = 'MANAGED'::"client_operating_profile" THEN
    IF event_client_type IS DISTINCT FROM 'PLANNER'::"client_type" THEN
      RAISE EXCEPTION 'Managed activation requires a Managed Planner Client.'
        USING ERRCODE = '23514';
    END IF;

    PERFORM 1
      FROM "service"
      WHERE "id" = NEW."activated_service_id"
        AND "id" = NEW."service_id"
        AND "is_active" = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Managed activation Service must match the active configured Service.'
        USING ERRCODE = '23514';
    END IF;

    IF NEW."activated_service_price_id" IS NOT NULL
      OR NEW."base_cost_credits" IS NOT NULL
      OR NEW."promotion_discount_credits" IS NOT NULL
      OR NEW."final_cost_credits" IS NOT NULL
      OR NEW."purchased_credits_used" IS NOT NULL
      OR NEW."credit_line_credits_used" IS NOT NULL
      OR NEW."credit_unit_value_mxn_cents_snapshot" IS NOT NULL
      OR NEW."activation_receipt_id" IS NOT NULL
    THEN
      RAISE EXCEPTION 'Managed activation cannot contain financial snapshots or a Receipt.'
        USING ERRCODE = '23514';
    END IF;

    SELECT "client_id", "role", "deleted_at"
      INTO actor_client_id, actor_role, actor_deleted_at
      FROM "app_user" WHERE "id" = NEW."activated_by_user_id";

    IF NOT FOUND OR actor_client_id IS NOT NULL OR actor_deleted_at IS NOT NULL
      OR actor_role IS DISTINCT FROM 'PLATFORM_ADMIN'::"user_role"
    THEN
      RAISE EXCEPTION 'Managed activation actor must be an active Platform Admin.'
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  SELECT "service_id", "client_type", "commercial_channel", "pricing_version", "capacity_min", "capacity_max"
    INTO price_service_id, price_client_type, price_commercial_channel, price_pricing_version,
      price_capacity_min, price_capacity_max
    FROM "service_price" WHERE "id" = NEW."activated_service_price_id";

  IF NOT FOUND OR price_service_id IS DISTINCT FROM NEW."activated_service_id"
    OR (price_pricing_version = 1 AND price_client_type IS DISTINCT FROM event_client_type)
    OR (price_pricing_version = 2 AND price_commercial_channel IS DISTINCT FROM event_commercial_channel)
    OR (price_pricing_version = 2 AND price_commercial_channel IN ('STANDARD', 'PARTNER')
      AND (NEW."capacity" IS NULL OR NEW."capacity" < price_capacity_min OR NEW."capacity" > price_capacity_max))
  THEN
    RAISE EXCEPTION 'Event activation price must match the activated Service and Client commercial context.'
      USING ERRCODE = '23514';
  END IF;

  SELECT "client_id", "operation_type", "operation_reference", "idempotency_key"
    INTO receipt_client_id, receipt_operation_type, receipt_operation_reference, receipt_idempotency_key
    FROM "receipt" WHERE "id" = NEW."activation_receipt_id";

  IF NOT FOUND OR receipt_client_id IS DISTINCT FROM NEW."client_id"
    OR receipt_operation_type IS DISTINCT FROM 'EVENT_ACTIVATION'
    OR receipt_operation_reference IS DISTINCT FROM NEW."id"::TEXT
    OR receipt_idempotency_key IS DISTINCT FROM NEW."activation_idempotency_key"
  THEN
    RAISE EXCEPTION 'Event activation Receipt must match the Event, Client, operation and idempotency key.'
      USING ERRCODE = '23514';
  END IF;

  SELECT "client_id", "role", "deleted_at"
    INTO actor_client_id, actor_role, actor_deleted_at
    FROM "app_user" WHERE "id" = NEW."activated_by_user_id";

  IF NOT FOUND OR actor_client_id IS DISTINCT FROM NEW."client_id" OR actor_deleted_at IS NOT NULL
    OR actor_role NOT IN ('INDEPENDENT_PLANNER', 'ORGANIZATION_ADMIN', 'ORGANIZATION_PLANNER')
    OR (actor_role = 'ORGANIZATION_PLANNER'
      AND NEW."activated_by_user_id" IS DISTINCT FROM NEW."assigned_planner_user_id")
  THEN
    RAISE EXCEPTION 'Event activation actor is not authorized for this Event and Client.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
