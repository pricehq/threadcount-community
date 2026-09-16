CREATE TABLE "PlatformSwitch" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "signupsDisabled" BOOLEAN NOT NULL DEFAULT false,
    "demoDisabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSwitch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Facility" ADD COLUMN "plan" TEXT NOT NULL DEFAULT '',
                       ADD COLUMN "planNote" TEXT NOT NULL DEFAULT '';

-- no grant, no failed deploy. (`prisma migrate deploy` runs as the app role, which owns the table,
-- so the grant itself needs no more than that.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_ro') THEN
    RAISE NOTICE 'ops_ro does not exist — plan grants skipped';
    RETURN;
  END IF;
  GRANT SELECT ("plan", "planNote") ON "Facility" TO ops_ro;
END $$;
