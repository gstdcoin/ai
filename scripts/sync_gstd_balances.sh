#!/bin/bash
# Sync GSTD on-chain balances to database.
# Run from project root. Requires Docker and backend .env.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND="$PROJECT_ROOT/backend"
ENV_FILE="${ENV_FILE:-$PROJECT_ROOT/.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ .env not found at $ENV_FILE"
  exit 1
fi

# Load .env
set -a
source "$ENV_FILE"
set +a

# Ensure minimal vars - use container name when running in Docker network
DB_HOST="gstd_postgres_prod"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD}"
DB_NAME="${DB_NAME:-distributed_computing}"
GSTD_JETTON="${GSTD_JETTON_ADDRESS}"
TON_API="${TON_API_URL:-https://tonapi.io}"

if [ -z "$DB_PASSWORD" ]; then
  echo "❌ DB_PASSWORD required in .env"
  exit 1
fi

if [ -z "$GSTD_JETTON" ]; then
  echo "❌ GSTD_JETTON_ADDRESS required in .env"
  exit 1
fi

# Build static binary
echo "🔨 Building sync binary..."
cd "$BACKEND"
CGO_ENABLED=0 go build -o /tmp/sync_gstd ./cmd/sync_gstd_balances || { echo "❌ Build failed"; exit 1; }

# Resolve network from postgres container
NETWORK=$(docker inspect gstd_postgres_prod --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null | head -1)
if [ -z "$NETWORK" ]; then
  NETWORK="ubuntu_gstd_network"
  docker network inspect "$NETWORK" &>/dev/null || { echo "❌ Docker network not found. Is postgres running?"; exit 1; }
fi

echo "🔄 Starting GSTD on-chain balance sync..."
echo "   Network: $NETWORK | DB: $DB_HOST"
echo ""

docker run --rm --network "$NETWORK" \
  -e DB_HOST="$DB_HOST" \
  -e DB_PORT="$DB_PORT" \
  -e DB_USER="$DB_USER" \
  -e DB_PASSWORD="$DB_PASSWORD" \
  -e DB_NAME="$DB_NAME" \
  -e DB_SSLMODE="${DB_SSLMODE:-disable}" \
  -e GSTD_JETTON_ADDRESS="$GSTD_JETTON" \
  -e TON_API_URL="$TON_API" \
  -e TON_API_KEY="${TON_API_KEY:-}" \
  -v /tmp/sync_gstd:/sync_gstd \
  alpine:latest /sync_gstd

echo ""
echo "✅ Sync complete"
