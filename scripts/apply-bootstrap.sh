#!/usr/bin/env bash
# Apply sql/bootstrap/ to local PostgreSQL (requires DATABASE_URL or PGPASSWORD).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BOOT="$ROOT/sql/bootstrap"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL, e.g.:"
  echo "  export DATABASE_URL='postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/postgres'"
  exit 1
fi

echo "Creating database teto (if missing)..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname = 'teto'" | grep -q 1 \
  || psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE teto WITH ENCODING 'UTF8' TEMPLATE template0;"

DB_URL="${DATABASE_URL%/*}/teto"
echo "Applying bootstrap to $DB_URL ..."
for f in "$BOOT"/00*.sql; do
  echo "==> $(basename "$f")"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "Done. Verify with: psql \"\$DATABASE_URL/teto\" -c \"SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';\""
