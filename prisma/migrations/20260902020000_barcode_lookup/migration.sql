-- Opt-in public barcode lookup (off by default: garment barcode numbers only leave the server
-- once an admin turns this on).
ALTER TABLE "Facility" ADD COLUMN "barcodeLookup" BOOLEAN NOT NULL DEFAULT false;
