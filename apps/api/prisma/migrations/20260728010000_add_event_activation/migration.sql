ALTER TABLE "event"
  ADD COLUMN "activated_at" TIMESTAMPTZ(6),
  ADD COLUMN "activated_by_user_id" UUID,
  ADD COLUMN "activated_service_id" UUID,
  ADD COLUMN "activated_service_price_id" UUID,
  ADD COLUMN "base_cost_credits" INTEGER,
  ADD COLUMN "promotion_discount_credits" INTEGER,
  ADD COLUMN "final_cost_credits" INTEGER,
  ADD COLUMN "purchased_credits_used" INTEGER,
  ADD COLUMN "credit_line_credits_used" INTEGER,
  ADD COLUMN "credit_unit_value_mxn_cents_snapshot" INTEGER,
  ADD COLUMN "activation_receipt_id" UUID,
  ADD COLUMN "activation_idempotency_key" VARCHAR(128);

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
      AND "activated_service_price_id" IS NOT NULL
      AND "base_cost_credits" >= 0
      AND "promotion_discount_credits" = 0
      AND "final_cost_credits" = "base_cost_credits" - "promotion_discount_credits"
      AND "purchased_credits_used" >= 0
      AND "credit_line_credits_used" >= 0
      AND "purchased_credits_used" + "credit_line_credits_used" = "final_cost_credits"
      AND (
        ("credit_line_credits_used" = 0 AND "credit_unit_value_mxn_cents_snapshot" IS NULL)
        OR
        (
          "credit_line_credits_used" > 0
          AND "credit_unit_value_mxn_cents_snapshot" > 0
        )
      )
      AND "activation_receipt_id" IS NOT NULL
      AND "activation_idempotency_key" IS NOT NULL
      AND char_length("activation_idempotency_key") BETWEEN 8 AND 128
    )
  );

CREATE UNIQUE INDEX "event_activation_receipt_id_key"
  ON "event"("activation_receipt_id");
CREATE UNIQUE INDEX "event_activation_idempotency_key_key"
  ON "event"("activation_idempotency_key");
CREATE INDEX "event_activated_at_idx" ON "event"("activated_at");

ALTER TABLE "event"
  ADD CONSTRAINT "event_activated_by_user_id_fkey"
  FOREIGN KEY ("activated_by_user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "event"
  ADD CONSTRAINT "event_activated_service_id_fkey"
  FOREIGN KEY ("activated_service_id") REFERENCES "service"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "event"
  ADD CONSTRAINT "event_activated_service_price_id_fkey"
  FOREIGN KEY ("activated_service_price_id") REFERENCES "service_price"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "event"
  ADD CONSTRAINT "event_activation_receipt_id_fkey"
  FOREIGN KEY ("activation_receipt_id") REFERENCES "receipt"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ledger_entry"
  ADD CONSTRAINT "ledger_entry_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "event"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
