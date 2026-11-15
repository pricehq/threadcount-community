-- Notifications for the staff app: the phones that asked to be told, and what each person wants to
-- be told about. Neither table is history — a device is worthless the moment its owner loses access,
-- and a preference belongs to nobody once the person is gone — so both cascade, and neither is
-- counted by the staff.delete guard in lib/ops.ts.
CREATE TABLE "StaffDevice" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffDevice_pkey" PRIMARY KEY ("id")
);
-- One token, one staff account: a phone handed on to somebody else re-points rather than doubling,
-- so the person who left stops being told about the person who arrived.
CREATE UNIQUE INDEX "StaffDevice_token_key" ON "StaffDevice"("token");
CREATE INDEX "StaffDevice_staffId_idx" ON "StaffDevice"("staffId");
CREATE INDEX "StaffDevice_facilityId_idx" ON "StaffDevice"("facilityId");
ALTER TABLE "StaffDevice" ADD CONSTRAINT "StaffDevice_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffDevice" ADD CONSTRAINT "StaffDevice_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffDevice" ADD CONSTRAINT "StaffDevice_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "StaffAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StaffNotifyPref" (
    "staffId" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "ready" BOOLEAN NOT NULL DEFAULT true,
    "round" BOOLEAN NOT NULL DEFAULT true,
    "kitcheck" BOOLEAN NOT NULL DEFAULT true,
    "waiting" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StaffNotifyPref_pkey" PRIMARY KEY ("staffId")
);
ALTER TABLE "StaffNotifyPref" ADD CONSTRAINT "StaffNotifyPref_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
