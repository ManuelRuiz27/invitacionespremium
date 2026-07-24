CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "service_code" AS ENUM (
  'FLIPBOOK',
  'FLYER',
  'PHYSICAL_QR',
  'DEMO'
);

CREATE TYPE "promotion_scope" AS ENUM (
  'CREDIT_PURCHASE',
  'EVENT_ACTIVATION'
);

CREATE TABLE "service" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" "service_code" NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "service_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_price" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "service_id" UUID NOT NULL,
  "client_type" "client_type" NOT NULL,
  "credits" INTEGER NOT NULL,
  "valid_from" TIMESTAMPTZ(6) NOT NULL,
  "valid_until" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "service_price_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_price_credits_check" CHECK ("credits" >= 0),
  CONSTRAINT "service_price_validity_check" CHECK (
    "valid_until" IS NULL OR "valid_until" > "valid_from"
  )
);

CREATE TABLE "promotion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(160) NOT NULL,
  "scope" "promotion_scope" NOT NULL,
  "client_id" UUID,
  "client_type" "client_type",
  "service_id" UUID,
  "valid_from" TIMESTAMPTZ(6) NOT NULL,
  "valid_until" TIMESTAMPTZ(6),
  "is_active" BOOLEAN NOT NULL DEFAULT false,
  "allows_stacking" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "promotion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promotion_name_check" CHECK (
    "name" = btrim("name") AND char_length("name") >= 2
  ),
  CONSTRAINT "promotion_validity_check" CHECK (
    "valid_until" IS NULL OR "valid_until" > "valid_from"
  )
);

CREATE UNIQUE INDEX "service_code_key" ON "service"("code");
CREATE INDEX "service_is_active_code_idx" ON "service"("is_active", "code");
CREATE UNIQUE INDEX "service_price_service_id_client_type_valid_from_key"
  ON "service_price"("service_id", "client_type", "valid_from");
CREATE INDEX "service_price_client_type_valid_from_valid_until_idx"
  ON "service_price"("client_type", "valid_from", "valid_until");
CREATE INDEX "service_price_service_id_client_type_valid_from_idx"
  ON "service_price"("service_id", "client_type", "valid_from");
CREATE INDEX "promotion_is_active_scope_valid_from_valid_until_idx"
  ON "promotion"("is_active", "scope", "valid_from", "valid_until");
CREATE INDEX "promotion_client_id_is_active_idx" ON "promotion"("client_id", "is_active");
CREATE INDEX "promotion_client_type_is_active_idx" ON "promotion"("client_type", "is_active");
CREATE INDEX "promotion_service_id_is_active_idx" ON "promotion"("service_id", "is_active");

ALTER TABLE "service_price"
  ADD CONSTRAINT "service_price_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "service"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "promotion"
  ADD CONSTRAINT "promotion_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "client"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "promotion"
  ADD CONSTRAINT "promotion_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "service"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_price"
  ADD CONSTRAINT "service_price_no_overlap"
  EXCLUDE USING gist (
    "service_id" WITH =,
    "client_type" WITH =,
    tstzrange("valid_from", "valid_until", '[)') WITH &&
  );

CREATE OR REPLACE FUNCTION enforce_demo_price_zero()
RETURNS TRIGGER AS $$
DECLARE
  resolved_service_code "service_code";
BEGIN
  SELECT "code"
    INTO resolved_service_code
    FROM "service"
    WHERE "id" = NEW."service_id";

  IF resolved_service_code = 'DEMO' AND NEW."credits" <> 0 THEN
    RAISE EXCEPTION 'DEMO service price must be zero.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "service_price_demo_zero_trigger"
  BEFORE INSERT OR UPDATE OF "service_id", "credits"
  ON "service_price"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_demo_price_zero();

CREATE OR REPLACE FUNCTION enforce_demo_service_prices_zero()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."code" = 'DEMO'
     AND EXISTS (
       SELECT 1
       FROM "service_price"
       WHERE "service_id" = NEW."id" AND "credits" <> 0
     ) THEN
    RAISE EXCEPTION 'DEMO service prices must all be zero.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "service_demo_prices_zero_trigger"
  BEFORE UPDATE OF "code"
  ON "service"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_demo_service_prices_zero();

INSERT INTO "service" ("code")
VALUES
  ('FLIPBOOK'),
  ('FLYER'),
  ('PHYSICAL_QR'),
  ('DEMO')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "service_price" (
  "service_id",
  "client_type",
  "credits",
  "valid_from"
)
SELECT
  service."id",
  initial_price."client_type"::"client_type",
  initial_price."credits",
  TIMESTAMPTZ '2026-07-24 00:00:00+00'
FROM (
  VALUES
    ('FLIPBOOK'::"service_code", 'PLANNER', 30),
    ('FLYER'::"service_code", 'PLANNER', 20),
    ('PHYSICAL_QR'::"service_code", 'PLANNER', 15),
    ('DEMO'::"service_code", 'PLANNER', 0),
    ('FLIPBOOK'::"service_code", 'ORGANIZATION', 27),
    ('FLYER'::"service_code", 'ORGANIZATION', 17),
    ('PHYSICAL_QR'::"service_code", 'ORGANIZATION', 10),
    ('DEMO'::"service_code", 'ORGANIZATION', 0)
) AS initial_price("code", "client_type", "credits")
JOIN "service" ON service."code" = initial_price."code"
ON CONFLICT ("service_id", "client_type", "valid_from") DO NOTHING;
