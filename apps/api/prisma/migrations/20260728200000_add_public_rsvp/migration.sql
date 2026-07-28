ALTER TABLE "event"
  ADD COLUMN "location_url" VARCHAR(2048),
  ADD COLUMN "gift_registry_url" VARCHAR(2048),
  ADD COLUMN "confirmation_closed_at" TIMESTAMPTZ(6),
  ADD COLUMN "confirmation_closed_by_user_id" UUID,
  ADD CONSTRAINT "event_confirmation_closed_by_user_id_fkey"
    FOREIGN KEY ("confirmation_closed_by_user_id") REFERENCES "app_user"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "event_confirmation_closure_complete_check" CHECK (
    ("confirmation_closed_at" IS NULL AND "confirmation_closed_by_user_id" IS NULL)
    OR
    ("confirmation_closed_at" IS NOT NULL AND "confirmation_closed_by_user_id" IS NOT NULL)
  );

CREATE FUNCTION "is_valid_event_destination_url"("value" TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  "authority" TEXT;
  "port_value" INTEGER;
BEGIN
  IF "value" = ''
    OR "value" <> btrim("value")
    OR "value" ~ '[[:space:][:cntrl:]]'
    OR position(chr(92) IN "value") > 0
    OR "value" !~* '^https://'
    OR "value" ~* '[?&](token|invitation[-_]?token|name|nombre|phone|telefono|tel|whatsapp)='
  THEN
    RETURN FALSE;
  END IF;

  "authority" := split_part(split_part(split_part(substring("value" FROM 9), '/', 1), '?', 1), '#', 1);
  IF "authority" = ''
    OR position('@' IN "authority") > 0
    OR "authority" !~ '^([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]{0,61}[A-Za-z0-9])(\.([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]{0,61}[A-Za-z0-9]))*(:[0-9]{1,5})?$'
  THEN
    RETURN FALSE;
  END IF;

  IF "authority" ~ ':[0-9]+$' THEN
    "port_value" := substring("authority" FROM ':([0-9]+)$')::INTEGER;
    IF "port_value" > 65535 THEN
      RETURN FALSE;
    END IF;
  END IF;
  RETURN TRUE;
END;
$$;

ALTER TABLE "event"
  ADD CONSTRAINT "event_location_url_check" CHECK (
    "location_url" IS NULL OR "is_valid_event_destination_url"("location_url")
  ),
  ADD CONSTRAINT "event_gift_registry_url_check" CHECK (
    "gift_registry_url" IS NULL OR "is_valid_event_destination_url"("gift_registry_url")
  );

CREATE FUNCTION "enforce_event_rsvp_configuration"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  "actor_client_id" UUID;
  "actor_role" "user_role";
  "actor_deleted_at" TIMESTAMPTZ(6);
BEGIN
  IF OLD."status" NOT IN ('draft', 'configured', 'ready_to_activate')
    AND (
      NEW."location_url" IS DISTINCT FROM OLD."location_url"
      OR NEW."gift_registry_url" IS DISTINCT FROM OLD."gift_registry_url"
      OR NEW."confirmation_enabled" IS DISTINCT FROM OLD."confirmation_enabled"
    )
  THEN
    RAISE EXCEPTION 'event confirmation destinations are frozen after activation'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."confirmation_closed_at" IS NOT NULL
    AND (
      OLD."confirmation_closed_at" IS NULL
      OR NEW."confirmation_closed_by_user_id" IS DISTINCT FROM OLD."confirmation_closed_by_user_id"
    )
  THEN
    SELECT "client_id", "role", "deleted_at"
    INTO "actor_client_id", "actor_role", "actor_deleted_at"
    FROM "app_user"
    WHERE "id" = NEW."confirmation_closed_by_user_id";

    IF "actor_client_id" IS DISTINCT FROM NEW."client_id"
      OR "actor_deleted_at" IS NOT NULL
      OR "actor_role" NOT IN ('INDEPENDENT_PLANNER', 'ORGANIZATION_ADMIN', 'ORGANIZATION_PLANNER')
      OR (
        "actor_role" = 'ORGANIZATION_PLANNER'
        AND NEW."confirmation_closed_by_user_id" IS DISTINCT FROM NEW."created_by_user_id"
      )
    THEN
      RAISE EXCEPTION 'event confirmation closure actor is not authorized'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "event_enforce_rsvp_configuration"
  BEFORE UPDATE ON "event"
  FOR EACH ROW
  EXECUTE FUNCTION "enforce_event_rsvp_configuration"();

CREATE FUNCTION "validate_invitation_rsvp_consistency"("target_invitation_id" UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  "invitation_status" "invitation_response_status";
  "invitation_deleted_at" TIMESTAMPTZ(6);
  "active_count" INTEGER;
  "primary_count" INTEGER;
  "mismatch_count" INTEGER;
  "allowed_additional" INTEGER;
BEGIN
  SELECT "response_status", "deleted_at", "additional_assistant_limit"
  INTO "invitation_status", "invitation_deleted_at", "allowed_additional"
  FROM "invitation"
  WHERE "id" = "target_invitation_id";
  IF NOT FOUND THEN RETURN; END IF;

  SELECT
    count(*) FILTER (WHERE "deleted_at" IS NULL),
    count(*) FILTER (WHERE "deleted_at" IS NULL AND "is_primary"),
    count(*) FILTER (
      WHERE "deleted_at" IS NULL
        AND "response_status"::text <> "invitation_status"::text
    )
  INTO "active_count", "primary_count", "mismatch_count"
  FROM "assistant"
  WHERE "invitation_id" = "target_invitation_id";

  IF "invitation_deleted_at" IS NULL THEN
    IF "primary_count" <> 1 OR "active_count" > 1 + "allowed_additional" THEN
      RAISE EXCEPTION 'invitation assistant cardinality is invalid'
        USING ERRCODE = '23514';
    END IF;
    IF "mismatch_count" <> 0 THEN
      RAISE EXCEPTION 'invitation and active assistant response states must agree'
        USING ERRCODE = '23514';
    END IF;
  END IF;
END;
$$;

CREATE FUNCTION "check_invitation_rsvp_from_assistant"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM "validate_invitation_rsvp_consistency"(COALESCE(NEW."invitation_id", OLD."invitation_id"));
  RETURN NULL;
END;
$$;

CREATE FUNCTION "check_invitation_rsvp_from_invitation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM "validate_invitation_rsvp_consistency"(NEW."id");
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "assistant_validate_rsvp_consistency"
  AFTER INSERT OR UPDATE OR DELETE ON "assistant"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION "check_invitation_rsvp_from_assistant"();

CREATE CONSTRAINT TRIGGER "invitation_validate_rsvp_consistency"
  AFTER INSERT OR UPDATE OF "response_status", "additional_assistant_limit", "deleted_at" ON "invitation"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION "check_invitation_rsvp_from_invitation"();

CREATE FUNCTION "protect_rsvp_tables_from_truncate"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'invitation and assistant tables cannot be truncated'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "invitation_reject_truncate"
  BEFORE TRUNCATE ON "invitation"
  FOR EACH STATEMENT
  EXECUTE FUNCTION "protect_rsvp_tables_from_truncate"();

CREATE TRIGGER "assistant_reject_truncate"
  BEFORE TRUNCATE ON "assistant"
  FOR EACH STATEMENT
  EXECUTE FUNCTION "protect_rsvp_tables_from_truncate"();

DO $$
DECLARE "invitation_id" UUID;
BEGIN
  FOR "invitation_id" IN SELECT "id" FROM "invitation" LOOP
    PERFORM "validate_invitation_rsvp_consistency"("invitation_id");
  END LOOP;
END;
$$;
