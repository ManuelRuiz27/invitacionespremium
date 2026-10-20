BEGIN;

-- Keep the compatibility scan and installation atomic against material writes.
LOCK TABLE event, contact, invitation, assistant IN SHARE ROW EXCLUSIVE MODE;

-- Fail closed if material written before DT02B is incompatible with its runtime.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM contact c JOIN event e ON e.id = c.event_id
    WHERE e.access_mode = 'ANONYMOUS'
  ) OR EXISTS (
    SELECT 1 FROM invitation i JOIN event e ON e.id = i.event_id
    WHERE e.access_mode IS NOT NULL AND
      (e.access_mode <> 'NOMINAL' OR i.mode <> 'INDIVIDUAL'
        OR i.additional_assistant_limit <> 0 OR i.response_status <> 'PENDING')
  ) OR EXISTS (
    SELECT 1 FROM assistant a JOIN event e ON e.id = a.event_id
    WHERE e.access_mode IS NOT NULL AND
      (e.access_mode <> 'NOMINAL' OR NOT a.is_primary OR a.response_status <> 'PENDING')
  ) THEN
    RAISE EXCEPTION 'Existing Access Control material is incompatible with nominal registration'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

ALTER TABLE contact DROP CONSTRAINT contact_anonymization_check;
ALTER TABLE contact ADD CONSTRAINT contact_anonymization_check CHECK (
  (anonymized_at IS NULL AND name IS NOT NULL)
  OR (anonymized_at IS NOT NULL AND name IS NULL AND whatsapp_phone_normalized IS NULL)
);

CREATE FUNCTION validate_contact_event_context()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  configured_code service_code;
  configured_mode event_access_mode;
BEGIN
  -- Same parent lock as DT02A and API writes; updates cannot bypass mode locks.
  IF TG_OP = 'UPDATE' THEN
    PERFORM 1 FROM event WHERE id IN (OLD.event_id, NEW.event_id) ORDER BY id FOR UPDATE;
  ELSE
    PERFORM 1 FROM event WHERE id = NEW.event_id FOR UPDATE;
  END IF;
  SELECT s.code, e.access_mode INTO configured_code, configured_mode
    FROM event e LEFT JOIN service s ON s.id = e.service_id WHERE e.id = NEW.event_id;
  IF configured_code = 'ACCESS_CONTROL' AND configured_mode = 'ANONYMOUS' THEN
    RAISE EXCEPTION 'CONTACT_EVENT_MODE_NOT_SUPPORTED' USING ERRCODE = '23514';
  END IF;
  IF NEW.anonymized_at IS NULL AND NEW.whatsapp_phone_normalized IS NULL
    AND NOT (configured_code IS NOT DISTINCT FROM 'ACCESS_CONTROL'::service_code
      AND configured_mode IS NOT DISTINCT FROM 'NOMINAL'::event_access_mode) THEN
    RAISE EXCEPTION 'CONTACT_PHONE_REQUIRED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER contact_validate_event_context BEFORE INSERT OR UPDATE ON contact
FOR EACH ROW EXECUTE FUNCTION validate_contact_event_context();

-- Internal nominal aggregates cannot become family invitations or confirmed RSVP,
-- including through direct SQL. Existing cardinality/FK/privacy checks still apply.
CREATE FUNCTION validate_nominal_invitation_material()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE configured_mode event_access_mode;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    PERFORM 1 FROM event WHERE id IN (OLD.event_id, NEW.event_id) ORDER BY id FOR UPDATE;
  ELSE
    PERFORM 1 FROM event WHERE id = NEW.event_id FOR UPDATE;
  END IF;
  SELECT access_mode INTO configured_mode FROM event WHERE id = NEW.event_id;
  IF configured_mode IS NOT NULL THEN
    IF configured_mode <> 'NOMINAL' OR NEW.response_status <> 'PENDING' THEN
      RAISE EXCEPTION 'NOMINAL_INTERNAL_MATERIAL_REQUIRED' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'invitation' THEN
      IF NEW.mode <> 'INDIVIDUAL' OR NEW.additional_assistant_limit <> 0 THEN
        RAISE EXCEPTION 'NOMINAL_INDIVIDUAL_INVITATION_REQUIRED' USING ERRCODE = '23514';
      END IF;
    ELSE
      IF NOT NEW.is_primary THEN
        RAISE EXCEPTION 'NOMINAL_PRIMARY_ASSISTANT_REQUIRED' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invitation_validate_nominal_material BEFORE INSERT OR UPDATE ON invitation
FOR EACH ROW EXECUTE FUNCTION validate_nominal_invitation_material();
CREATE TRIGGER assistant_validate_nominal_material BEFORE INSERT OR UPDATE ON assistant
FOR EACH ROW EXECUTE FUNCTION validate_nominal_invitation_material();

COMMIT;
