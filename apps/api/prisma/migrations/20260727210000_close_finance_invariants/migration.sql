CREATE TYPE "payment_provider" AS ENUM ('MANUAL');

ALTER TABLE "payment"
  ADD COLUMN "provider" "payment_provider" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "idempotency_key" VARCHAR(128),
  ADD COLUMN "metadata" JSONB;

UPDATE "payment" AS payment
SET "idempotency_key" = receipt."idempotency_key"
FROM "receipt" AS receipt
WHERE receipt."id" = payment."receipt_id";

ALTER TABLE "payment"
  ALTER COLUMN "idempotency_key" SET NOT NULL;

ALTER TABLE "payment"
  ADD CONSTRAINT "payment_idempotency_key_key" UNIQUE ("idempotency_key"),
  ADD CONSTRAINT "payment_provider_external_reference_key"
    UNIQUE ("provider", "external_reference");

CREATE OR REPLACE FUNCTION apply_ledger_to_finance_balance()
RETURNS TRIGGER AS $$
DECLARE
  debt_mxn_delta BIGINT := 0;
  resolved_limit INTEGER := 0;
BEGIN
  IF NEW."movement_type" = 'CREDIT_LINE_USAGE' THEN
    debt_mxn_delta :=
      NEW."debt_delta"::BIGINT * NEW."credit_unit_value_mxn_cents_snapshot"::BIGINT;
  ELSIF NEW."movement_type" = 'DEBT_PAYMENT' THEN
    debt_mxn_delta := -NEW."cash_mxn_delta";
  ELSIF NEW."debt_delta" <> 0
        AND NEW."credit_unit_value_mxn_cents_snapshot" IS NOT NULL THEN
    debt_mxn_delta :=
      NEW."debt_delta"::BIGINT * NEW."credit_unit_value_mxn_cents_snapshot"::BIGINT;
  END IF;

  SELECT COALESCE("limit_credits", 0)
    INTO resolved_limit
    FROM "credit_line"
    WHERE "client_id" = NEW."client_id";
  resolved_limit := COALESCE(resolved_limit, 0);

  INSERT INTO "finance_balance" (
    "client_id",
    "credit_line_limit"
  )
  VALUES (
    NEW."client_id",
    resolved_limit
  )
  ON CONFLICT ("client_id") DO NOTHING;

  UPDATE "finance_balance"
  SET
    "purchased_credits" =
      "finance_balance"."purchased_credits" + NEW."purchased_credit_delta",
    "credit_line_used" =
      "finance_balance"."credit_line_used" + NEW."credit_line_used_delta",
    "debt_credits" =
      "finance_balance"."debt_credits" + NEW."debt_delta",
    "debt_mxn_cents" =
      "finance_balance"."debt_mxn_cents" + debt_mxn_delta,
    "last_ledger_sequence" =
      GREATEST(COALESCE("finance_balance"."last_ledger_sequence", 0), NEW."sequence"),
    "updated_at" = CURRENT_TIMESTAMP
  WHERE "client_id" = NEW."client_id";

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_inserted_debt_payment_allocation_totals()
RETURNS TRIGGER AS $$
DECLARE
  payment_type "ledger_movement_type";
  payment_debt_delta INTEGER;
  payment_cash_mxn_delta BIGINT;
  allocated_credits INTEGER;
  allocated_amount BIGINT;
BEGIN
  SELECT
    "movement_type",
    "debt_delta",
    "cash_mxn_delta"
  INTO payment_type, payment_debt_delta, payment_cash_mxn_delta
  FROM "ledger_entry"
  WHERE "id" = NEW."payment_ledger_entry_id";

  IF payment_type IS DISTINCT FROM 'DEBT_PAYMENT' THEN
    RAISE EXCEPTION 'Debt payment allocation must reference a DEBT_PAYMENT entry.'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    COALESCE(SUM("credits"), 0),
    COALESCE(SUM("amount_mxn_cents"), 0)
  INTO allocated_credits, allocated_amount
  FROM "debt_payment_allocation"
  WHERE "payment_ledger_entry_id" = NEW."payment_ledger_entry_id";

  IF allocated_credits <> -payment_debt_delta
     OR allocated_amount <> payment_cash_mxn_delta THEN
    RAISE EXCEPTION 'Debt payment totals must match their lot allocations.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "debt_payment_allocation_totals_trigger"
  AFTER INSERT ON "debt_payment_allocation"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION validate_inserted_debt_payment_allocation_totals();
