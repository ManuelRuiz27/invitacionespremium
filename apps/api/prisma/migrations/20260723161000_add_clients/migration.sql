CREATE TYPE "client_type" AS ENUM (
  'PLANNER',
  'ORGANIZATION'
);

CREATE TYPE "client_status" AS ENUM (
  'ACTIVE',
  'SUSPENDED'
);

CREATE TABLE "client" (
  "id" UUID NOT NULL,
  "type" "client_type" NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "status" "client_status" NOT NULL DEFAULT 'ACTIVE',
  "suspended_at" TIMESTAMPTZ(6),
  "suspension_reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),

  CONSTRAINT "client_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_name_trimmed_check" CHECK ("name" = btrim("name") AND char_length("name") >= 2),
  CONSTRAINT "client_suspension_state_check" CHECK (
    ("status" = 'ACTIVE' AND "suspended_at" IS NULL AND "suspension_reason" IS NULL)
    OR
    ("status" = 'SUSPENDED' AND "suspended_at" IS NOT NULL)
  )
);

CREATE INDEX "client_type_status_deleted_at_idx" ON "client"("type", "status", "deleted_at");
CREATE INDEX "client_status_deleted_at_idx" ON "client"("status", "deleted_at");

ALTER TABLE "app_user"
  ADD CONSTRAINT "app_user_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "client"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "app_user_active_independent_planner_client_key"
  ON "app_user"("client_id")
  WHERE "role" = 'INDEPENDENT_PLANNER' AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX "app_user_active_organization_admin_client_key"
  ON "app_user"("client_id")
  WHERE "role" = 'ORGANIZATION_ADMIN' AND "deleted_at" IS NULL;

CREATE OR REPLACE FUNCTION enforce_app_user_client_compatibility()
RETURNS TRIGGER AS $$
DECLARE
  resolved_client_type "client_type";
  resolved_client_deleted_at TIMESTAMPTZ(6);
BEGIN
  IF NEW."role" = 'PLATFORM_ADMIN' THEN
    IF NEW."client_id" IS NOT NULL THEN
      RAISE EXCEPTION 'Platform Admin cannot belong to an operational Client.' USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW."client_id" IS NULL THEN
    RAISE EXCEPTION 'Operational users must belong to a Client.' USING ERRCODE = '23514';
  END IF;

  SELECT "type", "deleted_at"
    INTO resolved_client_type, resolved_client_deleted_at
    FROM "client"
    WHERE "id" = NEW."client_id";

  IF NOT FOUND OR resolved_client_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Operational users require an existing active Client record.' USING ERRCODE = '23514';
  END IF;

  IF NEW."role" = 'INDEPENDENT_PLANNER' AND resolved_client_type <> 'PLANNER' THEN
    RAISE EXCEPTION 'Independent Planner requires a Planner Client.' USING ERRCODE = '23514';
  END IF;

  IF NEW."role" IN ('ORGANIZATION_ADMIN', 'ORGANIZATION_PLANNER')
     AND resolved_client_type <> 'ORGANIZATION' THEN
    RAISE EXCEPTION 'Organization users require an Organization Client.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "app_user_client_compatibility_trigger"
  BEFORE INSERT OR UPDATE OF "role", "client_id"
  ON "app_user"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_app_user_client_compatibility();
