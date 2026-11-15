-- Demo facility flag + reset stamp; soft-deactivated users
ALTER TABLE "Facility" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Facility" ADD COLUMN "demoResetAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "inactive" BOOLEAN NOT NULL DEFAULT false;
