-- PR02 is a commercial register. It does not alter event activation or financial tables.
-- Bound the read-only consumption scan by tenant and activation period.
CREATE INDEX event_client_id_activated_at_id_idx ON event(client_id,activated_at,id);
CREATE TYPE managed_plan_modality AS ENUM ('STANDARD', 'PRIVATE');
CREATE TYPE managed_plan_tier AS ENUM ('ESSENTIAL', 'FREQUENT', 'INTENSIVE');

CREATE TABLE managed_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modality managed_plan_modality NOT NULL,
  tier managed_plan_tier NOT NULL,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT managed_plan_modality_tier_key UNIQUE (modality,tier)
);

CREATE TABLE managed_plan_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES managed_plan(id) ON DELETE RESTRICT,
  commercial_name varchar(160) NOT NULL,
  monthly_amount_mxn_cents integer NOT NULL,
  initial_fee_mxn_cents integer NOT NULL,
  extra_event_amount_mxn_cents integer NOT NULL,
  contract_months integer NOT NULL,
  included_events_per_month integer NOT NULL,
  monthly_event_limit integer NOT NULL,
  included_events_per_year integer,
  event_capacity integer NOT NULL,
  valid_from timestamptz(6) NOT NULL,
  valid_until timestamptz(6),
  -- An audit identity, not a capability or an FK that erases prices when users are reset.
  created_by_user_id uuid,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT managed_plan_version_terms_check CHECK (
    length(btrim(commercial_name)) > 0 AND monthly_amount_mxn_cents > 0 AND initial_fee_mxn_cents >= 0
    AND extra_event_amount_mxn_cents > 0 AND contract_months = 12
    AND included_events_per_month > 0 AND monthly_event_limit >= included_events_per_month
    AND (included_events_per_year IS NULL OR (included_events_per_year >= included_events_per_month
      AND included_events_per_year::bigint <= monthly_event_limit::bigint * contract_months))
    AND event_capacity BETWEEN 1 AND 150
    AND (valid_until IS NULL OR valid_until > valid_from)
  ),
  CONSTRAINT managed_plan_version_no_overlap EXCLUDE USING gist
    (plan_id WITH =, tstzrange(valid_from,valid_until,'[)') WITH &&)
);
CREATE INDEX managed_plan_version_plan_id_valid_from_valid_until_idx
  ON managed_plan_version(plan_id,valid_from,valid_until);

CREATE TABLE managed_plan_contract (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES client(id) ON DELETE RESTRICT,
  plan_version_id uuid NOT NULL REFERENCES managed_plan_version(id) ON DELETE RESTRICT,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  accepted_at timestamptz(6) NOT NULL DEFAULT now(),
  terms jsonb NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT managed_plan_contract_dates_check CHECK (ends_on > starts_on),
  CONSTRAINT managed_plan_contract_terms_check CHECK (jsonb_typeof(terms)='object'),
  CONSTRAINT managed_plan_contract_no_overlap EXCLUDE USING gist
    (client_id WITH =, daterange(starts_on,ends_on,'[)') WITH &&)
);
CREATE INDEX managed_plan_contract_client_id_starts_on_ends_on_idx
  ON managed_plan_contract(client_id,starts_on,ends_on);

CREATE TABLE managed_plan_operation (
  idempotency_key varchar(128) PRIMARY KEY,
  kind varchar(40) NOT NULL,
  actor_user_id uuid NOT NULL,
  request_signature char(64) NOT NULL,
  result_snapshot jsonb NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT managed_plan_operation_kind_check CHECK (kind IN ('VERSION_CREATE','AVAILABILITY_SET','CONTRACT_ASSIGN')),
  CONSTRAINT managed_plan_operation_signature_check CHECK (request_signature ~ '^[a-f0-9]{64}$'),
  CONSTRAINT managed_plan_operation_result_check CHECK (jsonb_typeof(result_snapshot)='object')
);

-- The six initial offerings are configuration rows, never frontend price constants.
INSERT INTO managed_plan(modality,tier)
SELECT modality::managed_plan_modality,tier::managed_plan_tier
FROM (VALUES ('STANDARD','ESSENTIAL'),('STANDARD','FREQUENT'),('STANDARD','INTENSIVE'),
  ('PRIVATE','ESSENTIAL'),('PRIVATE','FREQUENT'),('PRIVATE','INTENSIVE')) AS seed(modality,tier);

INSERT INTO managed_plan_version(plan_id,commercial_name,monthly_amount_mxn_cents,initial_fee_mxn_cents,
  extra_event_amount_mxn_cents,contract_months,included_events_per_month,monthly_event_limit,
  included_events_per_year,event_capacity,valid_from)
SELECT id,
  CASE tier WHEN 'ESSENTIAL' THEN 'Esencial' WHEN 'FREQUENT' THEN 'Frecuente' ELSE 'Intensivo' END,
  CASE tier WHEN 'ESSENTIAL' THEN 790000 WHEN 'FREQUENT' THEN 990000 ELSE 1290000 END
    + CASE modality WHEN 'PRIVATE' THEN 100000 ELSE 0 END,
  CASE modality WHEN 'PRIVATE' THEN 3990000 ELSE 490000 END,
  125000,12,
  CASE tier WHEN 'ESSENTIAL' THEN 4 WHEN 'FREQUENT' THEN 8 ELSE 12 END,
  CASE tier WHEN 'ESSENTIAL' THEN 4 ELSE 12 END,
  CASE tier WHEN 'FREQUENT' THEN 96 ELSE NULL END,
  150,transaction_timestamp()
FROM managed_plan;

INSERT INTO audit_log(id,actor_type,resource_type,resource_id,action,after_data,metadata)
SELECT gen_random_uuid(),'SYSTEM','MANAGED_PLAN_VERSION',id,'MANAGED_PLAN_BOOTSTRAP',
  to_jsonb(managed_plan_version),'{"source":"PR02 migration","currency":"MXN","beforeTax":true}'::jsonb
FROM managed_plan_version;

CREATE FUNCTION guard_managed_plan_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Managed plan identity is permanent.' USING ERRCODE='23514'; END IF;
  IF (NEW.id,NEW.modality,NEW.tier,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.modality,OLD.tier,OLD.created_at)
    THEN RAISE EXCEPTION 'Managed plan identity is immutable.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER managed_plan_identity_guard BEFORE UPDATE OR DELETE ON managed_plan
  FOR EACH ROW EXECUTE FUNCTION guard_managed_plan_identity();

CREATE FUNCTION guard_managed_plan_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE plan_tier managed_plan_tier;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Managed price history is immutable.' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-'valid_until') IS DISTINCT FROM (to_jsonb(OLD)-'valid_until')
      OR OLD.valid_until IS NOT NULL OR NEW.valid_until IS NULL
      OR NEW.valid_until < date_trunc('milliseconds',transaction_timestamp()) OR NEW.valid_until <= OLD.valid_from
    THEN RAISE EXCEPTION 'Only the unused open suffix of a managed price validity may close.' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.created_by_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM app_user WHERE id=NEW.created_by_user_id AND role='PLATFORM_ADMIN'
      AND client_id IS NULL AND deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'Managed price version requires a real Provider.' USING ERRCODE='23514'; END IF;
  IF NEW.valid_from < date_trunc('milliseconds',transaction_timestamp()) THEN
    RAISE EXCEPTION 'Managed price history cannot be backdated.' USING ERRCODE='23514'; END IF;
  SELECT tier INTO plan_tier FROM managed_plan WHERE id=NEW.plan_id;
  IF (plan_tier='FREQUENT') IS DISTINCT FROM (NEW.included_events_per_year IS NOT NULL) THEN
    RAISE EXCEPTION 'Only Frequent has an annual allowance.' USING ERRCODE='23514'; END IF;
  IF plan_tier <> 'FREQUENT' AND NEW.monthly_event_limit <> NEW.included_events_per_month THEN
    RAISE EXCEPTION 'Monthly-only plans require a monthly included limit.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER managed_plan_version_guard BEFORE INSERT OR UPDATE OR DELETE ON managed_plan_version
  FOR EACH ROW EXECUTE FUNCTION guard_managed_plan_version();

CREATE FUNCTION managed_plan_terms_snapshot(version_id uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'planId',p.id,'planVersionId',v.id,'modality',p.modality,'tier',p.tier,'commercialName',v.commercial_name,
    'monthlyAmountMxnCents',v.monthly_amount_mxn_cents,'initialFeeMxnCents',v.initial_fee_mxn_cents,
    'extraEventAmountMxnCents',v.extra_event_amount_mxn_cents,'contractMonths',v.contract_months,
    'includedEventsPerMonth',v.included_events_per_month,'monthlyEventLimit',v.monthly_event_limit,
    'includedEventsPerYear',v.included_events_per_year,'eventCapacity',v.event_capacity,
    'validFrom',to_char(v.valid_from AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'validUntil',CASE WHEN v.valid_until IS NULL THEN NULL ELSE to_char(v.valid_until AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
    'currency','MXN','beforeTax',true
  ) FROM managed_plan_version v JOIN managed_plan p ON p.id=v.plan_id WHERE v.id=version_id
$$;

CREATE FUNCTION guard_managed_plan_contract() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_months integer;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Managed contract terms and history are immutable.' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM client WHERE id=NEW.client_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM client WHERE id=NEW.client_id AND type='ORGANIZATION'
    AND operating_profile='MANAGED' AND status='ACTIVE' AND deleted_at IS NULL)
    THEN RAISE EXCEPTION 'Managed contract requires an active Managed Organization.' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM app_user WHERE id=NEW.created_by_user_id AND role='PLATFORM_ADMIN'
    AND client_id IS NULL AND deleted_at IS NULL)
    THEN RAISE EXCEPTION 'Managed contract requires a real Provider.' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM managed_plan_version v JOIN managed_plan p ON p.id=v.plan_id
    WHERE v.id=NEW.plan_version_id AND p.is_available AND v.valid_from <= transaction_timestamp()
      AND (v.valid_until IS NULL OR transaction_timestamp() < v.valid_until))
    THEN RAISE EXCEPTION 'Managed contract requires an available current price at acceptance.' USING ERRCODE='23514'; END IF;
  SELECT contract_months INTO version_months FROM managed_plan_version WHERE id=NEW.plan_version_id;
  IF NEW.ends_on <> (NEW.starts_on + make_interval(months=>version_months))::date
    OR NEW.terms IS DISTINCT FROM managed_plan_terms_snapshot(NEW.plan_version_id)
    THEN RAISE EXCEPTION 'Managed contract snapshot must match accepted terms.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER managed_plan_contract_guard BEFORE INSERT OR UPDATE OR DELETE ON managed_plan_contract
  FOR EACH ROW EXECUTE FUNCTION guard_managed_plan_contract();

CREATE FUNCTION guard_managed_plan_operation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Managed plan operation history is immutable.' USING ERRCODE='23514';
END $$;
CREATE TRIGGER managed_plan_operation_guard BEFORE UPDATE OR DELETE ON managed_plan_operation
  FOR EACH ROW EXECUTE FUNCTION guard_managed_plan_operation();
