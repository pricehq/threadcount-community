-- The outbound mail queue (lib/mailqueue.ts). Additive only: two new tables, nothing existing changes.

-- CreateTable
CREATE TABLE "MailJob" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "lane" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "dedupeKey" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "failReason" TEXT,
    "providerId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MailJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailQueueFlag" (
    "key" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MailQueueFlag_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "MailJob_dedupeKey_key" ON "MailJob"("dedupeKey");

-- CreateIndex
CREATE INDEX "MailJob_status_nextAttemptAt_idx" ON "MailJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "MailJob_sentAt_idx" ON "MailJob"("sentAt");
