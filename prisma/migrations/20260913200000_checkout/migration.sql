-- On-site checkout: the business details a facility types when it subscribes by card, the
-- cadence it chose, and when it agreed to the Terms, the Privacy Policy and the SLA.
ALTER TABLE "Facility" ADD COLUMN "billingLegalName" TEXT NOT NULL DEFAULT '',
                       ADD COLUMN "billingTaxId"     TEXT NOT NULL DEFAULT '',
                       ADD COLUMN "billingAddress"   JSONB,
                       ADD COLUMN "billingCountry"   TEXT NOT NULL DEFAULT '',
                       ADD COLUMN "billingCadence"   TEXT NOT NULL DEFAULT '',
                       ADD COLUMN "agreedTermsAt"    TIMESTAMP(3),
                       ADD COLUMN "agreedPrivacyAt"  TIMESTAMP(3),
                       ADD COLUMN "agreedSlaAt"      TIMESTAMP(3),
                       ADD COLUMN "agreedVersion"    TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_ro') THEN
    RAISE NOTICE 'ops_ro does not exist — checkout grants skipped';
    RETURN;
  END IF;
  GRANT SELECT ("billingCountry", "billingCadence", "agreedTermsAt", "agreedPrivacyAt", "agreedSlaAt", "agreedVersion") ON "Facility" TO ops_ro;
END $$;
