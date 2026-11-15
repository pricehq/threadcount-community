-- Numbers the barcodes a room prints for garments that arrived without one.
--
-- Sits beside orderSeq, catalogSeq and requestSeq and is incremented in the same transaction that
-- binds the code, so two people labelling a rack at the same time cannot mint the same number.
ALTER TABLE "Facility" ADD COLUMN "barcodeSeq" INTEGER NOT NULL DEFAULT 0;
