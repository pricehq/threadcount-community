-- The facility's own words for team, store, round and desk (lib/terms.ts). Null reads as the
-- general set. Every facility that exists before this migration was set up when ThreadCount said
-- "ward" and "linen room" everywhere, so each one keeps those words rather than waking up to new
-- ones; it can change them under Settings > Facility.
ALTER TABLE "Facility" ADD COLUMN "terms" JSONB;
UPDATE "Facility" SET "terms" = '{"team":"ward","teams":"wards","store":"linen room","round":"ward round","desk":"ward desk"}'::jsonb;
