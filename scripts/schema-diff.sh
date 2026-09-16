#!/usr/bin/env bash
# Print the SQL that would bring the current dev database up to prisma/schema.prisma.
#
#   bash scripts/schema-diff.sh > prisma/migrations/<timestamp>_<name>/migration.sql
#
# `prisma migrate dev` is the usual way to do this, but it needs a clean shadow database and the
# local `prisma dev` server's shadow carries residue that makes it fail on the first migration.
# Diffing the live dev database against the schema needs no shadow at all.
set -eu
cd "$(dirname "$0")/.."
set -a
. ./.env
set +a
npx prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --script
