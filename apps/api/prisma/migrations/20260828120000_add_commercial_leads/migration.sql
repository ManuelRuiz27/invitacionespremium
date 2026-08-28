CREATE TYPE "commercial_opportunity_type" AS ENUM ('PLANNER_AGENCY', 'VENUE');

CREATE TABLE "commercial_lead" (
  "id" UUID NOT NULL,
  "submission_id" UUID NOT NULL,
  "opportunity_type" "commercial_opportunity_type" NOT NULL,
  "contact_name" VARCHAR(160) NOT NULL,
  "business_name" VARCHAR(160) NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "phone" VARCHAR(32),
  "estimated_events_per_month" INTEGER,
  "notes" VARCHAR(1000),
  "privacy_accepted_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "commercial_lead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commercial_lead_submission_id_key"
  ON "commercial_lead"("submission_id");

CREATE INDEX "commercial_lead_created_at_id_idx"
  ON "commercial_lead"("created_at", "id");

CREATE INDEX "commercial_lead_opportunity_type_created_at_idx"
  ON "commercial_lead"("opportunity_type", "created_at");

CREATE INDEX "commercial_lead_email_created_at_idx"
  ON "commercial_lead"("email", "created_at");
