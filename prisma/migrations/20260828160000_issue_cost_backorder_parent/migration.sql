-- Cost at time of issue (backfilled from the current catalogue price for existing rows)
ALTER TABLE "Issue" ADD COLUMN "cost" DOUBLE PRECISION NOT NULL DEFAULT 0;
UPDATE "Issue" i SET "cost" = c."cost" FROM "CatalogItem" c WHERE c."id" = i."itemId";

-- Back orders link to their parent order
ALTER TABLE "Order" ADD COLUMN "parentId" TEXT;
ALTER TABLE "Order" ADD CONSTRAINT "Order_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
UPDATE "Order" b SET "parentId" = p."id"
FROM "Order" p
WHERE b."parentId" IS NULL AND b."status" IN ('Back Order','Received','Cancelled','Shipped','Ordered')
  AND b."notes" LIKE 'Back order — short on ORD-%'
  AND p."facilityId" = b."facilityId"
  AND p."code" = substring(b."notes" from 'short on (ORD-[0-9]+-[0-9]+)');
