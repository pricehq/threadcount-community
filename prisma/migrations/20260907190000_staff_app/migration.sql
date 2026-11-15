-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "managerId" TEXT,
ADD COLUMN     "wardDesk" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "raisedByStaffId" TEXT,
    "raisedByUserId" TEXT,
    "raisedByName" TEXT NOT NULL DEFAULT '',
    "itemId" TEXT NOT NULL,
    "sizeIndex" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'awaiting',
    "managerId" TEXT,
    "managerName" TEXT NOT NULL DEFAULT '',
    "decidedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "route" TEXT,
    "collectCode" TEXT,
    "holdUntil" TEXT NOT NULL DEFAULT '',
    "signerName" TEXT,
    "signerRole" TEXT,
    "signedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "meta" TEXT NOT NULL DEFAULT '',
    "actorName" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestMessage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fromStaff" BOOLEAN NOT NULL,
    "authorName" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "sizeIndex" INTEGER NOT NULL,
    "offeredAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitCheck" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "dueBy" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openedBy" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "KitCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitCheckAnswer" (
    "id" TEXT NOT NULL,
    "kitCheckId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "sizeIndex" INTEGER NOT NULL,
    "onRecord" INTEGER NOT NULL,
    "confirmed" INTEGER NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KitCheckAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DamageReport" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "issueId" TEXT,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "photoId" TEXT,
    "requestId" TEXT,
    "handedInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DamageReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinenNotice" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "startsAt" TEXT NOT NULL DEFAULT '',
    "endsAt" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinenNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Request_facilityId_status_idx" ON "Request"("facilityId", "status");

-- CreateIndex
CREATE INDEX "Request_subjectId_idx" ON "Request"("subjectId");

-- CreateIndex
CREATE INDEX "Request_managerId_idx" ON "Request"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "Request_facilityId_code_key" ON "Request"("facilityId", "code");

-- CreateIndex
CREATE INDEX "RequestEvent_requestId_idx" ON "RequestEvent"("requestId");

-- CreateIndex
CREATE INDEX "RequestMessage_requestId_idx" ON "RequestMessage"("requestId");

-- CreateIndex
CREATE INDEX "WaitlistEntry_facilityId_itemId_sizeIndex_idx" ON "WaitlistEntry"("facilityId", "itemId", "sizeIndex");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_staffId_itemId_sizeIndex_key" ON "WaitlistEntry"("staffId", "itemId", "sizeIndex");

-- CreateIndex
CREATE INDEX "KitCheck_facilityId_idx" ON "KitCheck"("facilityId");

-- CreateIndex
CREATE INDEX "KitCheckAnswer_kitCheckId_staffId_idx" ON "KitCheckAnswer"("kitCheckId", "staffId");

-- CreateIndex
CREATE UNIQUE INDEX "KitCheckAnswer_kitCheckId_staffId_itemId_sizeIndex_key" ON "KitCheckAnswer"("kitCheckId", "staffId", "itemId", "sizeIndex");

-- CreateIndex
CREATE INDEX "DamageReport_facilityId_idx" ON "DamageReport"("facilityId");

-- CreateIndex
CREATE INDEX "DamageReport_staffId_idx" ON "DamageReport"("staffId");

-- CreateIndex
CREATE INDEX "LinenNotice_facilityId_idx" ON "LinenNotice"("facilityId");

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_raisedByStaffId_fkey" FOREIGN KEY ("raisedByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_raisedByUserId_fkey" FOREIGN KEY ("raisedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestMessage" ADD CONSTRAINT "RequestMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitCheck" ADD CONSTRAINT "KitCheck_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitCheckAnswer" ADD CONSTRAINT "KitCheckAnswer_kitCheckId_fkey" FOREIGN KEY ("kitCheckId") REFERENCES "KitCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitCheckAnswer" ADD CONSTRAINT "KitCheckAnswer_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitCheckAnswer" ADD CONSTRAINT "KitCheckAnswer_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinenNotice" ADD CONSTRAINT "LinenNotice_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

