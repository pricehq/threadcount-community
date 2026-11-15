-- The counter phone's per-line override reasons and signed slips. A flagged issue line carries the
-- reason it was issued anyway; a signed hand-over (issue or request) gets a Slip the staff app can show.
ALTER TABLE "Issue" ADD COLUMN "overrideReason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Issue" ADD COLUMN "slipId" TEXT;
CREATE INDEX "Issue_slipId_idx" ON "Issue"("slipId");

CREATE TABLE "Slip" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "sigId" TEXT,
    "toStaff" BOOLEAN NOT NULL DEFAULT false,
    "requestId" TEXT,
    "lines" JSONB NOT NULL,
    "byName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Slip_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Slip_facilityId_idx" ON "Slip"("facilityId");
CREATE INDEX "Slip_staffId_idx" ON "Slip"("staffId");
ALTER TABLE "Slip" ADD CONSTRAINT "Slip_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Slip" ADD CONSTRAINT "Slip_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
