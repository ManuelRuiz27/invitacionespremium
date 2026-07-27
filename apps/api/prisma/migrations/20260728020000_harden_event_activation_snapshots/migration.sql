ALTER TABLE "event"
  ADD CONSTRAINT "event_activation_state_snapshot_check" CHECK (
    (
      "status" IN ('draft', 'configured', 'ready_to_activate')
      AND "activated_at" IS NULL
    )
    OR
    (
      "status" IN ('active', 'event_day', 'closed', 'album_published', 'archived')
      AND "activated_at" IS NOT NULL
    )
    OR "status" = 'cancelled'
  );

CREATE OR REPLACE FUNCTION prevent_event_activation_snapshot_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."activated_at" IS NOT NULL THEN
      RAISE EXCEPTION 'Activated Event snapshots are immutable and cannot be deleted.'
        USING ERRCODE = '23514';
    END IF;

    RETURN OLD;
  END IF;

  IF OLD."activated_at" IS NOT NULL AND (
    OLD."activated_at" IS DISTINCT FROM NEW."activated_at"
    OR OLD."activated_by_user_id" IS DISTINCT FROM NEW."activated_by_user_id"
    OR OLD."activated_service_id" IS DISTINCT FROM NEW."activated_service_id"
    OR OLD."activated_service_price_id" IS DISTINCT FROM NEW."activated_service_price_id"
    OR OLD."base_cost_credits" IS DISTINCT FROM NEW."base_cost_credits"
    OR OLD."promotion_discount_credits" IS DISTINCT FROM NEW."promotion_discount_credits"
    OR OLD."final_cost_credits" IS DISTINCT FROM NEW."final_cost_credits"
    OR OLD."purchased_credits_used" IS DISTINCT FROM NEW."purchased_credits_used"
    OR OLD."credit_line_credits_used" IS DISTINCT FROM NEW."credit_line_credits_used"
    OR OLD."credit_unit_value_mxn_cents_snapshot"
      IS DISTINCT FROM NEW."credit_unit_value_mxn_cents_snapshot"
    OR OLD."activation_receipt_id" IS DISTINCT FROM NEW."activation_receipt_id"
    OR OLD."activation_idempotency_key" IS DISTINCT FROM NEW."activation_idempotency_key"
  ) THEN
    RAISE EXCEPTION 'Activated Event snapshots are immutable.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "event_activation_snapshot_immutable_trigger"
  BEFORE UPDATE OR DELETE
  ON "event"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_event_activation_snapshot_mutation();

CREATE OR REPLACE FUNCTION validate_event_activation_snapshot_references()
RETURNS TRIGGER AS $$
DECLARE
  event_client_type "client_type";
  price_service_id UUID;
  price_client_type "client_type";
  receipt_client_id UUID;
  receipt_operation_type VARCHAR(80);
  receipt_operation_reference VARCHAR(128);
  receipt_idempotency_key VARCHAR(128);
  actor_client_id UUID;
  actor_role "user_role";
  actor_deleted_at TIMESTAMPTZ(6);
BEGIN
  IF NEW."activated_at" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "type"
    INTO event_client_type
    FROM "client"
    WHERE "id" = NEW."client_id";

  SELECT "service_id", "client_type"
    INTO price_service_id, price_client_type
    FROM "service_price"
    WHERE "id" = NEW."activated_service_price_id";

  IF NOT FOUND
    OR price_service_id IS DISTINCT FROM NEW."activated_service_id"
    OR price_client_type IS DISTINCT FROM event_client_type
  THEN
    RAISE EXCEPTION 'Event activation price must match the activated Service and Client type.'
      USING ERRCODE = '23514';
  END IF;

  SELECT "client_id", "operation_type", "operation_reference", "idempotency_key"
    INTO
      receipt_client_id,
      receipt_operation_type,
      receipt_operation_reference,
      receipt_idempotency_key
    FROM "receipt"
    WHERE "id" = NEW."activation_receipt_id";

  IF NOT FOUND
    OR receipt_client_id IS DISTINCT FROM NEW."client_id"
    OR receipt_operation_type IS DISTINCT FROM 'EVENT_ACTIVATION'
    OR receipt_operation_reference IS DISTINCT FROM NEW."id"::TEXT
    OR receipt_idempotency_key IS DISTINCT FROM NEW."activation_idempotency_key"
  THEN
    RAISE EXCEPTION 'Event activation Receipt must match the Event, Client, operation and idempotency key.'
      USING ERRCODE = '23514';
  END IF;

  SELECT "client_id", "role", "deleted_at"
    INTO actor_client_id, actor_role, actor_deleted_at
    FROM "app_user"
    WHERE "id" = NEW."activated_by_user_id";

  IF NOT FOUND
    OR actor_client_id IS DISTINCT FROM NEW."client_id"
    OR actor_deleted_at IS NOT NULL
    OR actor_role NOT IN (
      'INDEPENDENT_PLANNER',
      'ORGANIZATION_ADMIN',
      'ORGANIZATION_PLANNER'
    )
    OR (
      actor_role = 'ORGANIZATION_PLANNER'
      AND NEW."activated_by_user_id" IS DISTINCT FROM NEW."created_by_user_id"
    )
  THEN
    RAISE EXCEPTION 'Event activation actor is not authorized for this Event and Client.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "event_activation_snapshot_references_trigger"
  BEFORE INSERT OR UPDATE OF
    "client_id",
    "created_by_user_id",
    "activated_at",
    "activated_by_user_id",
    "activated_service_id",
    "activated_service_price_id",
    "base_cost_credits",
    "promotion_discount_credits",
    "final_cost_credits",
    "purchased_credits_used",
    "credit_line_credits_used",
    "credit_unit_value_mxn_cents_snapshot",
    "activation_receipt_id",
    "activation_idempotency_key"
  ON "event"
  FOR EACH ROW
  EXECUTE FUNCTION validate_event_activation_snapshot_references();
