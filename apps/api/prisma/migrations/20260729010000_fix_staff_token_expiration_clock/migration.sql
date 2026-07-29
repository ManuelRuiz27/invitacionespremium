CREATE OR REPLACE FUNCTION expire_staff_tokens_for_event_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expiration_time TIMESTAMPTZ;
BEGIN
  IF NEW."status" IN ('closed', 'cancelled')
    AND NEW."status" IS DISTINCT FROM OLD."status"
  THEN
    expiration_time := clock_timestamp();

    UPDATE "staff_token"
    SET "expired_at" = expiration_time
    WHERE "event_id" = NEW."id"
      AND "expired_at" IS NULL;
  END IF;

  RETURN NEW;
END;
$$;
