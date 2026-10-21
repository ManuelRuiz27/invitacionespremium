BEGIN;
ALTER TABLE event ADD COLUMN access_activation_result_snapshot JSONB;

CREATE FUNCTION count_nominal_access_rights(target UUID) RETURNS INTEGER LANGUAGE sql AS $$
  SELECT count(DISTINCT a.id)::INTEGER FROM assistant_access_credential ac
    JOIN assistant a ON a.id = ac.assistant_id AND a.event_id = ac.event_id
    JOIN invitation i ON i.id = a.invitation_id AND i.event_id = a.event_id
    JOIN contact c ON c.id = i.contact_id AND c.event_id = a.event_id
    WHERE ac.event_id = target AND ac.revoked_at IS NULL AND a.deleted_at IS NULL AND a.anonymized_at IS NULL
      AND i.deleted_at IS NULL AND i.cancelled_at IS NULL AND c.deleted_at IS NULL AND c.anonymized_at IS NULL;
$$;

-- Shared by the transactional API resolver and the first-activation SQL guard.
-- No names, phones, nonces or financial information leave this predicate.
CREATE FUNCTION resolve_access_control_readiness(target UUID)
RETURNS TABLE(access_mode event_access_mode, blockers TEXT[], active_material_count INTEGER, capacity INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
  e event%ROWTYPE;
  f floorplan%ROWTYPE;
  problems TEXT[] := ARRAY[]::TEXT[];
  material INTEGER := 0;
  people INTEGER := 0;
BEGIN
  SELECT * INTO e FROM event WHERE id = target;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::event_access_mode, ARRAY['EVENT_ACCESS_CONTROL_CONTEXT_INVALID'], 0, NULL::INTEGER;
    RETURN;
  END IF;
  IF e.deleted_at IS NOT NULL OR e.status IN ('cancelled', 'archived') OR NOT EXISTS (
    SELECT 1 FROM client WHERE id = e.client_id AND type = 'ORGANIZATION' AND operating_profile = 'MANAGED'
      AND status = 'ACTIVE' AND deleted_at IS NULL
  ) THEN problems := array_append(problems, 'EVENT_ACCESS_CONTROL_CONTEXT_INVALID'); END IF;
  IF NOT EXISTS (SELECT 1 FROM service WHERE id = e.service_id AND code = 'ACCESS_CONTROL' AND is_active) THEN
    problems := array_append(problems, 'EVENT_SERVICE_NOT_AVAILABLE');
  END IF;
  IF e.access_mode IS NULL THEN problems := array_append(problems, 'EVENT_ACCESS_MODE_INVALID'); END IF;
  IF NOT EXISTS (SELECT 1 FROM app_user WHERE id = e.assigned_planner_user_id AND client_id = e.client_id
    AND role = 'ORGANIZATION_PLANNER' AND deleted_at IS NULL) THEN
    problems := array_append(problems, 'EVENT_PLANNER_ASSIGNMENT_INVALID');
  END IF;
  IF e.name IS NULL OR btrim(e.name) = '' OR e.social_type IS NULL OR e.event_date_time IS NULL
    OR e.time_zone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = e.time_zone)
    OR e.capacity IS NULL OR e.capacity <= 0 THEN
    problems := array_append(problems, 'EVENT_BASIC_DATA_INCOMPLETE');
  END IF;

  IF e.access_mode = 'NOMINAL' THEN
    SELECT count(*) INTO people FROM assistant a JOIN invitation i ON i.id = a.invitation_id AND i.event_id = a.event_id
      JOIN contact c ON c.id = i.contact_id AND c.event_id = a.event_id
      WHERE a.event_id = target AND a.deleted_at IS NULL AND a.anonymized_at IS NULL
        AND i.deleted_at IS NULL AND i.cancelled_at IS NULL AND c.deleted_at IS NULL AND c.anonymized_at IS NULL;
    material := count_nominal_access_rights(target);
    IF people > COALESCE(e.capacity, 0) OR people > 150
      OR (SELECT count(*) FROM contact WHERE event_id = target AND deleted_at IS NULL) > 150 THEN
      problems := array_append(problems, 'EVENT_ACCESS_CAPACITY_EXCEEDED');
    END IF;
    IF EXISTS (SELECT 1 FROM physical_pass WHERE event_id = target) THEN
      problems := array_append(problems, 'EVENT_ACCESS_MATERIAL_INCONSISTENT');
    END IF;
    -- Every live registered identity must retain its individual internal aggregate.
    IF EXISTS (SELECT 1 FROM contact c LEFT JOIN invitation i ON i.contact_id = c.id AND i.event_id = c.event_id
      WHERE c.event_id = target AND c.deleted_at IS NULL AND c.anonymized_at IS NULL AND
        (c.name IS NULL OR btrim(c.name) = '' OR i.id IS NULL OR i.deleted_at IS NOT NULL OR i.cancelled_at IS NOT NULL
          OR i.mode <> 'INDIVIDUAL' OR i.additional_assistant_limit <> 0 OR i.response_status <> 'PENDING'
          OR (SELECT count(*) FROM assistant WHERE invitation_id = i.id AND deleted_at IS NULL) <> 1))
      OR EXISTS (SELECT 1 FROM assistant a JOIN invitation i ON i.id = a.invitation_id
        JOIN contact c ON c.id = i.contact_id WHERE a.event_id = target AND a.deleted_at IS NULL
        AND (NOT a.is_primary OR a.anonymized_at IS NOT NULL OR a.name IS NULL OR btrim(a.name) = ''
          OR a.response_status <> 'PENDING' OR i.response_status <> 'PENDING' OR i.mode <> 'INDIVIDUAL'
          OR i.additional_assistant_limit <> 0 OR i.deleted_at IS NOT NULL OR i.cancelled_at IS NOT NULL
          OR c.deleted_at IS NOT NULL OR c.anonymized_at IS NOT NULL OR a.name IS DISTINCT FROM c.name)) THEN
      problems := array_append(problems, 'EVENT_ACCESS_MATERIAL_INCONSISTENT');
    END IF;
    IF EXISTS (SELECT 1 FROM assistant a JOIN invitation i ON i.id = a.invitation_id JOIN contact c ON c.id = i.contact_id
      WHERE a.event_id = target AND a.deleted_at IS NULL AND a.anonymized_at IS NULL
        AND i.deleted_at IS NULL AND i.cancelled_at IS NULL AND c.deleted_at IS NULL AND c.anonymized_at IS NULL
        AND (SELECT count(*) FROM assistant_access_credential WHERE assistant_id = a.id AND event_id = target
          AND revoked_at IS NULL) <> 1) THEN
      problems := array_append(problems, 'EVENT_ACCESS_CREDENTIAL_MISSING');
    END IF;
    IF EXISTS (SELECT 1 FROM assistant_access_credential ac JOIN assistant a ON a.id = ac.assistant_id
      JOIN invitation i ON i.id = a.invitation_id JOIN contact c ON c.id = i.contact_id
      WHERE ac.event_id = target AND ac.revoked_at IS NULL
        AND (ac.event_id <> a.event_id OR ac.qr_token_version <> 1 OR ac.qr_token_nonce !~ '^[0-9a-f]{64}$'
          OR a.deleted_at IS NOT NULL OR a.anonymized_at IS NOT NULL OR i.deleted_at IS NOT NULL
          OR i.cancelled_at IS NOT NULL OR c.deleted_at IS NOT NULL OR c.anonymized_at IS NOT NULL)) THEN
      problems := array_append(problems, 'EVENT_ACCESS_MATERIAL_INCONSISTENT');
    END IF;
  ELSIF e.access_mode = 'ANONYMOUS' THEN
    SELECT count(*) INTO material FROM physical_pass WHERE event_id = target AND revoked_at IS NULL AND deleted_at IS NULL;
    IF material > COALESCE(e.capacity, 0) THEN problems := array_append(problems, 'EVENT_ACCESS_CAPACITY_EXCEEDED'); END IF;
    IF EXISTS (SELECT 1 FROM contact WHERE event_id = target)
      OR EXISTS (SELECT 1 FROM invitation WHERE event_id = target)
      OR EXISTS (SELECT 1 FROM assistant WHERE event_id = target)
      OR EXISTS (SELECT 1 FROM assistant_access_credential WHERE event_id = target)
      OR EXISTS (SELECT 1 FROM physical_pass WHERE event_id = target AND
        (deleted_at IS NOT NULL OR qr_token_version <> 1 OR qr_token_nonce !~ '^[0-9a-f]{64}$')) THEN
      problems := array_append(problems, 'EVENT_ACCESS_MATERIAL_INCONSISTENT');
    END IF;
    -- Continuity uses ALL history, including revoked folios, never a filtered list.
    IF EXISTS (SELECT 1 FROM (SELECT pass_number, row_number() OVER (ORDER BY pass_number) AS expected
      FROM physical_pass WHERE event_id = target) history WHERE pass_number <> expected) THEN
      problems := array_append(problems, 'PHYSICAL_PASS_NUMBERING_INCONSISTENT');
    END IF;
  END IF;
  IF material = 0 THEN problems := array_append(problems, 'EVENT_ACCESS_MATERIAL_MISSING'); END IF;
  IF EXISTS (SELECT 1 FROM check_in WHERE event_id = target AND (e.activated_at IS NULL OR checked_in_at < e.activated_at))
    OR EXISTS (SELECT 1 FROM physical_pass WHERE event_id = target AND used_at IS NOT NULL
      AND (e.activated_at IS NULL OR used_at < e.activated_at)) THEN
    problems := array_append(problems, 'EVENT_ACCESS_PRIOR_ENTRY');
  END IF;

  SELECT * INTO f FROM floorplan WHERE event_id = target AND deleted_at IS NULL;
  IF e.floorplan_enabled THEN
    IF f.id IS NULL THEN problems := array_append(problems, 'EVENT_FLOORPLAN_MISSING');
    ELSE
      IF NOT EXISTS (SELECT 1 FROM file_asset WHERE id = f.image_asset_id AND status = 'READY' AND deleted_at IS NULL
        AND event_id = target AND client_id = e.client_id AND owner_type = 'FLOORPLAN' AND owner_id = f.id
        AND file_type IN ('FLOORPLAN_IMAGE', 'FLOORPLAN_SVG')) THEN
        problems := array_append(problems, 'EVENT_FLOORPLAN_IMAGE_NOT_READY');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM floorplan_shape t WHERE t.floorplan_id = f.id AND t.event_id = target
        AND t.deleted_at IS NULL AND t.kind = 'TABLE' AND t.capacity > 0) THEN
        problems := array_append(problems, 'EVENT_FLOORPLAN_TABLE_MISSING');
      END IF;
      IF (e.access_mode = 'ANONYMOUS' AND f.seating_mode <> 'TABLE') OR EXISTS (
        SELECT 1 FROM floorplan_shape t WHERE t.floorplan_id = f.id AND t.deleted_at IS NULL AND
          ((t.kind = 'TABLE' AND (t.capacity <= 0 OR t.capacity <
            (SELECT count(*) FROM assistant WHERE floorplan_shape_id = t.id AND deleted_at IS NULL) +
            (SELECT count(*) FROM physical_pass WHERE floorplan_shape_id = t.id AND deleted_at IS NULL AND revoked_at IS NULL)))
           OR (t.kind = 'DECORATIVE_ZONE' AND t.capacity <> 0)
           OR (f.seating_mode = 'SEAT' AND t.kind = 'TABLE' AND t.capacity <>
            (SELECT count(*) FROM floorplan_seat WHERE floorplan_shape_id = t.id AND deleted_at IS NULL AND NOT is_blocked))))
        OR EXISTS (SELECT 1 FROM floorplan_seat s LEFT JOIN floorplan_shape t ON t.id = s.floorplan_shape_id
          WHERE s.floorplan_id = f.id AND s.deleted_at IS NULL AND (t.id IS NULL OR t.kind <> 'TABLE' OR t.deleted_at IS NOT NULL)) THEN
        problems := array_append(problems, 'EVENT_FLOORPLAN_INCONSISTENT');
      END IF;
    END IF;
  END IF;
  -- Assignment validity applies to all live registered nominal people, including pending issuance.
  IF EXISTS (SELECT 1 FROM assistant a LEFT JOIN floorplan_shape t ON t.id = a.floorplan_shape_id
    LEFT JOIN floorplan_seat s ON s.id = a.floorplan_seat_id
    WHERE a.event_id = target AND a.deleted_at IS NULL AND a.anonymized_at IS NULL AND (
      (NOT e.floorplan_enabled AND (a.floorplan_shape_id IS NOT NULL OR a.floorplan_seat_id IS NOT NULL))
      OR (e.floorplan_enabled AND (t.id IS NULL OR t.event_id <> target OR t.floorplan_id IS DISTINCT FROM f.id
        OR t.kind <> 'TABLE' OR t.deleted_at IS NOT NULL
        OR (f.seating_mode = 'TABLE' AND a.floorplan_seat_id IS NOT NULL)
        OR (f.seating_mode = 'SEAT' AND (s.id IS NULL OR s.deleted_at IS NOT NULL OR s.is_blocked
          OR s.event_id <> target OR s.floorplan_id <> f.id OR s.floorplan_shape_id <> t.id))))))
    OR EXISTS (SELECT 1 FROM physical_pass p LEFT JOIN floorplan_shape t ON t.id = p.floorplan_shape_id
      WHERE p.event_id = target AND p.deleted_at IS NULL AND p.revoked_at IS NULL AND (
        (NOT e.floorplan_enabled AND p.floorplan_shape_id IS NOT NULL)
        OR (e.floorplan_enabled AND (t.id IS NULL OR t.event_id <> target OR t.floorplan_id IS DISTINCT FROM f.id
          OR t.kind <> 'TABLE' OR t.deleted_at IS NOT NULL)))) THEN
    problems := array_append(problems, 'EVENT_ACCESS_SEATING_INCOMPLETE');
  END IF;
  RETURN QUERY SELECT e.access_mode, ARRAY(SELECT DISTINCT unnest(problems) ORDER BY 1), material, e.capacity;
END;
$$;

-- Keep M01 snapshot/reference/state triggers untouched. This guard is scoped to B01.
CREATE FUNCTION protect_access_control_activation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE problems TEXT[];
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.activated_at IS NOT NULL
    AND NEW.access_activation_result_snapshot IS DISTINCT FROM OLD.access_activation_result_snapshot THEN
    RAISE EXCEPTION 'EVENT_ACCESS_ACTIVATION_SNAPSHOT_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  IF NEW.access_mode IS NOT NULL AND NEW.activated_at IS NOT NULL
    AND (TG_OP = 'INSERT' OR OLD.activated_at IS NULL) THEN
    IF TG_OP = 'INSERT' OR NEW.status <> 'active' OR current_setting('transaction_isolation') <> 'serializable' THEN
      RAISE EXCEPTION 'EVENT_ACCESS_ACTIVATION_REQUIRES_SERIALIZABLE_PREPARATION' USING ERRCODE = '23514';
    END IF;
    IF ROW(NEW.client_id, NEW.service_id, NEW.access_mode, NEW.assigned_planner_user_id, NEW.name, NEW.social_type,
      NEW.event_date_time, NEW.time_zone, NEW.capacity, NEW.floorplan_enabled, NEW.deleted_at)
      IS DISTINCT FROM ROW(OLD.client_id, OLD.service_id, OLD.access_mode, OLD.assigned_planner_user_id, OLD.name, OLD.social_type,
      OLD.event_date_time, OLD.time_zone, OLD.capacity, OLD.floorplan_enabled, OLD.deleted_at) THEN
      RAISE EXCEPTION 'EVENT_ACCESS_ACTIVATION_CONFIGURATION_CHANGED' USING ERRCODE = '23514';
    END IF;
    SELECT r.blockers INTO problems FROM resolve_access_control_readiness(NEW.id) r;
    IF cardinality(problems) > 0 THEN
      RAISE EXCEPTION 'EVENT_ACCESS_CONTROL_NOT_READY' USING ERRCODE = '23514', DETAIL = array_to_string(problems, ',');
    END IF;
    IF NEW.access_activation_result_snapshot IS NULL
      OR jsonb_typeof(NEW.access_activation_result_snapshot) <> 'object'
      OR NEW.access_activation_result_snapshot->>'id' IS DISTINCT FROM NEW.id::TEXT
      OR NEW.access_activation_result_snapshot->>'status' IS DISTINCT FROM 'ACTIVE'
      OR NEW.access_activation_result_snapshot->>'activationIdempotencyKey' IS DISTINCT FROM NEW.activation_idempotency_key
      OR NOT (NEW.access_activation_result_snapshot @> jsonb_build_object(
        'clientId', NEW.client_id, 'createdByUserId', NEW.created_by_user_id,
        'assignedPlannerUserId', NEW.assigned_planner_user_id, 'serviceId', NEW.service_id,
        'serviceCode', 'ACCESS_CONTROL', 'accessMode', NEW.access_mode, 'name', NEW.name,
        'socialType', upper(NEW.social_type::TEXT), 'capacity', NEW.capacity, 'timeZone', NEW.time_zone,
        'floorplanEnabled', NEW.floorplan_enabled, 'activatedByUserId', NEW.activated_by_user_id,
        'activatedServiceId', NEW.activated_service_id, 'activatedServicePriceId', NULL,
        'activationReceiptId', NULL, 'baseCostCredits', NULL, 'promotionDiscountCredits', NULL,
        'finalCostCredits', NULL, 'purchasedCreditsUsed', NULL, 'creditLineCreditsUsed', NULL,
        'creditUnitValueMxnCentsSnapshot', NULL))
      OR (NEW.access_activation_result_snapshot->>'activatedAt')::TIMESTAMPTZ IS DISTINCT FROM NEW.activated_at THEN
      RAISE EXCEPTION 'EVENT_ACCESS_ACTIVATION_SNAPSHOT_INVALID' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.activated_at IS NULL AND NEW.access_activation_result_snapshot IS NOT NULL THEN
    RAISE EXCEPTION 'EVENT_ACCESS_ACTIVATION_SNAPSHOT_INVALID' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER event_access_readiness_activation_trigger BEFORE INSERT OR UPDATE ON event
FOR EACH ROW EXECUTE FUNCTION protect_access_control_activation();

CREATE FUNCTION assert_nominal_access_capacity() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE e event%ROWTYPE; rights INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'event' THEN
    IF NEW.access_mode IS DISTINCT FROM 'NOMINAL' THEN RETURN NEW; END IF;
    rights := count_nominal_access_rights(NEW.id);
    IF rights > 0 AND (NEW.capacity IS NULL OR NEW.capacity < rights) THEN
      RAISE EXCEPTION 'EVENT_ACCESS_CAPACITY_EXCEEDED' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT * INTO e FROM event WHERE id = NEW.event_id FOR UPDATE;
    IF e.access_mode IS DISTINCT FROM 'NOMINAL' THEN RETURN NEW; END IF;
    rights := count_nominal_access_rights(NEW.event_id);
    IF rights >= COALESCE(e.capacity, 0) OR rights >= 150 THEN
      RAISE EXCEPTION 'EVENT_ACCESS_CAPACITY_EXCEEDED' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER nominal_access_capacity_insert BEFORE INSERT ON assistant_access_credential
FOR EACH ROW EXECUTE FUNCTION assert_nominal_access_capacity();
CREATE TRIGGER nominal_access_capacity_reduction BEFORE UPDATE OF capacity ON event
FOR EACH ROW EXECUTE FUNCTION assert_nominal_access_capacity();

-- External eligibility can invalidate a prepared Event without a material mutation.
-- Only demote preparation; never rewrite an operational Event or its snapshot.
CREATE FUNCTION invalidate_access_control_preparation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE target UUID; problems TEXT[];
BEGIN
  FOR target IN SELECT e.id FROM event e WHERE e.access_mode IS NOT NULL AND e.activated_at IS NULL
    AND e.status = 'ready_to_activate' AND (
      (TG_TABLE_NAME = 'client' AND e.client_id = NEW.id)
      OR (TG_TABLE_NAME = 'app_user' AND e.assigned_planner_user_id = NEW.id)
      OR (TG_TABLE_NAME = 'service' AND e.service_id = NEW.id)) ORDER BY e.id FOR UPDATE
  LOOP
    SELECT r.blockers INTO problems FROM resolve_access_control_readiness(target) r;
    IF cardinality(problems) > 0 THEN UPDATE event SET status = 'configured', updated_at = clock_timestamp() WHERE id = target; END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER client_invalidate_access_preparation AFTER UPDATE OF status, deleted_at ON client
FOR EACH ROW EXECUTE FUNCTION invalidate_access_control_preparation();
CREATE TRIGGER user_invalidate_access_preparation AFTER UPDATE OF role, client_id, deleted_at ON app_user
FOR EACH ROW EXECUTE FUNCTION invalidate_access_control_preparation();
CREATE TRIGGER service_invalidate_access_preparation AFTER UPDATE OF is_active ON service
FOR EACH ROW EXECUTE FUNCTION invalidate_access_control_preparation();
COMMIT;
