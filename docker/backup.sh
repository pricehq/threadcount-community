#!/usr/bin/env bash
# A backup of a Community edition: the database as a custom-format dump plus the photographs, into
# one directory per run. Run it from the checkout (it uses docker compose), from cron, nightly.
#
#   docker/backup.sh /srv/backups/threadcount
#
# Restore: docs/self-hosting.md, "Restoring".
set -euo pipefail
DEST=${1:?destination directory}
STAMP=$(date +%Y-%m-%d-%H%M%S)
OUT="$DEST/$STAMP"
mkdir -p "$OUT"
docker compose exec -T db pg_dump -U threadcount -d threadcount -Fc > "$OUT/threadcount.dump"
docker compose cp app:/data/photos "$OUT/photos" >/dev/null 2>&1 || mkdir -p "$OUT/photos"
tar -C "$OUT" -czf "$OUT/photos.tgz" photos && rm -rf "$OUT/photos"
# Keep 14 runs.
ls -1d "$DEST"/*/ 2>/dev/null | sort | head -n -14 | xargs -r rm -rf
echo "backup ok: $OUT ($(du -sh "$OUT" | cut -f1))"
