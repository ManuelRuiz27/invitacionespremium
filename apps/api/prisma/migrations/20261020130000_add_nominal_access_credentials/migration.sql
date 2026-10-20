BEGIN;
CREATE UNIQUE INDEX assistant_id_event_id_key ON assistant(id, event_id);
CREATE TABLE assistant_access_credential (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES event(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  assistant_id UUID NOT NULL,
  qr_token_nonce VARCHAR(64) NOT NULL UNIQUE CHECK (qr_token_nonce ~ '^[0-9a-f]{64}$'),
  qr_token_version INTEGER NOT NULL DEFAULT 1 CHECK (qr_token_version = 1),
  issued_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  issued_by_user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  revoked_at TIMESTAMPTZ(6),
  revoked_by_user_id UUID REFERENCES app_user(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  revocation_reason_code VARCHAR(64),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT assistant_access_credential_id_event_id_key UNIQUE(id, event_id),
  CONSTRAINT assistant_access_credential_assistant_id_event_id_fkey
    FOREIGN KEY(assistant_id, event_id) REFERENCES assistant(id, event_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT nominal_credential_revocation_check CHECK (
    (revoked_at IS NULL AND revoked_by_user_id IS NULL AND revocation_reason_code IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL AND revocation_reason_code IS NOT NULL
      AND revocation_reason_code ~ '^[A-Z][A-Z0-9_]{0,63}$' AND revoked_at >= issued_at)
  ),
  CONSTRAINT nominal_credential_time_check CHECK (issued_at >= created_at AND updated_at >= created_at)
);
CREATE UNIQUE INDEX nominal_credential_one_live_per_assistant ON assistant_access_credential(assistant_id) WHERE revoked_at IS NULL;
CREATE INDEX assistant_access_credential_event_id_assistant_id_revoked_a_idx ON assistant_access_credential(event_id, assistant_id, revoked_at);
CREATE INDEX assistant_access_credential_assistant_id_event_id_idx ON assistant_access_credential(assistant_id, event_id);
CREATE INDEX assistant_access_credential_issued_by_user_id_idx ON assistant_access_credential(issued_by_user_id);
CREATE INDEX assistant_access_credential_revoked_by_user_id_idx ON assistant_access_credential(revoked_by_user_id);

CREATE TABLE nominal_access_credential_operation (
  idempotency_key VARCHAR(128) PRIMARY KEY CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 128),
  event_id UUID NOT NULL REFERENCES event(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  credential_id UUID NOT NULL,
  actor_user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  action VARCHAR(8) NOT NULL CHECK (action IN ('ISSUE', 'REVOKE')),
  request_signature VARCHAR(64) NOT NULL CHECK (request_signature ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT nominal_access_credential_operation_credential_id_event_id_fkey
    FOREIGN KEY(credential_id, event_id) REFERENCES assistant_access_credential(id, event_id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX nominal_access_credential_operation_credential_id_event_id_idx ON nominal_access_credential_operation(credential_id, event_id);
CREATE INDEX nominal_access_credential_operation_event_id_idx ON nominal_access_credential_operation(event_id);
CREATE INDEX nominal_access_credential_operation_actor_user_id_idx ON nominal_access_credential_operation(actor_user_id);

CREATE OR REPLACE FUNCTION event_has_access_material(target_event_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM contact WHERE event_id = target_event_id)
    OR EXISTS (SELECT 1 FROM invitation WHERE event_id = target_event_id)
    OR EXISTS (SELECT 1 FROM assistant WHERE event_id = target_event_id)
    OR EXISTS (SELECT 1 FROM physical_pass WHERE event_id = target_event_id)
    OR EXISTS (SELECT 1 FROM physical_pass_generation_operation WHERE event_id = target_event_id)
    OR EXISTS (SELECT 1 FROM assistant_access_credential WHERE event_id = target_event_id);
$$;

-- Parent lock serializes issue/revoke against mode, state, ownership, deletion,
-- anonymization and CheckIn writers. No CheckIn exception is introduced by DT03.
CREATE FUNCTION assert_nominal_credential_actor(target_event_id UUID, actor_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE target_event event%ROWTYPE;
BEGIN
  SELECT * INTO target_event FROM event WHERE id = target_event_id FOR UPDATE;
  IF NOT FOUND OR target_event.deleted_at IS NOT NULL OR target_event.access_mode IS DISTINCT FROM 'NOMINAL'
    OR NOT EXISTS (SELECT 1 FROM service WHERE id = target_event.service_id AND code = 'ACCESS_CONTROL')
    OR NOT EXISTS (SELECT 1 FROM client WHERE id = target_event.client_id AND type = 'ORGANIZATION'
      AND operating_profile = 'MANAGED' AND status = 'ACTIVE' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'NOMINAL_ACCESS_EVENT_NOT_ELIGIBLE' USING ERRCODE = '23514';
  END IF;
  IF target_event.status NOT IN ('draft', 'configured', 'ready_to_activate', 'active', 'event_day') THEN
    RAISE EXCEPTION 'NOMINAL_ACCESS_EVENT_NOT_MUTABLE' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM app_user WHERE id = actor_id AND client_id = target_event.client_id AND deleted_at IS NULL
    AND (role = 'ORGANIZATION_ADMIN' OR (role = 'ORGANIZATION_PLANNER' AND id = target_event.assigned_planner_user_id)) FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOMINAL_ACCESS_ACTOR_NOT_AUTHORIZED' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION validate_nominal_credential_write()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  target_assistant assistant%ROWTYPE;
  target_invitation invitation%ROWTYPE;
  target_contact contact%ROWTYPE;
  actor_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.revoked_at IS NOT NULL OR NEW.revoked_by_user_id IS NOT NULL OR NEW.revocation_reason_code IS NOT NULL THEN
      RAISE EXCEPTION 'NOMINAL_ACCESS_INSERT_MUST_BE_UNREVOKED' USING ERRCODE = '23514';
    END IF;
    actor_id := NEW.issued_by_user_id;
  ELSE
    IF ROW(NEW.id, NEW.event_id, NEW.assistant_id, NEW.qr_token_nonce, NEW.qr_token_version,
      NEW.issued_at, NEW.issued_by_user_id, NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id, OLD.event_id, OLD.assistant_id, OLD.qr_token_nonce, OLD.qr_token_version,
      OLD.issued_at, OLD.issued_by_user_id, OLD.created_at)
      OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN
      RAISE EXCEPTION 'NOMINAL_ACCESS_HISTORY_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    actor_id := NEW.revoked_by_user_id;
  END IF;
  PERFORM assert_nominal_credential_actor(NEW.event_id, actor_id);
  SELECT * INTO target_assistant FROM assistant WHERE id = NEW.assistant_id AND event_id = NEW.event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOMINAL_ACCESS_ASSISTANT_NOT_ELIGIBLE' USING ERRCODE = '23514';
  END IF;
  -- Consistent order: Event -> Credential (UPDATE) -> Invitation -> Contact -> Assistant -> CheckIn.
  SELECT * INTO target_invitation FROM invitation WHERE id = target_assistant.invitation_id FOR UPDATE;
  SELECT * INTO target_contact FROM contact WHERE id = target_invitation.contact_id FOR UPDATE;
  SELECT * INTO target_assistant FROM assistant WHERE id = NEW.assistant_id FOR UPDATE;
  IF TG_OP = 'INSERT' AND (NOT target_assistant.is_primary OR target_assistant.deleted_at IS NOT NULL
    OR target_assistant.anonymized_at IS NOT NULL OR target_assistant.name IS NULL
    OR target_assistant.response_status <> 'PENDING' OR target_invitation.response_status <> 'PENDING'
    OR target_invitation.mode <> 'INDIVIDUAL' OR target_invitation.additional_assistant_limit <> 0
    OR target_invitation.deleted_at IS NOT NULL OR target_invitation.cancelled_at IS NOT NULL
    OR target_contact.deleted_at IS NOT NULL OR target_contact.anonymized_at IS NOT NULL) THEN
    RAISE EXCEPTION 'NOMINAL_ACCESS_ASSISTANT_NOT_ELIGIBLE' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM check_in WHERE assistant_id = NEW.assistant_id AND reverted_at IS NULL ORDER BY id FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'NOMINAL_ACCESS_ASSISTANT_ALREADY_USED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER nominal_credential_validate_write BEFORE INSERT OR UPDATE ON assistant_access_credential
FOR EACH ROW EXECUTE FUNCTION validate_nominal_credential_write();

CREATE FUNCTION validate_nominal_credential_operation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE target_credential assistant_access_credential%ROWTYPE;
BEGIN
  PERFORM assert_nominal_credential_actor(NEW.event_id, NEW.actor_user_id);
  SELECT * INTO target_credential FROM assistant_access_credential WHERE id = NEW.credential_id AND event_id = NEW.event_id;
  IF NOT FOUND OR (NEW.action = 'ISSUE' AND (target_credential.issued_by_user_id <> NEW.actor_user_id OR target_credential.revoked_at IS NOT NULL))
    OR (NEW.action = 'REVOKE' AND (target_credential.revoked_at IS NULL OR target_credential.revoked_by_user_id <> NEW.actor_user_id)) THEN
    RAISE EXCEPTION 'NOMINAL_ACCESS_OPERATION_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER nominal_credential_operation_validate_insert BEFORE INSERT ON nominal_access_credential_operation
FOR EACH ROW EXECUTE FUNCTION validate_nominal_credential_operation();

CREATE FUNCTION protect_nominal_access_history()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'NOMINAL_ACCESS_HISTORY_IMMUTABLE' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER nominal_credential_reject_delete BEFORE DELETE ON assistant_access_credential
FOR EACH ROW EXECUTE FUNCTION protect_nominal_access_history();
CREATE TRIGGER nominal_credential_reject_truncate BEFORE TRUNCATE ON assistant_access_credential
FOR EACH STATEMENT EXECUTE FUNCTION protect_nominal_access_history();
CREATE TRIGGER nominal_credential_operation_reject_change BEFORE UPDATE OR DELETE ON nominal_access_credential_operation
FOR EACH ROW EXECUTE FUNCTION protect_nominal_access_history();
CREATE TRIGGER nominal_credential_operation_reject_truncate BEFORE TRUNCATE ON nominal_access_credential_operation
FOR EACH STATEMENT EXECUTE FUNCTION protect_nominal_access_history();
COMMIT;
