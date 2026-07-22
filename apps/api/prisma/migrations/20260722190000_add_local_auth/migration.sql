CREATE TYPE "user_role" AS ENUM (
  'PLATFORM_ADMIN',
  'INDEPENDENT_PLANNER',
  'ORGANIZATION_ADMIN',
  'ORGANIZATION_PLANNER'
);

CREATE TABLE "app_user" (
  "id" UUID NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role" "user_role" NOT NULL,
  "client_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),

  CONSTRAINT "app_user_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "app_user_email_normalized_check" CHECK ("email" = lower(btrim("email"))),
  CONSTRAINT "app_user_role_client_check" CHECK (
    ("role" = 'PLATFORM_ADMIN' AND "client_id" IS NULL)
    OR
    ("role" <> 'PLATFORM_ADMIN' AND "client_id" IS NOT NULL)
  ),
  CONSTRAINT "app_user_password_hash_check" CHECK ("password_hash" LIKE 'scrypt$%')
);

CREATE TABLE "auth_session" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "auth_session_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_session_expiry_check" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "auth_session_token_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");
CREATE INDEX "app_user_client_id_idx" ON "app_user"("client_id");
CREATE INDEX "app_user_role_deleted_at_idx" ON "app_user"("role", "deleted_at");
CREATE UNIQUE INDEX "auth_session_token_hash_key" ON "auth_session"("token_hash");
CREATE INDEX "auth_session_user_id_revoked_at_expires_at_idx" ON "auth_session"("user_id", "revoked_at", "expires_at");
CREATE INDEX "auth_session_expires_at_idx" ON "auth_session"("expires_at");

ALTER TABLE "auth_session"
  ADD CONSTRAINT "auth_session_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
