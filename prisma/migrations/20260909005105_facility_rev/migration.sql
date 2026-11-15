-- A counter the screens can poll to find out that somebody else changed something.
--
-- Cheap on purpose: one integer on a row every device already looks up by primary key. The
-- alternative was re-reading the facility's whole snapshot on a timer to spot a difference, which
-- on a ward phone is the entire catalogue every few seconds to learn that nothing happened.
ALTER TABLE "Facility" ADD COLUMN "rev" INTEGER NOT NULL DEFAULT 0;
