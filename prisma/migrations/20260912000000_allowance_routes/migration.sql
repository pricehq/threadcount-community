-- Which staff groups start on a fixed kit, and an empty list that means what it says.
--
-- Until now two answers were made for a facility rather than by it. Whether somebody got a starting
-- kit depended on the letters "operational" appearing in their group's name, so a site that calls
-- the same job "Housekeeping" had no way to give it one. And an empty FTE-table list was read as
-- four particular nursing groups, so a site could not say that none of its groups were on the table.
-- Both answers now belong to the facility: kitGroups lists the groups on the starting kit,
-- nursingGroups the groups on the FTE table, and a group on neither is on manager approval.
--
-- This runs against live linen rooms, and every existing facility has to come out of it behaving
-- exactly as it went in. Nobody's route may move on deploy.

-- Every existing row takes the empty default here and is filled in further down.
ALTER TABLE "Facility" ADD COLUMN "kitGroups" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- A facility whose FTE-table list is empty was relying on the old reading of empty, which put four
-- named nursing groups on the table. Those four are written into that facility's own row so its
-- nurses stay where they are. This is the migration keeping a promise the product had already made
-- to that facility, not a list the product hands out: nothing reads these names after today, and a
-- facility created from here on starts with an empty list that stays empty until it names its own.
UPDATE "Facility"
SET "nursingGroups" = ARRAY['Registered Nurse', 'Enrolled Nurse', 'Assistant in Nursing', 'USINS']::TEXT[]
WHERE coalesce(cardinality("nursingGroups"), 0) = 0;

-- The starting kit went to anybody whose group had "operational" anywhere in its name, in any case.
-- The groups that test said yes to are written down as that facility's kit list: every such name in
-- its settings, and every such name actually filed on a staff record, because a roster import can
-- file people under a spelling the settings list never had and they were on the kit all the same.
-- One entry per group as the app compares names (ignoring case and outer spaces).
--
-- A group already on the FTE-table list is left off. The order form and the counter asked the
-- nursing question first, so such a group was on the FTE table, and a group may not be on both.
UPDATE "Facility" f
SET "kitGroups" = ARRAY(
  SELECT min(btrim(t.g))
  FROM (
    SELECT unnest(f."staffGroups") AS g
    UNION ALL
    SELECT s."group" FROM "Staff" s WHERE s."facilityId" = f."id"
  ) t
  WHERE t.g ~* 'operational'
    AND NOT EXISTS (
      SELECT 1 FROM unnest(f."nursingGroups") AS n(name) WHERE lower(btrim(n.name)) = lower(btrim(t.g))
    )
  GROUP BY lower(btrim(t.g))
  ORDER BY 1
);

-- Only now does the default change, so nothing above was filled from it. From here a new facility
-- starts with no group on the FTE table until it says which ones are.
ALTER TABLE "Facility" ALTER COLUMN "nursingGroups" SET DEFAULT ARRAY[]::TEXT[];

-- The delivery slip's standing footer named one employer's job title. Only the default for a new
-- facility changes: every existing facility keeps the footer it has, which is its own text now.
ALTER TABLE "Facility" ALTER COLUMN "slipDeliveryFooter" SET DEFAULT 'After hours deliveries are left with the manager or team leader on duty.';
