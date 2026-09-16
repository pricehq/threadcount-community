-- The supplier order list: a supplier product code per size, a supplier email address, and when an
-- its id/facilityId-only grants on these tables.
ALTER TABLE "StockLevel" ADD COLUMN "supplierCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Supplier"   ADD COLUMN "email"        TEXT NOT NULL DEFAULT '';
ALTER TABLE "Order"      ADD COLUMN "emailedAt"    TIMESTAMP(3);
ALTER TABLE "Order"      ADD COLUMN "printedAt"    TIMESTAMP(3);
