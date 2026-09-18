-- The plan, billing, card-payment and multi-facility organisation layer is gone from the software:
-- ThreadCount is free, self-hosted, and every facility stands on its own. These columns and tables
-- were kept only so an upgrade needed no destructive migration; nothing has read them since
-- 2026-09-17. Take a backup before upgrading if you want a copy of what they held.
-- DropForeignKey
ALTER TABLE "Facility" DROP CONSTRAINT "Facility_orgId_fkey";

-- DropForeignKey
ALTER TABLE "OrgCatalogItem" DROP CONSTRAINT "OrgCatalogItem_orgId_fkey";

-- DropForeignKey
ALTER TABLE "OrgEvent" DROP CONSTRAINT "OrgEvent_orgId_fkey";

-- DropForeignKey
ALTER TABLE "OrgEvent" DROP CONSTRAINT "OrgEvent_userId_fkey";

-- DropForeignKey
ALTER TABLE "OrgSupplier" DROP CONSTRAINT "OrgSupplier_orgId_fkey";

-- DropForeignKey
ALTER TABLE "OrgUser" DROP CONSTRAINT "OrgUser_orgId_fkey";

-- DropForeignKey
ALTER TABLE "PlanMail" DROP CONSTRAINT "PlanMail_facilityId_fkey";

-- DropIndex
DROP INDEX "Facility_orgId_idx";

-- AlterTable
ALTER TABLE "Facility" DROP COLUMN "agreedPrivacyAt",
DROP COLUMN "agreedSlaAt",
DROP COLUMN "agreedTermsAt",
DROP COLUMN "agreedVersion",
DROP COLUMN "billingAddress",
DROP COLUMN "billingCadence",
DROP COLUMN "billingCountry",
DROP COLUMN "billingEmail",
DROP COLUMN "billingLegalName",
DROP COLUMN "billingTaxId",
DROP COLUMN "grandfathered",
DROP COLUMN "orgId",
DROP COLUMN "paidUntil",
DROP COLUMN "plan",
DROP COLUMN "planNote",
DROP COLUMN "planStatus",
DROP COLUMN "stripeCustomerId",
DROP COLUMN "stripeSubscriptionId",
DROP COLUMN "trialEndsAt";

-- AlterTable
ALTER TABLE "PlatformSwitch" DROP COLUMN "plansLive";

-- DropTable
DROP TABLE "OrgCatalogItem";

-- DropTable
DROP TABLE "OrgEvent";

-- DropTable
DROP TABLE "OrgSupplier";

-- DropTable
DROP TABLE "OrgUser";

-- DropTable
DROP TABLE "Organisation";

-- DropTable
DROP TABLE "PlanMail";

