#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# GSTD Frontend Watchdog — Docker-aware auto-healing
# Runs via cron every 5 minutes.
#
# Install: crontab -e → */5 * * * * /home/ubuntu/scripts/watchdog-frontend.sh
# ═══════════════════════════════════════════════════════════════

LOGFILE="/var/log/gstd-watchdog.log"
CONTAINER="ubuntu-frontend-1"
APP_URL="https://app.gstdtoken.com"
MAX_RESTARTS=3
RESTART_COUNT_FILE="/tmp/gstd-watchdog-restarts"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $1" >> "$LOGFILE" 2>/dev/null; }

# Check if frontend is responding
HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" -m 10 "$APP_URL" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
    echo "0" > "$RESTART_COUNT_FILE"
    exit 0
fi

# Frontend is DOWN
log "ALERT: app.gstdtoken.com returned HTTP $HTTP_CODE"

# Check restart count
RESTARTS=$(cat "$RESTART_COUNT_FILE" 2>/dev/null || echo "0")
RESTARTS=$((RESTARTS + 1))
echo "$RESTARTS" > "$RESTART_COUNT_FILE"

if [ "$RESTARTS" -gt "$MAX_RESTARTS" ]; then
    log "CRITICAL: $RESTARTS failed restarts. Stopping auto-recovery."
    exit 1
fi

log "Attempting Docker recovery #$RESTARTS..."

# Check if container exists but stopped
STATE=$(docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo "missing")

if [ "$STATE" = "missing" ]; then
    log "Container missing. Running docker compose up..."
    cd /home/ubuntu && docker compose -f docker-compose.prod.yml up -d frontend 2>&1 | tail -3 >> "$LOGFILE"
elif [ "$STATE" != "running" ]; then
    log "Container state: $STATE. Restarting..."
    docker restart "$CONTAINER" >> "$LOGFILE" 2>&1
else
    log "Container running but unresponsive. Force-recreating..."
    cd /home/ubuntu && docker compose -f docker-compose.prod.yml up -d --force-recreate frontend 2>&1 | tail -3 >> "$LOGFILE"
fi

sleep 15

HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" -m 10 "$APP_URL" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    log "RECOVERED: Docker restart worked (HTTP $HTTP_CODE)"
    echo "0" > "$RESTART_COUNT_FILE"
    exit 0
fi

log "FAILED: Recovery attempt #$RESTARTS failed (HTTP $HTTP_CODE)"
