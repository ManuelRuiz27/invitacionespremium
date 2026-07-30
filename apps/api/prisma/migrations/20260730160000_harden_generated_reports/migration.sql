CREATE OR REPLACE FUNCTION enforce_file_asset_invariants()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.client_id IS DISTINCT FROM NEW.client_id
    OR OLD.event_id IS DISTINCT FROM NEW.event_id
    OR OLD.owner_type IS DISTINCT FROM NEW.owner_type
    OR OLD.file_type IS DISTINCT FROM NEW.file_type
    OR OLD.storage_provider IS DISTINCT FROM NEW.storage_provider
    OR OLD.storage_key IS DISTINCT FROM NEW.storage_key
    OR OLD.created_by_user_id IS DISTINCT FROM NEW.created_by_user_id
  THEN
    RAISE EXCEPTION 'file asset identity is immutable' USING ERRCODE = '23514';
  END IF;

  IF OLD.owner_id IS NOT NULL
    AND (
      OLD.owner_id IS DISTINCT FROM NEW.owner_id
      OR OLD.associated_at IS DISTINCT FROM NEW.associated_at
    )
    AND NOT (
      OLD.owner_type = 'GENERATED_REPORT'
      AND OLD.file_type = 'GENERATED_REPORT_PDF'
      AND OLD.status = 'UPLOADING'
      AND NEW.status IN ('FAILED', 'DELETED')
      AND NEW.owner_id IS NULL
      AND NEW.associated_at IS NULL
    )
  THEN
    RAISE EXCEPTION 'file asset owner is immutable' USING ERRCODE = '23514';
  END IF;

  IF OLD.owner_id IS NULL AND NEW.owner_id IS NOT NULL
    AND (OLD.status <> 'READY' OR NEW.status <> 'READY')
  THEN
    RAISE EXCEPTION 'only a ready file asset can be associated' USING ERRCODE = '23514';
  END IF;

  IF OLD.status IN ('READY', 'HIDDEN', 'DELETED') AND (
    OLD.original_name IS DISTINCT FROM NEW.original_name
    OR OLD.mime_type IS DISTINCT FROM NEW.mime_type
    OR OLD.size_bytes IS DISTINCT FROM NEW.size_bytes
    OR OLD.checksum_sha256 IS DISTINCT FROM NEW.checksum_sha256
    OR OLD.width IS DISTINCT FROM NEW.width
    OR OLD.height IS DISTINCT FROM NEW.height
  ) THEN
    RAISE EXCEPTION 'file asset binary metadata is immutable' USING ERRCODE = '23514';
  END IF;

  IF NOT (
    (OLD.status = 'UPLOADING' AND NEW.status IN ('UPLOADING', 'READY', 'FAILED', 'DELETED'))
    OR (OLD.status = 'READY' AND NEW.status IN ('READY', 'HIDDEN', 'DELETED'))
    OR (OLD.status = 'FAILED' AND NEW.status IN ('FAILED', 'DELETED'))
    OR (OLD.status = 'HIDDEN' AND NEW.status IN ('HIDDEN', 'READY', 'DELETED'))
    OR (OLD.status = 'DELETED' AND NEW.status = 'DELETED')
  ) THEN
    RAISE EXCEPTION 'invalid file asset status transition' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

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
       OR asset_record.file_type <> 'GENERATED_REPORT_PDF' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'generated_report_file_asset_compatible',
        MESSAGE = 'generated_report_file_asset_compatible';
    END IF;

    IF NEW.status = 'READY' AND asset_record.status <> 'READY' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'generated_report_ready_asset_ready',
        MESSAGE = 'generated_report_ready_asset_ready';
    END IF;

    IF NEW.status IN ('HIDDEN', 'EXPIRED') AND asset_record.status NOT IN ('HIDDEN', 'DELETED') THEN
      RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'generated_report_private_asset_hidden',
        MESSAGE = 'generated_report_private_asset_hidden';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

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

  IF NEW.file_type <> 'GENERATED_REPORT_PDF' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'generated_report_file_asset_type',
      MESSAGE = 'generated_report_file_asset_type';
  END IF;

  IF NEW.owner_id IS NULL THEN
    IF NEW.status NOT IN ('FAILED', 'DELETED') OR NEW.associated_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'generated_report_file_asset_residue',
        MESSAGE = 'generated_report_file_asset_residue';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO report_record FROM generated_report WHERE id = NEW.owner_id;
  IF NOT FOUND
     OR report_record.client_id <> NEW.client_id
     OR report_record.event_id <> NEW.event_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'generated_report_file_asset_owner_match',
      MESSAGE = 'generated_report_file_asset_owner_match';
  END IF;

  IF NEW.status = 'UPLOADING' THEN
    IF report_record.status <> 'AUTHORIZED' OR report_record.file_asset_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'generated_report_file_asset_upload_match',
        MESSAGE = 'generated_report_file_asset_upload_match';
    END IF;
  ELSIF NEW.status = 'READY' THEN
    IF report_record.status <> 'READY' OR report_record.file_asset_id <> NEW.id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'generated_report_file_asset_ready_match',
        MESSAGE = 'generated_report_file_asset_ready_match';
    END IF;
  ELSIF NEW.status = 'HIDDEN' THEN
    IF report_record.status NOT IN ('HIDDEN', 'EXPIRED') OR report_record.file_asset_id <> NEW.id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'generated_report_file_asset_hidden_match',
        MESSAGE = 'generated_report_file_asset_hidden_match';
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'generated_report_file_asset_operational_owner',
      MESSAGE = 'generated_report_file_asset_operational_owner';
  END IF;

  IF report_record.file_asset_id IS NOT NULL AND report_record.file_asset_id <> NEW.id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'generated_report_file_asset_unique_owner',
      MESSAGE = 'generated_report_file_asset_unique_owner';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "generated_report_file_asset_integrity" ON "file_asset";
CREATE CONSTRAINT TRIGGER "generated_report_file_asset_integrity"
AFTER INSERT OR UPDATE ON "file_asset"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW."owner_type" = 'GENERATED_REPORT')
EXECUTE FUNCTION enforce_generated_report_file_asset();
