CREATE TYPE "client_operating_profile" AS ENUM ('MANAGED', 'SELF_SERVICE');

ALTER TABLE "client"
  ADD COLUMN "operating_profile" "client_operating_profile";
