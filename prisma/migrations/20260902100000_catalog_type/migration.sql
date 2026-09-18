-- Garment type (Shirt, Pants, Jacket…). Empty for existing rows, which keeps the old
-- name-regex classification in place for them until someone sets a type.
ALTER TABLE "CatalogItem" ADD COLUMN "type" TEXT NOT NULL DEFAULT '';
