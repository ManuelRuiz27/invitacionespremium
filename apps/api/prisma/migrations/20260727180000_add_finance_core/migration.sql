CREATE TYPE "ledger_movement_type" AS ENUM (
  'CREDIT_PURCHASE',
  'MANUAL_CREDIT_GRANT',
  'EVENT_ACTIVATION_CHARGE',
  'CREDIT_LINE_USAGE',
  'DEBT_PAYMENT',
  'EVENT_CREDIT_REFUND',
  'LEDGER_REVERSAL',
  'PROMOTION_DISCOUNT'
);

CREATE TYPE "payment_status" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'REFUNDED'
);

CREATE TYPE "credit_line_status" AS ENUM (
  'ACTIVE',
  'SUSPENDED'
);

CREATE TABLE "finance_balance" (
  "client_id" UUID NOT NULL,
  "purchased_credits" INTEGER NOT NULL DEFAULT 0,
  "credit_line_limit" INTEGER NOT NULL DEFAULT 0,
  "credit_line_used" INTEGER NOT NULL DEFAULT 0,
  "debt_credits" INTEGER NOT NULL DEFAULT 0,
  "debt_mxn_cents" BIGINT NOT NULL DEFAULT 0,
  "last_ledger_sequence" BIGINT,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "finance_balance_pkey" PRIMARY KEY ("client_id"),
  CONSTRAINT "finance_balance_nonnegative_check" CHECK (
    "purchased_credits" >= 0
    AND "credit_line_limit" >= 0
    AND "credit_line_used" >= 0
    AND "debt_credits" >= 0
    AND "debt_mxn_cents" >= 0
  ),
  CONSTRAINT "finance_balance_credit_line_limit_check" CHECK (
    "credit_line_used" <= "credit_line_limit"
  ),
  CONSTRAINT "finance_balance_debt_matches_line_check" CHECK (
    "debt_credits" = "credit_line_used"
  )
);

CREATE TABLE "credit_line" (
  "client_id" UUID NOT NULL,
  "limit_credits" INTEGER NOT NULL,
  "status" "credit_line_status" NOT NULL,
  "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6),
  "notes" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "credit_line_pkey" PRIMARY KEY ("client_id"),
  CONSTRAINT "credit_line_limit_check" CHECK ("limit_credits" >= 0)
);

CREATE TABLE "receipt_folio_counter" (
  "singleton" BOOLEAN NOT NULL DEFAULT true,
  "next_folio" BIGINT NOT NULL DEFAULT 1,

  CONSTRAINT "receipt_folio_counter_pkey" PRIMARY KEY ("singleton"),
  CONSTRAINT "receipt_folio_counter_singleton_check" CHECK ("singleton"),
  CONSTRAINT "receipt_folio_counter_next_check" CHECK ("next_folio" > 0)
);

INSERT INTO "receipt_folio_counter" ("singleton", "next_folio")
VALUES (true, 1);

CREATE TABLE "receipt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "folio" BIGINT NOT NULL,
  "client_id" UUID NOT NULL,
  "operation_type" VARCHAR(80) NOT NULL,
  "operation_reference" VARCHAR(128) NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "result_snapshot" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "receipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "receipt_operation_type_check" CHECK (
    "operation_type" = btrim("operation_type")
    AND char_length("operation_type") > 0
  ),
  CONSTRAINT "receipt_operation_reference_check" CHECK (
    "operation_reference" = btrim("operation_reference")
    AND char_length("operation_reference") > 0
  ),
  CONSTRAINT "receipt_idempotency_key_check" CHECK (
    "idempotency_key" = btrim("idempotency_key")
    AND char_length("idempotency_key") >= 8
  )
);

CREATE TABLE "payment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "client_id" UUID NOT NULL,
  "receipt_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "status" "payment_status" NOT NULL,
  "amount_mxn_cents" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
  "external_reference" VARCHAR(160) NOT NULL,
  "approved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_amount_check" CHECK ("amount_mxn_cents" > 0),
  CONSTRAINT "payment_currency_check" CHECK ("currency" = 'MXN'),
  CONSTRAINT "payment_reference_check" CHECK (
    "external_reference" = btrim("external_reference")
    AND char_length("external_reference") > 0
  ),
  CONSTRAINT "payment_approval_check" CHECK (
    ("status" = 'APPROVED' AND "approved_at" IS NOT NULL)
    OR ("status" <> 'APPROVED' AND "approved_at" IS NULL)
  )
);

CREATE TABLE "ledger_entry" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sequence" BIGSERIAL NOT NULL,
  "client_id" UUID NOT NULL,
  "event_id" UUID,
  "actor_user_id" UUID,
  "movement_type" "ledger_movement_type" NOT NULL,
  "purchased_credit_delta" INTEGER NOT NULL,
  "credit_line_used_delta" INTEGER NOT NULL,
  "debt_delta" INTEGER NOT NULL,
  "cash_mxn_delta" BIGINT NOT NULL,
  "credit_unit_value_mxn_cents_snapshot" INTEGER,
  "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
  "operation_reference" VARCHAR(128) NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "related_ledger_entry_id" UUID,
  "reverses_ledger_entry_id" UUID,
  "promotion_id" UUID,
  "payment_id" UUID,
  "receipt_id" UUID NOT NULL,
  "due_at" TIMESTAMPTZ(6),
  "allocation_metadata" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ledger_entry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ledger_entry_currency_check" CHECK ("currency" = 'MXN'),
  CONSTRAINT "ledger_entry_unit_value_check" CHECK (
    "credit_unit_value_mxn_cents_snapshot" IS NULL
    OR "credit_unit_value_mxn_cents_snapshot" > 0
  ),
  CONSTRAINT "ledger_entry_operation_reference_check" CHECK (
    "operation_reference" = btrim("operation_reference")
    AND char_length("operation_reference") > 0
  ),
  CONSTRAINT "ledger_entry_idempotency_key_check" CHECK (
    "idempotency_key" = btrim("idempotency_key")
    AND char_length("idempotency_key") >= 8
  ),
  CONSTRAINT "ledger_entry_effect_check" CHECK (
    (
      "movement_type" = 'CREDIT_PURCHASE'
      AND "purchased_credit_delta" > 0
      AND "credit_line_used_delta" = 0
      AND "debt_delta" = 0
      AND "cash_mxn_delta" > 0
      AND "payment_id" IS NOT NULL
      AND "credit_unit_value_mxn_cents_snapshot" IS NOT NULL
      AND "cash_mxn_delta" =
        "purchased_credit_delta"::BIGINT * "credit_unit_value_mxn_cents_snapshot"::BIGINT
    )
    OR (
      "movement_type" = 'MANUAL_CREDIT_GRANT'
      AND "purchased_credit_delta" > 0
      AND "credit_line_used_delta" = 0
      AND "debt_delta" = 0
      AND "cash_mxn_delta" = 0
      AND "payment_id" IS NULL
    )
    OR (
      "movement_type" = 'EVENT_ACTIVATION_CHARGE'
      AND "purchased_credit_delta" < 0
      AND "credit_line_used_delta" = 0
      AND "debt_delta" = 0
      AND "cash_mxn_delta" = 0
      AND "event_id" IS NOT NULL
    )
    OR (
      "movement_type" = 'CREDIT_LINE_USAGE'
      AND "purchased_credit_delta" = 0
      AND "credit_line_used_delta" > 0
      AND "debt_delta" = "credit_line_used_delta"
      AND "cash_mxn_delta" = 0
      AND "event_id" IS NOT NULL
      AND "credit_unit_value_mxn_cents_snapshot" IS NOT NULL
    )
    OR (
      "movement_type" = 'DEBT_PAYMENT'
      AND "purchased_credit_delta" = 0
      AND "credit_line_used_delta" < 0
      AND "debt_delta" = "credit_line_used_delta"
      AND "cash_mxn_delta" > 0
      AND "payment_id" IS NOT NULL
    )
    OR (
      "movement_type" = 'EVENT_CREDIT_REFUND'
      AND "cash_mxn_delta" = 0
      AND "event_id" IS NOT NULL
      AND (
        ("purchased_credit_delta" > 0 AND "credit_line_used_delta" = 0 AND "debt_delta" = 0)
        OR (
          "purchased_credit_delta" = 0
          AND "credit_line_used_delta" < 0
          AND "debt_delta" = "credit_line_used_delta"
          AND "credit_unit_value_mxn_cents_snapshot" IS NOT NULL
        )
      )
    )
    OR (
      "movement_type" = 'LEDGER_REVERSAL'
      AND "reverses_ledger_entry_id" IS NOT NULL
    )
    OR (
      "movement_type" = 'PROMOTION_DISCOUNT'
      AND "purchased_credit_delta" = 0
      AND "credit_line_used_delta" = 0
      AND "debt_delta" = 0
      AND "cash_mxn_delta" = 0
      AND "promotion_id" IS NOT NULL
    )
  )
);

CREATE TABLE "debt_payment_allocation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "debt_lot_ledger_entry_id" UUID NOT NULL,
  "payment_ledger_entry_id" UUID NOT NULL,
  "credits" INTEGER NOT NULL,
  "amount_mxn_cents" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "debt_payment_allocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "debt_payment_allocation_credits_check" CHECK ("credits" > 0),
  CONSTRAINT "debt_payment_allocation_amount_check" CHECK ("amount_mxn_cents" > 0)
);

CREATE UNIQUE INDEX "receipt_folio_key" ON "receipt"("folio");
CREATE UNIQUE INDEX "receipt_idempotency_key_key" ON "receipt"("idempotency_key");
CREATE INDEX "receipt_client_id_created_at_idx" ON "receipt"("client_id", "created_at");
CREATE UNIQUE INDEX "payment_receipt_id_key" ON "payment"("receipt_id");
CREATE INDEX "payment_client_id_created_at_idx" ON "payment"("client_id", "created_at");
CREATE INDEX "payment_status_approved_at_idx" ON "payment"("status", "approved_at");
CREATE INDEX "credit_line_status_expires_at_idx" ON "credit_line"("status", "expires_at");
CREATE UNIQUE INDEX "ledger_entry_sequence_key" ON "ledger_entry"("sequence");
CREATE INDEX "ledger_entry_idempotency_key_idx" ON "ledger_entry"("idempotency_key");
CREATE UNIQUE INDEX "ledger_entry_reverses_ledger_entry_id_key"
  ON "ledger_entry"("reverses_ledger_entry_id");
CREATE INDEX "ledger_entry_client_id_sequence_idx" ON "ledger_entry"("client_id", "sequence");
CREATE INDEX "ledger_entry_client_id_created_at_idx" ON "ledger_entry"("client_id", "created_at");
CREATE INDEX "ledger_entry_movement_type_created_at_idx"
  ON "ledger_entry"("movement_type", "created_at");
CREATE INDEX "ledger_entry_payment_id_idx" ON "ledger_entry"("payment_id");
CREATE INDEX "ledger_entry_receipt_id_idx" ON "ledger_entry"("receipt_id");
CREATE UNIQUE INDEX "debt_payment_allocation_debt_lot_payment_key"
  ON "debt_payment_allocation"("debt_lot_ledger_entry_id", "payment_ledger_entry_id");
CREATE INDEX "debt_payment_allocation_payment_idx"
  ON "debt_payment_allocation"("payment_ledger_entry_id");

ALTER TABLE "finance_balance"
  ADD CONSTRAINT "finance_balance_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "client"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_line"
  ADD CONSTRAINT "credit_line_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "client"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receipt"
  ADD CONSTRAINT "receipt_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "client"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment"
  ADD CONSTRAINT "payment_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "client"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment"
  ADD CONSTRAINT "payment_receipt_id_fkey"
  FOREIGN KEY ("receipt_id") REFERENCES "receipt"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment"
  ADD CONSTRAINT "payment_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entry"
  ADD CONSTRAINT "ledger_entry_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "client"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entry"
  ADD CONSTRAINT "ledger_entry_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entry"
  ADD CONSTRAINT "ledger_entry_related_ledger_entry_id_fkey"
  FOREIGN KEY ("related_ledger_entry_id") REFERENCES "ledger_entry"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entry"
  ADD CONSTRAINT "ledger_entry_reverses_ledger_entry_id_fkey"
  FOREIGN KEY ("reverses_ledger_entry_id") REFERENCES "ledger_entry"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entry"
  ADD CONSTRAINT "ledger_entry_promotion_id_fkey"
  FOREIGN KEY ("promotion_id") REFERENCES "promotion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entry"
  ADD CONSTRAINT "ledger_entry_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payment"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entry"
  ADD CONSTRAINT "ledger_entry_receipt_id_fkey"
  FOREIGN KEY ("receipt_id") REFERENCES "receipt"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "debt_payment_allocation"
  ADD CONSTRAINT "debt_payment_allocation_debt_lot_fkey"
  FOREIGN KEY ("debt_lot_ledger_entry_id") REFERENCES "ledger_entry"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "debt_payment_allocation"
  ADD CONSTRAINT "debt_payment_allocation_payment_fkey"
  FOREIGN KEY ("payment_ledger_entry_id") REFERENCES "ledger_entry"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION assign_receipt_folio()
RETURNS TRIGGER AS $$
DECLARE
  assigned_folio BIGINT;
BEGIN
  SELECT "next_folio"
    INTO assigned_folio
    FROM "receipt_folio_counter"
    WHERE "singleton" = true
    FOR UPDATE;

  UPDATE "receipt_folio_counter"
    SET "next_folio" = assigned_folio + 1
    WHERE "singleton" = true;

  NEW."folio" := assigned_folio;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "receipt_assign_folio_trigger"
  BEFORE INSERT ON "receipt"
  FOR EACH ROW
  EXECUTE FUNCTION assign_receipt_folio();

CREATE OR REPLACE FUNCTION protect_receipt_folio()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."folio" <> OLD."folio" THEN
    RAISE EXCEPTION 'Receipt folio is immutable.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "receipt_protect_folio_trigger"
  BEFORE UPDATE OF "folio" ON "receipt"
  FOR EACH ROW
  EXECUTE FUNCTION protect_receipt_folio();

CREATE OR REPLACE FUNCTION reject_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Confirmed ledger entries are append-only and immutable.'
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_entry_immutable_trigger"
  BEFORE UPDATE OR DELETE ON "ledger_entry"
  FOR EACH ROW
  EXECUTE FUNCTION reject_ledger_mutation();

CREATE TRIGGER "ledger_entry_no_truncate_trigger"
  BEFORE TRUNCATE ON "ledger_entry"
  FOR EACH STATEMENT
  EXECUTE FUNCTION reject_ledger_mutation();

CREATE OR REPLACE FUNCTION validate_ledger_payment()
RETURNS TRIGGER AS $$
DECLARE
  resolved_status "payment_status";
  resolved_client_id UUID;
  resolved_receipt_id UUID;
BEGIN
  IF NEW."movement_type" NOT IN ('CREDIT_PURCHASE', 'DEBT_PAYMENT') THEN
    RETURN NEW;
  END IF;

  SELECT "status", "client_id", "receipt_id"
    INTO resolved_status, resolved_client_id, resolved_receipt_id
    FROM "payment"
    WHERE "id" = NEW."payment_id";

  IF resolved_status IS DISTINCT FROM 'APPROVED'
     OR resolved_client_id IS DISTINCT FROM NEW."client_id"
     OR resolved_receipt_id IS DISTINCT FROM NEW."receipt_id" THEN
    RAISE EXCEPTION 'CREDIT_PURCHASE and DEBT_PAYMENT require a matching approved Payment.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_entry_approved_payment_trigger"
  BEFORE INSERT ON "ledger_entry"
  FOR EACH ROW
  EXECUTE FUNCTION validate_ledger_payment();

CREATE OR REPLACE FUNCTION protect_confirmed_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ledger_entry"
    WHERE "payment_id" = OLD."id"
  ) THEN
    RAISE EXCEPTION 'A Payment linked to a confirmed ledger entry is immutable.'
      USING ERRCODE = '55000';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "payment_confirmed_immutable_trigger"
  BEFORE UPDATE OR DELETE ON "payment"
  FOR EACH ROW
  EXECUTE FUNCTION protect_confirmed_payment();

CREATE OR REPLACE FUNCTION validate_credit_line_usage()
RETURNS TRIGGER AS $$
DECLARE
  resolved_status "credit_line_status";
  resolved_expires_at TIMESTAMPTZ;
BEGIN
  IF NEW."movement_type" <> 'CREDIT_LINE_USAGE' THEN
    RETURN NEW;
  END IF;

  SELECT "status", "expires_at"
    INTO resolved_status, resolved_expires_at
    FROM "credit_line"
    WHERE "client_id" = NEW."client_id"
    FOR SHARE;

  IF resolved_status IS DISTINCT FROM 'ACTIVE'
     OR (resolved_expires_at IS NOT NULL AND resolved_expires_at <= NEW."created_at") THEN
    RAISE EXCEPTION 'CREDIT_LINE_USAGE requires an active, unexpired credit line.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_entry_active_credit_line_trigger"
  BEFORE INSERT ON "ledger_entry"
  FOR EACH ROW
  EXECUTE FUNCTION validate_credit_line_usage();

CREATE OR REPLACE FUNCTION protect_finance_balance()
RETURNS TRIGGER AS $$
DECLARE
  rebuild_enabled BOOLEAN :=
    COALESCE(current_setting('app.finance_balance_rebuild', true) = 'on', false);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF pg_trigger_depth() <= 1
       AND NOT rebuild_enabled
       AND (
         NEW."purchased_credits" <> 0
         OR NEW."credit_line_used" <> 0
         OR NEW."debt_credits" <> 0
         OR NEW."debt_mxn_cents" <> 0
         OR NEW."last_ledger_sequence" IS NOT NULL
       ) THEN
      RAISE EXCEPTION 'Financial balance values may only be derived from the ledger.'
        USING ERRCODE = '55000';
    END IF;
  ELSIF pg_trigger_depth() <= 1
        AND NOT rebuild_enabled
        AND (
          NEW."purchased_credits" <> OLD."purchased_credits"
          OR NEW."credit_line_used" <> OLD."credit_line_used"
          OR NEW."debt_credits" <> OLD."debt_credits"
          OR NEW."debt_mxn_cents" <> OLD."debt_mxn_cents"
          OR NEW."last_ledger_sequence" IS DISTINCT FROM OLD."last_ledger_sequence"
        ) THEN
    RAISE EXCEPTION 'Financial balance values may only be derived from the ledger.'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "finance_balance_ledger_only_trigger"
  BEFORE INSERT OR UPDATE ON "finance_balance"
  FOR EACH ROW
  EXECUTE FUNCTION protect_finance_balance();

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
    "last_ledger_sequence" = NEW."sequence",
    "updated_at" = CURRENT_TIMESTAMP
  WHERE "client_id" = NEW."client_id";

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_entry_apply_balance_trigger"
  AFTER INSERT ON "ledger_entry"
  FOR EACH ROW
  EXECUTE FUNCTION apply_ledger_to_finance_balance();

CREATE OR REPLACE FUNCTION validate_debt_payment_allocation()
RETURNS TRIGGER AS $$
DECLARE
  lot_type "ledger_movement_type";
  lot_client_id UUID;
  lot_credits INTEGER;
  lot_unit_value INTEGER;
  payment_type "ledger_movement_type";
  payment_client_id UUID;
  already_allocated INTEGER;
BEGIN
  SELECT
    "movement_type",
    "client_id",
    "debt_delta",
    "credit_unit_value_mxn_cents_snapshot"
  INTO lot_type, lot_client_id, lot_credits, lot_unit_value
  FROM "ledger_entry"
  WHERE "id" = NEW."debt_lot_ledger_entry_id"
  FOR UPDATE;

  SELECT "movement_type", "client_id"
  INTO payment_type, payment_client_id
  FROM "ledger_entry"
  WHERE "id" = NEW."payment_ledger_entry_id";

  IF lot_type IS DISTINCT FROM 'CREDIT_LINE_USAGE'
     OR payment_type IS DISTINCT FROM 'DEBT_PAYMENT'
     OR lot_client_id IS DISTINCT FROM payment_client_id THEN
    RAISE EXCEPTION 'Debt allocation must connect matching CREDIT_LINE_USAGE and DEBT_PAYMENT entries.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."amount_mxn_cents" <>
     NEW."credits"::BIGINT * lot_unit_value::BIGINT THEN
    RAISE EXCEPTION 'Debt allocation must use the historical credit unit value.'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM("credits"), 0)
  INTO already_allocated
  FROM "debt_payment_allocation"
  WHERE "debt_lot_ledger_entry_id" = NEW."debt_lot_ledger_entry_id";

  IF already_allocated + NEW."credits" > lot_credits THEN
    RAISE EXCEPTION 'Debt allocation exceeds the remaining lot credits.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "debt_payment_allocation_validate_trigger"
  BEFORE INSERT ON "debt_payment_allocation"
  FOR EACH ROW
  EXECUTE FUNCTION validate_debt_payment_allocation();

CREATE TRIGGER "debt_payment_allocation_immutable_trigger"
  BEFORE UPDATE OR DELETE ON "debt_payment_allocation"
  FOR EACH ROW
  EXECUTE FUNCTION reject_ledger_mutation();

CREATE OR REPLACE FUNCTION validate_debt_payment_totals()
RETURNS TRIGGER AS $$
DECLARE
  allocated_credits INTEGER;
  allocated_amount BIGINT;
BEGIN
  IF NEW."movement_type" <> 'DEBT_PAYMENT' THEN
    RETURN NULL;
  END IF;

  SELECT
    COALESCE(SUM("credits"), 0),
    COALESCE(SUM("amount_mxn_cents"), 0)
  INTO allocated_credits, allocated_amount
  FROM "debt_payment_allocation"
  WHERE "payment_ledger_entry_id" = NEW."id";

  IF allocated_credits <> -NEW."debt_delta"
     OR allocated_amount <> NEW."cash_mxn_delta" THEN
    RAISE EXCEPTION 'Debt payment totals must match their lot allocations.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "ledger_entry_debt_payment_totals_trigger"
  AFTER INSERT ON "ledger_entry"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION validate_debt_payment_totals();

CREATE OR REPLACE FUNCTION rebuild_finance_balance(target_client_id UUID)
RETURNS TABLE (
  purchased_credits INTEGER,
  credit_line_used INTEGER,
  debt_credits INTEGER,
  debt_mxn_cents BIGINT,
  last_ledger_sequence BIGINT
) AS $$
DECLARE
  resolved_limit INTEGER;
BEGIN
  PERFORM set_config('app.finance_balance_rebuild', 'on', true);

  SELECT COALESCE("limit_credits", 0)
    INTO resolved_limit
    FROM "credit_line"
    WHERE "client_id" = target_client_id;
  resolved_limit := COALESCE(resolved_limit, 0);

  SELECT
    COALESCE(SUM("purchased_credit_delta"), 0)::INTEGER,
    COALESCE(SUM("credit_line_used_delta"), 0)::INTEGER,
    COALESCE(SUM("debt_delta"), 0)::INTEGER,
    COALESCE(SUM(
      CASE
        WHEN "movement_type" = 'CREDIT_LINE_USAGE'
          THEN "debt_delta"::BIGINT * "credit_unit_value_mxn_cents_snapshot"::BIGINT
        WHEN "movement_type" = 'DEBT_PAYMENT'
          THEN -"cash_mxn_delta"
        WHEN "debt_delta" <> 0
             AND "credit_unit_value_mxn_cents_snapshot" IS NOT NULL
          THEN "debt_delta"::BIGINT * "credit_unit_value_mxn_cents_snapshot"::BIGINT
        ELSE 0
      END
    ), 0),
    MAX("sequence")
  INTO
    purchased_credits,
    credit_line_used,
    debt_credits,
    debt_mxn_cents,
    last_ledger_sequence
  FROM "ledger_entry"
  WHERE "client_id" = target_client_id;

  INSERT INTO "finance_balance" (
    "client_id",
    "purchased_credits",
    "credit_line_limit",
    "credit_line_used",
    "debt_credits",
    "debt_mxn_cents",
    "last_ledger_sequence"
  )
  VALUES (
    target_client_id,
    purchased_credits,
    resolved_limit,
    credit_line_used,
    debt_credits,
    debt_mxn_cents,
    last_ledger_sequence
  )
  ON CONFLICT ("client_id") DO UPDATE SET
    "purchased_credits" = EXCLUDED."purchased_credits",
    "credit_line_limit" = EXCLUDED."credit_line_limit",
    "credit_line_used" = EXCLUDED."credit_line_used",
    "debt_credits" = EXCLUDED."debt_credits",
    "debt_mxn_cents" = EXCLUDED."debt_mxn_cents",
    "last_ledger_sequence" = EXCLUDED."last_ledger_sequence",
    "updated_at" = CURRENT_TIMESTAMP;

  PERFORM set_config('app.finance_balance_rebuild', 'off', true);
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
