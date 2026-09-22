ALTER TABLE "event"
ADD COLUMN "event_end_date_time" TIMESTAMPTZ(6);

ALTER TABLE "event"
ADD CONSTRAINT "event_end_date_time_after_start_check"
CHECK (
  "event_end_date_time" IS NULL
  OR (
    "event_date_time" IS NOT NULL
    AND "event_end_date_time" > "event_date_time"
  )
);
