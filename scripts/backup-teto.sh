#!/usr/bin/env bash
# Daily backup for local teto database.
set -euo pipefail
BACKUP_DIR="${HOME}/backups"
mkdir -p "$BACKUP_DIR"
DB_URL="${DATABASE_URL:-postgresql://postgres@127.0.0.1:5432/teto}"
STAMP="$(date +%F)"
OUT="$BACKUP_DIR/teto_${STAMP}.dump"
pg_dump "$DB_URL" -F c -f "$OUT"
echo "Backup written to $OUT"
