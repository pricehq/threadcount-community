-- New facilities no longer start with a hospital linen room as their store or on their collection
-- slip. Existing rows keep whatever they have; sign-up now fills both from the chosen words.
ALTER TABLE "Facility" ALTER COLUMN "location" SET DEFAULT 'Uniform Store';
ALTER TABLE "Facility" ALTER COLUMN "slipCollectionFooter" SET DEFAULT 'Collect from the uniform store during opening hours. Enquiries: see coordinator.';
