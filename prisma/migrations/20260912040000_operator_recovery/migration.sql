-- Cascade is right here, unlike the trail: codes are a mechanism, not a record.
CREATE TABLE "OperatorRecoveryCode" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "OperatorRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperatorRecoveryCode_operatorId_idx" ON "OperatorRecoveryCode"("operatorId");

ALTER TABLE "OperatorRecoveryCode" ADD CONSTRAINT "OperatorRecoveryCode_operatorId_fkey"
    FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
