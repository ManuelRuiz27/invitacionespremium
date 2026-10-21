-- DT06A: assigned ownership only for ACCESS_CONTROL; legacy creator rule is unchanged.
CREATE OR REPLACE FUNCTION validate_staff_token_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_client_id UUID;
  target_creator_id UUID;
  target_assigned_planner_id UUID;
  target_service_id UUID;
  target_access_mode "event_access_mode";
  target_is_access_control BOOLEAN;
  target_status "event_status";
  target_deleted_at TIMESTAMPTZ;
  actor_client_id UUID;
  actor_role "user_role";
  actor_deleted_at TIMESTAMPTZ;
  active_count INTEGER;
BEGIN
  SELECT "client_id", "created_by_user_id", "assigned_planner_user_id", "service_id",
    "access_mode", "status", "deleted_at"
  INTO target_client_id, target_creator_id, target_assigned_planner_id, target_service_id,
    target_access_mode, target_status, target_deleted_at
  FROM "event"
  WHERE "id" = NEW."event_id"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'staff_token event does not exist'
      USING ERRCODE = '23503', CONSTRAINT = 'staff_token_event_required';
  END IF;

  IF target_deleted_at IS NOT NULL OR target_status NOT IN ('active', 'event_day') THEN
    RAISE EXCEPTION 'staff_token requires an operational event'
      USING ERRCODE = 'P0001', CONSTRAINT = 'staff_token_operational_event_required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM "service"
    WHERE "id" = target_service_id AND "code" = 'ACCESS_CONTROL'
  ) AND target_access_mode IN ('NOMINAL', 'ANONYMOUS')
  INTO target_is_access_control;

  SELECT "client_id", "role", "deleted_at"
  INTO actor_client_id, actor_role, actor_deleted_at
  FROM "app_user"
  WHERE "id" = NEW."created_by_user_id";

  IF NOT FOUND
    OR actor_deleted_at IS NOT NULL
    OR actor_client_id IS DISTINCT FROM target_client_id
    OR actor_role NOT IN ('INDEPENDENT_PLANNER', 'ORGANIZATION_ADMIN', 'ORGANIZATION_PLANNER')
    OR (actor_role = 'ORGANIZATION_PLANNER' AND (
      CASE WHEN target_is_access_control THEN
        NEW."created_by_user_id" IS DISTINCT FROM target_assigned_planner_id
        OR NOT EXISTS (
          SELECT 1 FROM "client"
          WHERE "id" = target_client_id AND "type" = 'ORGANIZATION'
            AND "operating_profile" = 'MANAGED' AND "status" = 'ACTIVE' AND "deleted_at" IS NULL
        )
      ELSE NEW."created_by_user_id" <> target_creator_id
      END
    ))
  THEN
    RAISE EXCEPTION 'staff_token creator is not authorized for the event'
      USING ERRCODE = 'P0001', CONSTRAINT = 'staff_token_creator_authorized';
  END IF;

  SELECT count(*)
  INTO active_count
  FROM "staff_token"
  WHERE "event_id" = NEW."event_id"
    AND "expired_at" IS NULL;

  IF active_count >= 3 THEN
    RAISE EXCEPTION 'staff_token active limit reached'
      USING ERRCODE = 'P0001', CONSTRAINT = 'staff_token_active_limit';
  END IF;

  RETURN NEW;
END;
$$;
