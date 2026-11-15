-- administration of a hosted service that no longer exists. Nothing reads these tables.
-- DropForeignKey
ALTER TABLE "OperatorEvent" DROP CONSTRAINT "OperatorEvent_operatorId_fkey";

-- DropForeignKey
ALTER TABLE "OperatorRecoveryCode" DROP CONSTRAINT "OperatorRecoveryCode_operatorId_fkey";

-- DropForeignKey
ALTER TABLE "RevealGrant" DROP CONSTRAINT "RevealGrant_operatorId_fkey";

-- DropTable
DROP TABLE "ContactMessage";

-- DropTable
DROP TABLE "Operator";

-- DropTable
DROP TABLE "OperatorEvent";

-- DropTable
DROP TABLE "OperatorRecoveryCode";

-- DropTable
DROP TABLE "RevealGrant";

-- DropEnum
DROP TYPE "OperatorRole";

