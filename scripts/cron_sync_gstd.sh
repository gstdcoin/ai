#!/bin/bash
# Cron: sync GSTD balances every 30 min
# Add to crontab: */30 * * * * /home/ubuntu/scripts/cron_sync_gstd.sh

# Load ADMIN_API_KEY from .env if not set
if [ -z "$ADMIN_API_KEY" ] && [ -f /home/ubuntu/.env ]; then
  export ADMIN_API_KEY=$(grep '^ADMIN_API_KEY=' /home/ubuntu/.env 2>/dev/null | cut -d= -f2-)
fi
API_KEY="${ADMIN_API_KEY:-gstd_system_key_2026}"
URL="${GSTD_SYNC_URL:-http://localhost/api/v1/internal/sync-gstd-balances}"

curl -sS -X POST "$URL" \
  -H "X-Admin-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  --max-time 600 \
  | logger -t gstd-sync 2>/dev/null || true
