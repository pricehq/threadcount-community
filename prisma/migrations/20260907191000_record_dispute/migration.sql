-- CreateTable
CREATE TABLE "RecordDispute" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "itemId" TEXT,
    "sizeIndex" INTEGER,
    "body" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordDispute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecordDispute_facilityId_resolvedAt_idx" ON "RecordDispute"("facilityId", "resolvedAt");

-- CreateIndex
CREATE INDEX "RecordDispute_staffId_idx" ON "RecordDispute"("staffId");

-- AddForeignKey
ALTER TABLE "RecordDispute" ADD CONSTRAINT "RecordDispute_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordDispute" ADD CONSTRAINT "RecordDispute_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordDispute" ADD CONSTRAINT "RecordDispute_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

