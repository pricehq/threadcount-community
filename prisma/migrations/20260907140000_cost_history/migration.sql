-- CreateTable
CREATE TABLE "CostChange" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "previous" DOUBLE PRECISION,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "byName" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CostChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CostChange_facilityId_at_idx" ON "CostChange"("facilityId", "at");

-- CreateIndex
CREATE INDEX "CostChange_itemId_at_idx" ON "CostChange"("itemId", "at");

-- AddForeignKey
ALTER TABLE "CostChange" ADD CONSTRAINT "CostChange_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostChange" ADD CONSTRAINT "CostChange_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

