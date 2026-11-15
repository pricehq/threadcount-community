--
-- is the first thing in the product that legitimately reads every facility, and there is no
-- row-level security here — so the promise is kept by a role that CANNOT read customer content,
-- rather than by remembering not to. A future screen that queries the wrong table gets a
-- permission error, not data.
--
-- The role itself is created by hand, as postgres, before this migration reaches the box:
--
--
-- The app role cannot CREATE ROLE, but it owns every table it created, so the grants below run
-- fine under `prisma migrate deploy`. They are guarded: if the role does not exist yet, nothing
-- failure. Create the role, then run the body of this block by hand.
--
--   Facility — the three coordinator contact columns, the logo bytes, the two slip footers and the
--              separate narrow path with its own trail, never through this role.
--   User, StaffAccount — no email, no name, no password hash, no TOTP secret.
--   AuditEvent — at and op only; no userName, target, ip or userId.
--   Content tables — id and facilityId only, which is enough to count per facility and nothing
--              else. Staff also exposes `inactive` so "active staff" can be counted.
--   Child tables with no facilityId (request lines, messages, receipts, kit-check answers…) — nothing.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_ro') THEN
    RAISE NOTICE 'ops_ro does not exist — grants skipped; create the role, then apply this block by hand';
    RETURN;
  END IF;

  GRANT USAGE ON SCHEMA public TO ops_ro;

  -- The facility, minus its contacts and its prose.
  GRANT SELECT (
    "id", "name", "timezone", "defaultEntitlement", "initialSets", "capSets", "defaultReorder",
    "exceptionHigh", "varianceReason", "glAccount", "journalDesc", "lastBackup", "barcodeLookup",
    "staffGroups", "nursingGroups", "kitGroups", "orderSeq", "catalogSeq", "requestSeq", "rev",
    "barcodeSeq", "slipOrg", "isDemo", "demoResetAt", "createdAt"
  ) ON "Facility" TO ops_ro;

  -- Accounts: enough to count and to date, never to identify.
  GRANT SELECT ("id", "facilityId", "role", "inactive", "createdAt", "totpEnabledAt") ON "User" TO ops_ro;
  GRANT SELECT ("id", "facilityId", "staffId", "createdAt", "lastSeenAt") ON "StaffAccount" TO ops_ro;

  GRANT SELECT ("id", "facilityId", "at", "op") ON "AuditEvent" TO ops_ro;

  -- Content tables: count-only.
  GRANT SELECT ("id", "facilityId", "inactive") ON "Staff" TO ops_ro;
  GRANT SELECT ("id", "facilityId") ON "Issue" TO ops_ro;
  GRANT SELECT ("id", "facilityId") ON "CatalogItem" TO ops_ro;
  GRANT SELECT ("id", "facilityId") ON "Order" TO ops_ro;
  GRANT SELECT ("id", "facilityId") ON "Request" TO ops_ro;
  GRANT SELECT ("id", "facilityId") ON "Pickup" TO ops_ro;
  GRANT SELECT ("id", "facilityId") ON "Stocktake" TO ops_ro;
  GRANT SELECT ("id", "facilityId") ON "HandIn" TO ops_ro;
  GRANT SELECT ("id", "facilityId") ON "Photo" TO ops_ro;
  GRANT SELECT ("id", "facilityId") ON "Barcode" TO ops_ro;
  GRANT SELECT ("id", "facilityId") ON "Location" TO ops_ro;
  GRANT SELECT ("id", "facilityId") ON "StockLevel" TO ops_ro;
  GRANT SELECT ("id", "facilityId") ON "StockMove" TO ops_ro;
  GRANT SELECT ("id", "facilityId") ON "Department" TO ops_ro;
  GRANT SELECT ("id", "facilityId") ON "Supplier" TO ops_ro;
  GRANT SELECT ("id", "facilityId") ON "Approval" TO ops_ro;
  GRANT SELECT ("id", "facilityId") ON "Alteration" TO ops_ro;
  GRANT SELECT ("id", "facilityId") ON "CostChange" TO ops_ro;
  GRANT SELECT ("id", "facilityId") ON "WaitlistEntry" TO ops_ro;
  GRANT SELECT ("id", "facilityId") ON "KitCheck" TO ops_ro;
  GRANT SELECT ("id", "facilityId") ON "DamageReport" TO ops_ro;
  GRANT SELECT ("id", "facilityId") ON "RecordDispute" TO ops_ro;
  GRANT SELECT ("id", "facilityId") ON "LinenNotice" TO ops_ro;

  GRANT SELECT ON "ContactMessage" TO ops_ro;

  -- Applied-migrations, for the drift tile: what the database has against what the repo ships.
  GRANT SELECT ON "_prisma_migrations" TO ops_ro;
END $$;
