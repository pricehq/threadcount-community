-- The first-run checklist on the coordinator dashboard can be dismissed; that is the only state it
-- keeps. Everything else it shows is derived from the records already in the snapshot.
ALTER TABLE "Facility" ADD COLUMN "checklistDismissed" BOOLEAN NOT NULL DEFAULT false;
