CREATE TYPE "event_state_action" AS ENUM (
  'close',
  'reopen',
  'cancel',
  'archive',
  'event_day'
);

CREATE TABLE "event_state_operation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "action" "event_state_action" NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "result_snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "event_state_operation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_state_operation_idempotency_key_check"
    CHECK (char_length("idempotency_key") BETWEEN 8 AND 128)
);

CREATE UNIQUE INDEX "event_state_operation_idempotency_key_key"
  ON "event_state_operation"("idempotency_key");
CREATE INDEX "event_state_operation_event_id_action_created_at_idx"
  ON "event_state_operation"("event_id", "action", "created_at");

ALTER TABLE "event_state_operation"
  ADD CONSTRAINT "event_state_operation_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "event"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_event_state_operation_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'event_state_operation is append-only'
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "event_state_operation_prevent_update"
  BEFORE UPDATE ON "event_state_operation"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_event_state_operation_mutation();

CREATE TRIGGER "event_state_operation_prevent_delete"
  BEFORE DELETE ON "event_state_operation"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_event_state_operation_mutation();

CREATE OR REPLACE FUNCTION enforce_event_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" IS NOT DISTINCT FROM NEW."status" THEN
    RETURN NEW;
  END IF;

  IF (OLD."status", NEW."status") NOT IN (
    ('draft', 'configured'),
    ('draft', 'cancelled'),
    ('configured', 'draft'),
    ('configured', 'ready_to_activate'),
    ('configured', 'cancelled'),
    ('ready_to_activate', 'configured'),
    ('ready_to_activate', 'active'),
    ('ready_to_activate', 'cancelled'),
    ('active', 'event_day'),
    ('active', 'closed'),
    ('active', 'cancelled'),
    ('event_day', 'closed'),
    ('event_day', 'cancelled'),
    ('closed', 'active'),
    ('closed', 'event_day'),
    ('closed', 'album_published'),
    ('closed', 'archived'),
    ('album_published', 'closed'),
    ('album_published', 'archived')
  ) THEN
    RAISE EXCEPTION 'Invalid Event status transition: % -> %', OLD."status", NEW."status"
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "event_status_transition_guard_trigger"
  BEFORE UPDATE OF "status"
  ON "event"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_event_status_transition();
