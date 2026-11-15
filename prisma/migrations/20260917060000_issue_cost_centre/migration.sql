-- The cost centre an issue was charged to, frozen at the moment it was issued.
-- Existing rows keep an empty value and fall back to the wearer's department, so no historical
-- figure moves when this lands; every row written from now on carries its own.
ALTER TABLE "Issue" ADD COLUMN "cc" TEXT NOT NULL DEFAULT '';
