-- Where a garment lives. A tree of rooms, shelves and bays, plus laundry / external.
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'Shelf',
    "parentId" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Location_facilityId_name_key" ON "Location"("facilityId", "name");
CREATE INDEX "Location_facilityId_idx" ON "Location"("facilityId");
CREATE INDEX "Location_parentId_idx" ON "Location"("parentId");

ALTER TABLE "Location" ADD CONSTRAINT "Location_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Location" ADD CONSTRAINT "Location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A variant's home location.
ALTER TABLE "StockLevel" ADD COLUMN "locationId" TEXT;
CREATE INDEX "StockLevel_locationId_idx" ON "StockLevel"("locationId");
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The location a stocktake was scoped to; NULL means the whole linen room.
ALTER TABLE "Stocktake" ADD COLUMN "locationId" TEXT;
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Why a counted line didn't match, and the gap at which a reason becomes compulsory.
ALTER TABLE "StocktakeLine" ADD COLUMN "reason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Facility" ADD COLUMN "varianceReason" INTEGER NOT NULL DEFAULT 5;
