-- One request, many garments.
--
-- A request carried a single garment on the row itself, so a nurse who needed a tunic, trousers
-- and a fleece raised three requests: three codes, three approval emails to the same manager on
-- the same day, three picks, three bags. The garments move onto lines here, and each line keeps
-- its own status so a manager can approve the tunic and refuse the fleece in the one decision.
--
-- Every existing request becomes exactly one line before the old columns go, so nothing is lost.
CREATE TABLE "RequestLine" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "sizeIndex" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'awaiting',
    "declineReason" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RequestLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RequestLine_requestId_idx" ON "RequestLine"("requestId");

ALTER TABLE "RequestLine" ADD CONSTRAINT "RequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequestLine" ADD CONSTRAINT "RequestLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The backfill. A line's status is the decision the request already carries: anything past
-- awaiting and not declined was approved and has been (or is being) picked, so its one line is
-- approved; a declined request's line is declined and keeps the reason the staff member was
-- given, because that reason is what the screens read from here on; anything still awaiting stays
-- awaiting. The line id is derived from the request id rather than generated, so the backfill is
-- deterministic and any line can still be traced back to the request it came from.
INSERT INTO "RequestLine" ("id", "requestId", "itemId", "sizeIndex", "qty", "status", "declineReason", "sort")
SELECT
    'rl_' || r."id",
    r."id",
    r."itemId",
    r."sizeIndex",
    r."qty",
    CASE
        WHEN r."status" = 'awaiting' THEN 'awaiting'
        WHEN r."status" = 'declined' THEN 'declined'
        ELSE 'approved'
    END,
    CASE WHEN r."status" = 'declined' THEN r."declineReason" END,
    0
FROM "Request" r;

-- Only now that every garment is safely on a line.
ALTER TABLE "Request" DROP COLUMN "itemId",
DROP COLUMN "sizeIndex",
DROP COLUMN "qty";
