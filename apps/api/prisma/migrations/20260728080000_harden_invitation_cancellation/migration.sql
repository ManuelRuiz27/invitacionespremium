CREATE FUNCTION "validate_invitation_cancellation_actor"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  "event_client_id" UUID;
  "event_creator_id" UUID;
  "actor_client_id" UUID;
  "actor_role" "user_role";
  "actor_deleted_at" TIMESTAMPTZ(6);
BEGIN
  IF OLD."cancelled_at" IS NULL AND NEW."cancelled_at" IS NOT NULL THEN
    SELECT "client_id", "created_by_user_id"
    INTO "event_client_id", "event_creator_id"
    FROM "event"
    WHERE "id" = NEW."event_id";

    SELECT "client_id", "role", "deleted_at"
    INTO "actor_client_id", "actor_role", "actor_deleted_at"
    FROM "app_user"
    WHERE "id" = NEW."cancelled_by_user_id";

    IF "actor_client_id" IS DISTINCT FROM "event_client_id"
      OR "actor_deleted_at" IS NOT NULL
      OR "actor_role" NOT IN (
        'INDEPENDENT_PLANNER',
        'ORGANIZATION_ADMIN',
        'ORGANIZATION_PLANNER'
      )
      OR (
        "actor_role" = 'ORGANIZATION_PLANNER'
        AND NEW."cancelled_by_user_id" IS DISTINCT FROM "event_creator_id"
      )
    THEN
      RAISE EXCEPTION 'invitation cancellation actor is not authorized'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "invitation_validate_cancellation_actor"
  BEFORE UPDATE ON "invitation"
  FOR EACH ROW
  EXECUTE FUNCTION "validate_invitation_cancellation_actor"();
