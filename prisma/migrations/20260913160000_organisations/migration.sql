-- Health Service plan (phase 5): organisations above facilities. And the two Stripe id columns for
-- the dormant card path (phase 4), added here so one migration carries both phases.
CREATE TABLE "Organisation" (
    "id"           TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plan"         TEXT NOT NULL DEFAULT 'health_service',
    "planStatus"   TEXT NOT NULL DEFAULT 'trial',
    "trialEndsAt"  TIMESTAMP(3),
    "paidUntil"    TIMESTAMP(3),
    "billingEmail" TEXT NOT NULL DEFAULT '',
    "planNote"     TEXT NOT NULL DEFAULT '',
    "ssoEnabled"   BOOLEAN NOT NULL DEFAULT false,
    "ssoDomains"   TEXT[] DEFAULT ARRAY[]::TEXT[],
    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrgUser" (
    "id"            TEXT NOT NULL,
    "orgId"         TEXT NOT NULL,
    "email"         TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "passwordHash"  TEXT NOT NULL,
    "totpSecret"    TEXT NOT NULL DEFAULT '',
    "totpEnabledAt" TIMESTAMP(3),
    "inactive"      BOOLEAN NOT NULL DEFAULT false,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt"    TIMESTAMP(3),
    CONSTRAINT "OrgUser_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrgUser_email_key" ON "OrgUser"("email");
CREATE INDEX "OrgUser_orgId_idx" ON "OrgUser"("orgId");
ALTER TABLE "OrgUser" ADD CONSTRAINT "OrgUser_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OrgCatalogItem" (
    "id"        TEXT NOT NULL,
    "orgId"     TEXT NOT NULL,
    "item"      TEXT NOT NULL,
    "gender"    TEXT NOT NULL DEFAULT 'Unisex',
    "type"      TEXT NOT NULL DEFAULT '',
    "sku"       TEXT NOT NULL DEFAULT '',
    "supplier"  TEXT NOT NULL DEFAULT '',
    "cost"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "groups"    TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sizes"     TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes"     TEXT NOT NULL DEFAULT '',
    "archived"  BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgCatalogItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrgCatalogItem_orgId_item_gender_key" ON "OrgCatalogItem"("orgId", "item", "gender");
ALTER TABLE "OrgCatalogItem" ADD CONSTRAINT "OrgCatalogItem_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OrgSupplier" (
    "id"      TEXT NOT NULL,
    "orgId"   TEXT NOT NULL,
    "name"    TEXT NOT NULL,
    "contact" TEXT NOT NULL DEFAULT '',
    "phone"   TEXT NOT NULL DEFAULT '',
    "account" TEXT NOT NULL DEFAULT '',
    "lead"    INTEGER,
    CONSTRAINT "OrgSupplier_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrgSupplier_orgId_name_key" ON "OrgSupplier"("orgId", "name");
ALTER TABLE "OrgSupplier" ADD CONSTRAINT "OrgSupplier_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OrgEvent" (
    "id"     TEXT NOT NULL,
    "orgId"  TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "ip"     TEXT NOT NULL DEFAULT '',
    "at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrgEvent_orgId_at_idx" ON "OrgEvent"("orgId", "at");
ALTER TABLE "OrgEvent" ADD CONSTRAINT "OrgEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrgEvent" ADD CONSTRAINT "OrgEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "OrgUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Facility" ADD COLUMN "orgId" TEXT,
                       ADD COLUMN "stripeCustomerId" TEXT NOT NULL DEFAULT '',
                       ADD COLUMN "stripeSubscriptionId" TEXT NOT NULL DEFAULT '';
CREATE INDEX "Facility_orgId_idx" ON "Facility"("orgId");
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CatalogItem" ADD COLUMN "orgItemId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_ro') THEN
    RAISE NOTICE 'ops_ro does not exist — organisation grants skipped';
    RETURN;
  END IF;
  GRANT SELECT ("orgId") ON "Facility" TO ops_ro;
  GRANT SELECT ("id", "name", "createdAt", "plan", "planStatus", "trialEndsAt", "paidUntil", "planNote", "ssoEnabled") ON "Organisation" TO ops_ro;
  GRANT SELECT ("id", "orgId", "name", "inactive", "createdAt", "lastSeenAt", "totpEnabledAt") ON "OrgUser" TO ops_ro;
END $$;
