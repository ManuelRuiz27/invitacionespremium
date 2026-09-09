UPDATE "client"
SET "operating_profile" = 'SELF_SERVICE'
WHERE "operating_profile" IS NULL;

ALTER TABLE "client"
  ALTER COLUMN "operating_profile" SET NOT NULL;
