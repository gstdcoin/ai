#!/bin/bash
# Run pending migrations on the database.
# Uses DB_* from .env or defaults for localhost.
set -e
cd "$(dirname "$0")/.."
[ -f .env ] && source .env
[ -f backend/.env ] && source backend/.env
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_USER=${DB_USER:-postgres}
DB_NAME=${DB_NAME:-distributed_computing}
export PGPASSWORD=${DB_PASSWORD:-Gstd_Secure_2026}

echo "Running migrations on $DB_HOST:$DB_PORT/$DB_NAME..."
for f in backend/migrations/v48_h3_index.sql backend/migrations/v50_add_query_id.sql backend/migrations/v51_cosmic_genesis.sql; do
  [ -f "$f" ] && psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$f" 2>/dev/null || true
done
echo "Done."
