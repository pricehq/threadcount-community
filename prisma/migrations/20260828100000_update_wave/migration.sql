-- Facility: new settings, drop suppliers[] after copying into Supplier rows
ALTER TABLE "Facility" ADD COLUMN "exceptionHigh" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "glAccount" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "journalDesc" TEXT NOT NULL DEFAULT 'Uniform issues',
  ADD COLUMN "lastBackup" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "logoData" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Facility" ALTER COLUMN "defaultEntitlement" SET DEFAULT 5;

CREATE TABLE "Supplier" (
  "id" TEXT NOT NULL, "facilityId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "contact" TEXT NOT NULL DEFAULT '', "phone" TEXT NOT NULL DEFAULT '', "account" TEXT NOT NULL DEFAULT '',
  "lead" INTEGER, "sort" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Supplier_facilityId_name_key" ON "Supplier"("facilityId", "name");
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Supplier" ("id", "facilityId", "name", "sort")
SELECT md5(random()::text || f.id || s.name || s.ord::text), f.id, s.name, s.ord - 1
FROM "Facility" f, LATERAL unnest(f."suppliers") WITH ORDINALITY AS s(name, ord);

ALTER TABLE "Facility" DROP COLUMN "suppliers";

-- Staff
ALTER TABLE "Staff" ADD COLUMN "ccOverride" TEXT NOT NULL DEFAULT '', ADD COLUMN "inactive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Staff" DROP COLUMN "shoe";

-- Approvals
CREATE TABLE "Approval" (
  "id" TEXT NOT NULL, "facilityId" TEXT NOT NULL, "staffId" TEXT NOT NULL, "date" TEXT NOT NULL,
  "byName" TEXT NOT NULL DEFAULT '', "sets" INTEGER NOT NULL, "fte" TEXT NOT NULL DEFAULT '', "notes" TEXT NOT NULL DEFAULT '',
  "used" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Approval_staffId_idx" ON "Approval"("staffId");
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Alterations
CREATE TABLE "Alteration" (
  "id" TEXT NOT NULL, "facilityId" TEXT NOT NULL, "staffId" TEXT NOT NULL, "date" TEXT NOT NULL,
  "garment" TEXT NOT NULL, "desc" TEXT NOT NULL DEFAULT '', "status" TEXT NOT NULL DEFAULT 'Requested',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Alteration_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Alteration_staffId_idx" ON "Alteration"("staffId");
ALTER TABLE "Alteration" ADD CONSTRAINT "Alteration_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Alteration" ADD CONSTRAINT "Alteration_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
