CREATE TYPE "generated_report_type" AS ENUM ('ATTENDANCE', 'PHYSICAL_PASSES');
CREATE TYPE "generated_report_status" AS ENUM ('AUTHORIZED', 'READY', 'HIDDEN', 'EXPIRED');
CREATE TYPE "generated_report_privacy_mode" AS ENUM ('DETAILED', 'AGGREGATE');

CREATE TABLE "generated_report" (
  "id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "type" "generated_report_type" NOT NULL,
  "status" "generated_report_status" NOT NULL DEFAULT 'AUTHORIZED',
  "privacy_mode" "generated_report_privacy_mode" NOT NULL,
  "template_version" INTEGER NOT NULL,
  "generated_at_snapshot" TIMESTAMPTZ(6) NOT NULL,
  "detailed_until" TIMESTAMPTZ(6) NOT NULL,
  "retention_until" TIMESTAMPTZ(6) NOT NULL,
  "dataset_snapshot" JSONB NOT NULL,
  "dataset_hash_sha256" CHAR(64) NOT NULL,
  "parameters" JSONB NOT NULL,
  "upload_expires_at" TIMESTAMPTZ(6) NOT NULL,
  "file_asset_id" UUID,
  "ready_at" TIMESTAMPTZ(6),
  "hidden_at" TIMESTAMPTZ(6),
  "expired_at" TIMESTAMPTZ(6),
  "requested_by_user_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "request_signature" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "generated_report_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "generated_report_template_positive" CHECK ("template_version" > 0),
  CONSTRAINT "generated_report_dataset_hash_valid" CHECK ("dataset_hash_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "generated_report_request_signature_valid" CHECK ("request_signature" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "generated_report_dataset_object" CHECK (jsonb_typeof("dataset_snapshot") = 'object'),
  CONSTRAINT "generated_report_parameters_object" CHECK (jsonb_typeof("parameters") = 'object'),
  CONSTRAINT "generated_report_time_order" CHECK (
    "generated_at_snapshot" <= "upload_expires_at"
    AND "generated_at_snapshot" <= "detailed_until"
    AND "detailed_until" < "retention_until"
  ),
  CONSTRAINT "generated_report_state_shape" CHECK (
    ("status" = 'AUTHORIZED' AND "file_asset_id" IS NULL AND "ready_at" IS NULL AND "hidden_at" IS NULL AND "expired_at" IS NULL)
    OR ("status" = 'READY' AND "file_asset_id" IS NOT NULL AND "ready_at" IS NOT NULL AND "hidden_at" IS NULL AND "expired_at" IS NULL)
    OR ("status" = 'HIDDEN' AND "hidden_at" IS NOT NULL AND "expired_at" IS NULL)
    OR ("status" = 'EXPIRED' AND "expired_at" IS NOT NULL)
  ),
  CONSTRAINT "generated_report_physical_aggregate" CHECK (
    "type" <> 'PHYSICAL_PASSES' OR "privacy_mode" = 'AGGREGATE'
  )
);

CREATE UNIQUE INDEX "generated_report_file_asset_id_key" ON "generated_report"("file_asset_id");
CREATE UNIQUE INDEX "generated_report_idempotency_key_key" ON "generated_report"("idempotency_key");
CREATE UNIQUE INDEX "generated_report_id_client_id_event_id_key" ON "generated_report"("id", "client_id", "event_id");
CREATE INDEX "generated_report_client_id_event_id_created_at_idx" ON "generated_report"("client_id", "event_id", "created_at");
CREATE INDEX "generated_report_status_detailed_until_retention_until_idx" ON "generated_report"("status", "detailed_until", "retention_until");
CREATE UNIQUE INDEX "file_asset_generated_report_owner_key"
  ON "file_asset"("owner_id")
  WHERE "owner_type" = 'GENERATED_REPORT' AND "owner_id" IS NOT NULL;

ALTER TABLE "generated_report"
  ADD CONSTRAINT "generated_report_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "generated_report_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "generated_report_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "generated_report_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_generated_report_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  event_client UUID;
  service_code service_code;
  asset_record file_asset%ROWTYPE;
BEGIN
  SELECT e.client_id, s.code
    INTO event_client, service_code
  FROM event e
  LEFT JOIN service s ON s.id = COALESCE(e.activated_service_id, e.service_id)
  WHERE e.id = NEW.event_id;

  IF event_client IS NULL OR event_client <> NEW.client_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'generated_report_event_client_match',
      MESSAGE = 'generated_report_event_client_match';
  END IF;

  IF (NEW.type = 'ATTENDANCE' AND service_code NOT IN ('FLYER', 'FLIPBOOK'))
     OR (NEW.type = 'PHYSICAL_PASSES' AND service_code <> 'PHYSICAL_QR') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'generated_report_service_compatible',
      MESSAGE = 'generated_report_service_compatible';
  END IF;

  IF NEW.file_asset_id IS NOT NULL THEN
    SELECT * INTO asset_record FROM file_asset WHERE id = NEW.file_asset_id;
    IF NOT FOUND
       OR asset_record.client_id <> NEW.client_id
       OR asset_record.event_id <> NEW.event_id
       OR asset_record.owner_type <> 'GENERATED_REPORT'
       OR asset_record.owner_id <> NEW.id
       OR asset_record.file_type <> 'GENERATED_REPORT_PDF'
       OR (NEW.status = 'READY' AND asset_record.status <> 'READY') THEN
      RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'generated_report_file_asset_compatible',
        MESSAGE = 'generated_report_file_asset_compatible';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "generated_report_integrity"
AFTER INSERT OR UPDATE ON "generated_report"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_generated_report_integrity();

CREATE OR REPLACE FUNCTION enforce_generated_report_file_asset()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  report_record generated_report%ROWTYPE;
BEGIN
  IF NEW.owner_type <> 'GENERATED_REPORT' THEN
    RETURN NEW;
  END IF;
  IF NEW.owner_id IS NULL OR NEW.file_type <> 'GENERATED_REPORT_PDF' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'generated_report_file_asset_owner_required',
      MESSAGE = 'generated_report_file_asset_owner_required';
  END IF;
  SELECT * INTO report_record FROM generated_report WHERE id = NEW.owner_id;
  IF NOT FOUND OR report_record.client_id <> NEW.client_id OR report_record.event_id <> NEW.event_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'generated_report_file_asset_owner_match',
      MESSAGE = 'generated_report_file_asset_owner_match';
  END IF;
  IF NEW.status = 'READY'
     AND (report_record.status <> 'READY' OR report_record.file_asset_id <> NEW.id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'generated_report_file_asset_ready_match',
      MESSAGE = 'generated_report_file_asset_ready_match';
  END IF;
  IF report_record.file_asset_id IS NOT NULL AND report_record.file_asset_id <> NEW.id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'generated_report_file_asset_unique_owner',
      MESSAGE = 'generated_report_file_asset_unique_owner';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "generated_report_file_asset_integrity"
AFTER INSERT OR UPDATE ON "file_asset"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW."owner_type" = 'GENERATED_REPORT')
EXECUTE FUNCTION enforce_generated_report_file_asset();

CREATE OR REPLACE FUNCTION protect_generated_report_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'generated_report_immutable_truncate';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'generated_report_immutable_delete';
  END IF;

  IF ROW(
    OLD.id, OLD.client_id, OLD.event_id, OLD.type, OLD.template_version,
    OLD.generated_at_snapshot, OLD.detailed_until, OLD.retention_until,
    OLD.upload_expires_at, OLD.parameters, OLD.requested_by_user_id,
    OLD.idempotency_key, OLD.request_signature, OLD.created_at
  ) IS DISTINCT FROM ROW(
    NEW.id, NEW.client_id, NEW.event_id, NEW.type, NEW.template_version,
    NEW.generated_at_snapshot, NEW.detailed_until, NEW.retention_until,
    NEW.upload_expires_at, NEW.parameters, NEW.requested_by_user_id,
    NEW.idempotency_key, NEW.request_signature, NEW.created_at
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'generated_report_identity_immutable';
  END IF;

  IF OLD.status = 'EXPIRED' AND NEW.status <> 'EXPIRED'
     OR OLD.status = 'HIDDEN' AND NEW.status NOT IN ('HIDDEN', 'EXPIRED')
     OR OLD.status = 'READY' AND NEW.status NOT IN ('READY', 'HIDDEN', 'EXPIRED')
     OR OLD.status = 'AUTHORIZED' AND NEW.status NOT IN ('AUTHORIZED', 'READY', 'EXPIRED') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'generated_report_status_irreversible';
  END IF;

  IF OLD.file_asset_id IS NOT NULL AND NEW.file_asset_id IS DISTINCT FROM OLD.file_asset_id THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'generated_report_file_immutable';
  END IF;
  IF OLD.privacy_mode = 'AGGREGATE' AND NEW.privacy_mode <> 'AGGREGATE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'generated_report_privacy_irreversible';
  END IF;
  IF (
    OLD.dataset_snapshot IS DISTINCT FROM NEW.dataset_snapshot
    OR OLD.dataset_hash_sha256 IS DISTINCT FROM NEW.dataset_hash_sha256
  ) AND NOT (
    (
      OLD.privacy_mode = 'DETAILED'
      AND NEW.privacy_mode = 'AGGREGATE'
      AND COALESCE(jsonb_array_length(NEW.dataset_snapshot->'rows'), 0) = 0
    )
    OR (
      OLD.status <> 'EXPIRED'
      AND NEW.status = 'EXPIRED'
      AND COALESCE(jsonb_array_length(NEW.dataset_snapshot->'rows'), 0) = 0
      AND COALESCE(jsonb_array_length(NEW.dataset_snapshot->'passes'), 0) = 0
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'generated_report_dataset_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "generated_report_protect_update_delete"
BEFORE UPDATE OR DELETE ON "generated_report"
FOR EACH ROW EXECUTE FUNCTION protect_generated_report_mutation();

CREATE TRIGGER "generated_report_protect_truncate"
BEFORE TRUNCATE ON "generated_report"
FOR EACH STATEMENT EXECUTE FUNCTION protect_generated_report_mutation();
