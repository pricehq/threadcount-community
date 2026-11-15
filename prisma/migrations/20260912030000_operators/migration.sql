--
-- belongs to none, and it lives in its own table so that a missed role check on User can never
-- become platform-wide access. Nothing existing changes: three new tables and one enum.

CREATE TYPE "OperatorRole" AS ENUM ('OWNER', 'SUPPORT');

CREATE TABLE "Operator" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "OperatorRole" NOT NULL DEFAULT 'SUPPORT',
    "passwordHash" TEXT NOT NULL,
    "totpSecret" TEXT NOT NULL DEFAULT '',
    "totpEnabledAt" TIMESTAMP(3),
    "inactive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Operator_email_key" ON "Operator"("email");

-- Append-only. "facilityId" is a plain column and deliberately NOT a foreign key: AuditEvent's
-- facilityId cascades on delete, which would let a facility that closes its account erase every
CREATE TABLE "OperatorEvent" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "detail" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "OperatorEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperatorEvent_at_idx" ON "OperatorEvent"("at");
CREATE INDEX "OperatorEvent_operatorId_at_idx" ON "OperatorEvent"("operatorId", "at");
CREATE INDEX "OperatorEvent_facilityId_at_idx" ON "OperatorEvent"("facilityId", "at");

ALTER TABLE "OperatorEvent" ADD CONSTRAINT "OperatorEvent_operatorId_fkey"
    FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- than a cookie claim, so it can be revoked before it expires. Kept forever, like the trail.
CREATE TABLE "RevealGrant" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevealGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RevealGrant_operatorId_facilityId_expiresAt_idx" ON "RevealGrant"("operatorId", "facilityId", "expiresAt");

ALTER TABLE "RevealGrant" ADD CONSTRAINT "RevealGrant_operatorId_fkey"
    FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
