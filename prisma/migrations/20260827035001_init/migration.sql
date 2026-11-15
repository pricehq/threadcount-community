-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ISSUER');

-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT 'Linen Room',
    "coordinator" TEXT NOT NULL DEFAULT '',
    "defaultEntitlement" INTEGER NOT NULL DEFAULT 8,
    "defaultReorder" INTEGER NOT NULL DEFAULT 3,
    "suppliers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "staffGroups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "orderSeq" INTEGER NOT NULL DEFAULT 0,
    "catalogSeq" INTEGER NOT NULL DEFAULT 0,
    "slipCollectionFooter" TEXT NOT NULL DEFAULT 'Collect from the Linen Room during opening hours. Enquiries: see coordinator.',
    "slipDeliveryFooter" TEXT NOT NULL DEFAULT 'After hours deliveries are left with the ward NUM or team leader.',
    "slipOrg" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "first" TEXT NOT NULL,
    "last" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "role" "Role" NOT NULL DEFAULT 'ISSUER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "sort" INTEGER NOT NULL,
    "item" TEXT NOT NULL,
    "gender" TEXT NOT NULL DEFAULT 'Unisex',
    "sku" TEXT NOT NULL DEFAULT '',
    "supplier" TEXT NOT NULL DEFAULT '',
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "group" TEXT NOT NULL DEFAULT 'All',
    "notes" TEXT NOT NULL DEFAULT '',
    "sizes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Barcode" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "sizeIndex" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'bound',

    CONSTRAINT "Barcode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLevel" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "sizeIndex" INTEGER NOT NULL,
    "opening" INTEGER NOT NULL DEFAULT 0,
    "adj" INTEGER NOT NULL DEFAULT 0,
    "reorder" INTEGER,

    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMove" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "sizeIndex" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "byName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMove_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cc" TEXT NOT NULL DEFAULT '',
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "num" TEXT NOT NULL,
    "first" TEXT NOT NULL,
    "last" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "group" TEXT NOT NULL DEFAULT '',
    "dept" TEXT NOT NULL DEFAULT '',
    "top" TEXT NOT NULL DEFAULT '',
    "pants" TEXT NOT NULL DEFAULT '',
    "shoe" TEXT NOT NULL DEFAULT '',
    "ent" INTEGER,
    "start" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "sizeIndex" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "cond" TEXT NOT NULL DEFAULT 'New',
    "orderCode" TEXT NOT NULL DEFAULT '',
    "receipt" BOOLEAN NOT NULL DEFAULT false,
    "returnedDate" TEXT,
    "returnedCond" TEXT,
    "override" BOOLEAN NOT NULL DEFAULT false,
    "direct" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'Supplier Order',
    "orderFor" TEXT NOT NULL DEFAULT 'Stock',
    "staffId" TEXT,
    "supplier" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "ref" TEXT NOT NULL DEFAULT '',
    "invoice" TEXT NOT NULL DEFAULT '',
    "tracking" TEXT NOT NULL DEFAULT '',
    "expected" TEXT NOT NULL DEFAULT '',
    "received" TEXT NOT NULL DEFAULT '',
    "cc" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "replenish" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "invoice" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptLine" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "dest" TEXT NOT NULL DEFAULT 'shelf',
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pickup" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "received" TEXT NOT NULL,
    "contacted" BOOLEAN NOT NULL DEFAULT false,
    "pickedUp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pickup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupLine" (
    "id" TEXT NOT NULL,
    "pickupId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "PickupLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stocktake" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "byName" TEXT NOT NULL,
    "counted" INTEGER NOT NULL,
    "variances" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stocktake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StocktakeLine" (
    "id" TEXT NOT NULL,
    "stocktakeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "sizeIndex" INTEGER NOT NULL,
    "sys" INTEGER NOT NULL,
    "counted" INTEGER NOT NULL,

    CONSTRAINT "StocktakeLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_facilityId_idx" ON "User"("facilityId");

-- CreateIndex
CREATE INDEX "CatalogItem_facilityId_idx" ON "CatalogItem"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_facilityId_sort_key" ON "CatalogItem"("facilityId", "sort");

-- CreateIndex
CREATE INDEX "Barcode_itemId_idx" ON "Barcode"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Barcode_facilityId_code_key" ON "Barcode"("facilityId", "code");

-- CreateIndex
CREATE INDEX "StockLevel_facilityId_idx" ON "StockLevel"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_itemId_sizeIndex_key" ON "StockLevel"("itemId", "sizeIndex");

-- CreateIndex
CREATE INDEX "StockMove_facilityId_idx" ON "StockMove"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_facilityId_name_key" ON "Department"("facilityId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_facilityId_num_key" ON "Staff"("facilityId", "num");

-- CreateIndex
CREATE INDEX "Issue_facilityId_date_idx" ON "Issue"("facilityId", "date");

-- CreateIndex
CREATE INDEX "Issue_staffId_idx" ON "Issue"("staffId");

-- CreateIndex
CREATE INDEX "Order_facilityId_idx" ON "Order"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_facilityId_code_key" ON "Order"("facilityId", "code");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE INDEX "Receipt_orderId_idx" ON "Receipt"("orderId");

-- CreateIndex
CREATE INDEX "ReceiptLine_receiptId_idx" ON "ReceiptLine"("receiptId");

-- CreateIndex
CREATE INDEX "Pickup_facilityId_idx" ON "Pickup"("facilityId");

-- CreateIndex
CREATE INDEX "PickupLine_pickupId_idx" ON "PickupLine"("pickupId");

-- CreateIndex
CREATE INDEX "Stocktake_facilityId_idx" ON "Stocktake"("facilityId");

-- CreateIndex
CREATE INDEX "StocktakeLine_stocktakeId_idx" ON "StocktakeLine"("stocktakeId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Barcode" ADD CONSTRAINT "Barcode_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Barcode" ADD CONSTRAINT "Barcode_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pickup" ADD CONSTRAINT "Pickup_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pickup" ADD CONSTRAINT "Pickup_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pickup" ADD CONSTRAINT "Pickup_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupLine" ADD CONSTRAINT "PickupLine_pickupId_fkey" FOREIGN KEY ("pickupId") REFERENCES "Pickup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupLine" ADD CONSTRAINT "PickupLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeLine" ADD CONSTRAINT "StocktakeLine_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "Stocktake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeLine" ADD CONSTRAINT "StocktakeLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
