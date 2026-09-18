-- Plans, phase 1: the columns lib/plan.ts reads, and the promise kept before anything reads them.
ALTER TABLE "Facility" ADD COLUMN "planStatus"    TEXT NOT NULL DEFAULT 'free',
                       ADD COLUMN "trialEndsAt"   TIMESTAMP(3),
                       ADD COLUMN "paidUntil"     TIMESTAMP(3),
                       ADD COLUMN "billingEmail"  TEXT NOT NULL DEFAULT '',
                       ADD COLUMN "grandfathered" BOOLEAN NOT NULL DEFAULT false;

-- Every facility that exists when this runs was created while the pricing page said "free, and the
-- rooms using it will hear before the website does". They keep everything, for good. The demo is
-- not a customer and is left out so it never shows a plan.
UPDATE "Facility" SET "grandfathered" = true, "planStatus" = 'free' WHERE "isDemo" = false;

ALTER TABLE "PlatformSwitch" ADD COLUMN "plansLive" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_ro') THEN
    RAISE NOTICE 'ops_ro does not exist — plan grants skipped';
    RETURN;
  END IF;
  GRANT SELECT ("planStatus", "trialEndsAt", "paidUntil", "grandfathered") ON "Facility" TO ops_ro;
END $$;
