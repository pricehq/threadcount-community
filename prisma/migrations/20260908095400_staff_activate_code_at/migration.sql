-- When an activation slip was printed, so an unused one can go stale. Null for codes issued before
-- this migration: they have no known age, and the activate route treats an undated code as expired
-- rather than as forever fresh, so the linen room reissues the handful that are still outstanding.
ALTER TABLE "Staff" ADD COLUMN "activateCodeAt" TIMESTAMP(3);
