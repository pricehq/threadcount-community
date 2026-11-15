-- Allowance credit is only for garments that were actually issued from the shelf
ALTER TABLE "HandInLine" ADD COLUMN "credited" INTEGER NOT NULL DEFAULT 0;
UPDATE "HandInLine" l SET "credited" = l."qty" FROM "HandIn" h WHERE h."id" = l."handInId" AND h."credit" = true AND l."cond" = 'Good';
