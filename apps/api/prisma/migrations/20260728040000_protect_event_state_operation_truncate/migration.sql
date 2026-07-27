CREATE TRIGGER "event_state_operation_prevent_truncate"
  BEFORE TRUNCATE ON "event_state_operation"
  FOR EACH STATEMENT
  EXECUTE FUNCTION prevent_event_state_operation_mutation();
