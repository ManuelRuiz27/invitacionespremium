-- PR03 is a separate commercial register; no Finance or operational tables are changed.
ALTER TABLE managed_plan_operation DROP CONSTRAINT managed_plan_operation_kind_check;
ALTER TABLE managed_plan_operation ADD CONSTRAINT managed_plan_operation_kind_check CHECK
  (kind IN ('VERSION_CREATE','AVAILABILITY_SET','CONTRACT_ASSIGN','COLLECTION_PAYMENT','COLLECTION_REVERSE','COLLECTION_EXTRA_CONFIRM'));
CREATE UNIQUE INDEX managed_plan_contract_id_client_id_key ON managed_plan_contract(id, client_id);

CREATE TABLE managed_extraordinary_charge (
  id uuid PRIMARY KEY,
  contract_id uuid NOT NULL,
  client_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES event(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  amount_mxn_cents integer NOT NULL CHECK (amount_mxn_cents > 0),
  due_on date NOT NULL,
  confirmed_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_by_user_id uuid NOT NULL,
  CONSTRAINT managed_extraordinary_charge_contract_id_client_id_fkey FOREIGN KEY(contract_id, client_id)
    REFERENCES managed_plan_contract(id, client_id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX managed_extraordinary_charge_contract_id_event_id_key ON managed_extraordinary_charge(contract_id,event_id);
CREATE INDEX managed_extraordinary_charge_event_id_idx ON managed_extraordinary_charge(event_id);

CREATE TABLE managed_collection_payment (
  id uuid PRIMARY KEY,
  contract_id uuid NOT NULL,
  client_id uuid NOT NULL,
  concept varchar(20) NOT NULL,
  installment_number integer,
  extraordinary_charge_id uuid REFERENCES managed_extraordinary_charge(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  amount_mxn_cents integer NOT NULL CHECK (amount_mxn_cents > 0),
  effective_on date NOT NULL,
  method varchar(12) NOT NULL CHECK (method IN ('TRANSFER','CASH','CARD','OTHER')),
  reference varchar(120),
  notes varchar(1000),
  registered_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  registered_by_user_id uuid NOT NULL,
  reversed_at timestamptz(6),
  reversed_by_user_id uuid,
  reversal_reason varchar(500),
  CONSTRAINT managed_collection_payment_contract_id_client_id_fkey FOREIGN KEY(contract_id, client_id)
    REFERENCES managed_plan_contract(id, client_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT managed_collection_payment_concept_check CHECK (
    (concept='IMPLEMENTATION' AND installment_number IS NULL AND extraordinary_charge_id IS NULL) OR
    (concept='MONTHLY' AND installment_number IS NOT NULL AND installment_number BETWEEN 1 AND 12 AND extraordinary_charge_id IS NULL) OR
    (concept='EXTRAORDINARY' AND installment_number IS NULL AND extraordinary_charge_id IS NOT NULL)
  ),
  CONSTRAINT managed_collection_payment_reversal_check CHECK (
    (reversed_at IS NULL AND reversed_by_user_id IS NULL AND reversal_reason IS NULL) OR
    (reversed_at IS NOT NULL AND reversed_by_user_id IS NOT NULL AND reversal_reason IS NOT NULL AND length(trim(reversal_reason)) > 0)
  )
);
CREATE INDEX managed_collection_payment_contract_id_registered_at_id_idx ON managed_collection_payment(contract_id,registered_at,id);
CREATE INDEX managed_collection_payment_extraordinary_charge_id_idx ON managed_collection_payment(extraordinary_charge_id);

CREATE FUNCTION guard_managed_extraordinary_charge() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c managed_plan_contract%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Managed extraordinary charges are immutable'; END IF;
  NEW.confirmed_at := transaction_timestamp();
  SELECT * INTO c FROM managed_plan_contract WHERE id=NEW.contract_id AND client_id=NEW.client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Managed contract ownership mismatch'; END IF;
  IF NEW.amount_mxn_cents <> (c.terms->>'extraEventAmountMxnCents')::integer
    OR NEW.due_on <> (transaction_timestamp() AT TIME ZONE 'America/Mexico_City')::date THEN
    RAISE EXCEPTION 'Invalid extraordinary charge snapshot';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app_user WHERE id=NEW.confirmed_by_user_id AND role='PLATFORM_ADMIN' AND client_id IS NULL AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Live provider required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM event e JOIN service s ON s.id=e.activated_service_id WHERE e.id=NEW.event_id AND e.client_id=c.client_id
    AND s.code='ACCESS_CONTROL' AND e.activated_at <= transaction_timestamp()
    AND (e.activated_at AT TIME ZONE 'America/Mexico_City')::date >= c.starts_on
    AND (e.activated_at AT TIME ZONE 'America/Mexico_City')::date < c.ends_on) THEN
    RAISE EXCEPTION 'Event is outside the Managed contract';
  END IF;
  -- Classification as extraordinary is checked against the existing PR02 projection in the serializable API transaction.
  RETURN NEW;
END $$;
CREATE TRIGGER managed_extraordinary_charge_guard BEFORE INSERT OR UPDATE OR DELETE ON managed_extraordinary_charge
  FOR EACH ROW EXECUTE FUNCTION guard_managed_extraordinary_charge();

CREATE FUNCTION guard_managed_collection_payment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c managed_plan_contract%ROWTYPE; obligation_amount bigint; paid bigint; actor uuid;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Reverse Managed payments instead of deleting them'; END IF;
  SELECT * INTO c FROM managed_plan_contract WHERE id=NEW.contract_id AND client_id=NEW.client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Managed contract ownership mismatch'; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.reversed_at IS NOT NULL OR NEW.reversed_at IS NULL
      OR (to_jsonb(NEW)-ARRAY['reversed_at','reversed_by_user_id','reversal_reason']) IS DISTINCT FROM
         (to_jsonb(OLD)-ARRAY['reversed_at','reversed_by_user_id','reversal_reason']) THEN
      RAISE EXCEPTION 'Only one complete reversal is allowed; original payment is immutable';
    END IF;
    NEW.reversed_at := transaction_timestamp();
    actor := NEW.reversed_by_user_id;
  ELSE
    NEW.registered_at := transaction_timestamp();
    actor := NEW.registered_by_user_id;
    IF NEW.reversed_at IS NOT NULL
      OR NEW.effective_on > (transaction_timestamp() AT TIME ZONE 'America/Mexico_City')::date THEN
      RAISE EXCEPTION 'Invalid payment date or initial reversal';
    END IF;
    IF NEW.concept='IMPLEMENTATION' THEN obligation_amount := (c.terms->>'initialFeeMxnCents')::bigint;
    ELSIF NEW.concept='MONTHLY' THEN obligation_amount := (c.terms->>'monthlyAmountMxnCents')::bigint;
    ELSIF NEW.concept='EXTRAORDINARY' THEN
      SELECT amount_mxn_cents INTO obligation_amount FROM managed_extraordinary_charge
        WHERE id=NEW.extraordinary_charge_id AND contract_id=c.id AND client_id=c.client_id;
    END IF;
    IF obligation_amount IS NULL THEN RAISE EXCEPTION 'Invalid payment concept ownership'; END IF;
    SELECT COALESCE(sum(amount_mxn_cents),0) INTO paid FROM managed_collection_payment
      WHERE contract_id=c.id AND reversed_at IS NULL AND concept=NEW.concept
        AND installment_number IS NOT DISTINCT FROM NEW.installment_number
        AND extraordinary_charge_id IS NOT DISTINCT FROM NEW.extraordinary_charge_id;
    IF paid + NEW.amount_mxn_cents > obligation_amount THEN RAISE EXCEPTION 'Managed payment exceeds outstanding balance'; END IF;
  END IF;
  IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM app_user WHERE id=actor AND role='PLATFORM_ADMIN' AND client_id IS NULL AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Live provider required';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER managed_collection_payment_guard BEFORE INSERT OR UPDATE OR DELETE ON managed_collection_payment
  FOR EACH ROW EXECUTE FUNCTION guard_managed_collection_payment();
