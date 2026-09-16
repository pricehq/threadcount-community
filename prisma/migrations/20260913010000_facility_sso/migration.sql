-- Single sign-on per facility. The IdP metadata itself lives in the Jackson broker, keyed by
-- facility id; these columns are the switches and the routing (email domains → facility).
ALTER TABLE "Facility" ADD COLUMN "ssoEnabled" BOOLEAN NOT NULL DEFAULT false,
                       ADD COLUMN "ssoRequired" BOOLEAN NOT NULL DEFAULT false,
                       ADD COLUMN "ssoStaff" BOOLEAN NOT NULL DEFAULT false,
                       ADD COLUMN "ssoDomains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- The admin who keeps a working password when the facility requires SSO.
ALTER TABLE "User" ADD COLUMN "ssoBreakGlass" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_ro') THEN
    RAISE NOTICE 'ops_ro does not exist — sso grants skipped';
    RETURN;
  END IF;
  GRANT SELECT ("ssoEnabled", "ssoRequired", "ssoStaff") ON "Facility" TO ops_ro;
END $$;
