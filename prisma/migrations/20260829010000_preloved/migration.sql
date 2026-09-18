-- Pre-loved uniform pool + hand-ins
ALTER TABLE "StockLevel" ADD COLUMN "preloved" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Issue" ADD COLUMN "preloved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Issue" ADD COLUMN "handedIn" TEXT;
ALTER TABLE "Stocktake" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'shelf';

CREATE TABLE "HandIn" (
  "id" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "byName" TEXT NOT NULL,
  "credit" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HandIn_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HandIn_facilityId_idx" ON "HandIn"("facilityId");
CREATE INDEX "HandIn_staffId_idx" ON "HandIn"("staffId");
ALTER TABLE "HandIn" ADD CONSTRAINT "HandIn_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HandIn" ADD CONSTRAINT "HandIn_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "HandInLine" (
  "id" TEXT NOT NULL,
  "handInId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "sizeIndex" INTEGER NOT NULL,
  "qty" INTEGER NOT NULL,
  "cond" TEXT NOT NULL DEFAULT 'Good',
  "laundered" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "HandInLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HandInLine_handInId_idx" ON "HandInLine"("handInId");
ALTER TABLE "HandInLine" ADD CONSTRAINT "HandInLine_handInId_fkey" FOREIGN KEY ("handInId") REFERENCES "HandIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HandInLine" ADD CONSTRAINT "HandInLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
