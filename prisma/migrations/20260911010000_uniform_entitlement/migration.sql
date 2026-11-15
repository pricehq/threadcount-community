-- The uniform entitlement the signed order form describes.
--
-- This runs against a live linen room, so every column added here carries a default: a NOT NULL
-- with nothing behind it fails the moment a table has rows in it, and all of these do.

-- The initial kit for everybody who is not on the nursing FTE table, in sets (a set being a top and
-- a bottom). Separate from defaultEntitlement, which keeps its meaning — garments per financial
-- year — for everything that already reads it.
ALTER TABLE "Facility" ADD COLUMN "initialSets" INTEGER NOT NULL DEFAULT 3;

-- The footer of the printed order form. Empty until a facility fills them in, because the only
-- place a hospital's own e-mail address and phone number may live is that hospital's own settings.
ALTER TABLE "Facility" ADD COLUMN "coordinatorEmail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Facility" ADD COLUMN "coordinatorPhone" TEXT NOT NULL DEFAULT '';

-- Which staff groups the nursing rules apply to. The four names are the ones the form itself lists
-- under a single FTE table; USINS is on it and contains none of the letters the old test matched.
ALTER TABLE "Facility" ADD COLUMN "nursingGroups" TEXT[] DEFAULT ARRAY['Registered Nurse', 'Enrolled Nurse', 'Assistant in Nursing', 'USINS']::TEXT[];

-- Nobody's entitlement may move on deploy. Until today a group counted as nursing if its name
-- contained "nurs" anywhere, so a facility that invented "Nurse Practitioner" or "Nursing
-- Assistant" has people relying on that right now, and handing them only the four default names
-- would quietly drop them onto a counted allowance. Every group a facility actually uses — in its
-- settings list and on its staff records — that the old test called nursing is therefore carried
-- across alongside the defaults.
UPDATE "Facility" f
SET "nursingGroups" = ARRAY(
  SELECT DISTINCT g
  FROM (
    SELECT unnest(f."nursingGroups") AS g
    UNION SELECT unnest(f."staffGroups")
    UNION SELECT s."group" FROM "Staff" s WHERE s."facilityId" = f."id"
  ) t
  WHERE g <> '' AND (g ILIKE '%nurs%' OR g = ANY(f."nursingGroups"))
  ORDER BY g
);

-- Combined FTE as the form writes it: "1.0" … "0.1", or "Casual". A string, like Approval.fte,
-- because Casual is not a number. Blank on every existing row, and blank proposes no kit, so
-- nothing changes for anyone already on the register until somebody sets one.
ALTER TABLE "Staff" ADD COLUMN "fte" TEXT NOT NULL DEFAULT '';
