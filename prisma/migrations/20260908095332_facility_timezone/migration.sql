-- The zone a facility's "today" is measured in. Existing rows keep Brisbane, which is exactly what
-- they have been getting from the hardcoded formatter, so no stored date changes meaning.
ALTER TABLE "Facility" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Australia/Brisbane';
