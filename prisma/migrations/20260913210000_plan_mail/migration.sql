-- Billing reminders sent (trial ending, trial ended, read-only), one row each, so the daily timer
-- is idempotent. The kind carries the period end it refers to.
CREATE TABLE "PlanMail" (
    "id"         TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "kind"       TEXT NOT NULL,
    "sentAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanMail_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlanMail_facilityId_kind_key" ON "PlanMail"("facilityId", "kind");
ALTER TABLE "PlanMail" ADD CONSTRAINT "PlanMail_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_ro') THEN
    RAISE NOTICE 'ops_ro does not exist — PlanMail grant skipped';
    RETURN;
  END IF;
  GRANT SELECT ON "PlanMail" TO ops_ro;
END $$;
