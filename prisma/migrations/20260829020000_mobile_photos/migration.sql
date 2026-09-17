-- Mobile pack: photo attachments + delivery-round proof
CREATE TABLE "Photo" (
  "id" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "data" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Photo_facilityId_idx" ON "Photo"("facilityId");
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Approval" ADD COLUMN "photoId" TEXT;
ALTER TABLE "Receipt" ADD COLUMN "photoId" TEXT;
ALTER TABLE "Issue" ADD COLUMN "returnPhotoId" TEXT;
ALTER TABLE "Pickup" ADD COLUMN "deliveredTo" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Pickup" ADD COLUMN "sigId" TEXT;
ALTER TABLE "Pickup" ADD COLUMN "proofId" TEXT;
ALTER TABLE "Pickup" ADD COLUMN "deliveredRound" BOOLEAN NOT NULL DEFAULT false;
