CREATE TYPE "audit_actor_type" AS ENUM ('USER', 'STAFF_TOKEN', 'PUBLIC_TOKEN', 'SYSTEM');

CREATE TABLE "audit_log" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_type" "audit_actor_type" NOT NULL,
  "actor_id" UUID,
  "actor_fingerprint" CHAR(64),
  "client_id" UUID,
  "event_id" UUID,
  "resource_type" VARCHAR(100) NOT NULL,
  "resource_id" UUID,
  "action" VARCHAR(120) NOT NULL,
  "before_data" JSONB,
  "after_data" JSONB,
  "metadata" JSONB,
  "operation_id" UUID,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_log_client_id_occurred_at_idx"
  ON "audit_log"("client_id", "occurred_at");

CREATE INDEX "audit_log_event_id_occurred_at_idx"
  ON "audit_log"("event_id", "occurred_at");

CREATE INDEX "audit_log_resource_type_resource_id_occurred_at_idx"
  ON "audit_log"("resource_type", "resource_id", "occurred_at");

CREATE INDEX "audit_log_operation_id_idx"
  ON "audit_log"("operation_id");

CREATE FUNCTION "prevent_audit_log_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;

CREATE TRIGGER "audit_log_prevent_update"
BEFORE UPDATE ON "audit_log"
FOR EACH ROW
EXECUTE FUNCTION "prevent_audit_log_mutation"();

CREATE TRIGGER "audit_log_prevent_delete"
BEFORE DELETE ON "audit_log"
FOR EACH ROW
EXECUTE FUNCTION "prevent_audit_log_mutation"();
