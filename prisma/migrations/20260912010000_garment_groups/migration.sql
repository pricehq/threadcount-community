-- A garment can be for several staff groups.
--
-- A catalogue item carried one group name, or "All", so a scrub top worn by four nursing groups had
-- to be marked for everybody or entered four times. It now carries a list, and an EMPTY list means
-- every group — what "All" meant.
--
-- Every garment keeps exactly the group it has: "All" or blank becomes the empty list, any other
-- name a list of that one name. Only then does the old column go.
ALTER TABLE "CatalogItem" ADD COLUMN "groups" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "CatalogItem"
SET "groups" = CASE
    WHEN lower(btrim("group")) IN ('', 'all') THEN ARRAY[]::TEXT[]
    ELSE ARRAY[btrim("group")]
END;

ALTER TABLE "CatalogItem" DROP COLUMN "group";

-- A garment issued outside the person's own staff group on the coordinator's override. Its own flag
-- rather than "override", which is the six-set ceiling's, so the record tells the two apart. Every
-- existing issue predates the rule and is not one.
ALTER TABLE "Issue" ADD COLUMN "offGroup" BOOLEAN NOT NULL DEFAULT false;
