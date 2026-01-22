#!/bin/bash

# GSTD Self-Healing Loop v2.0
# "The Sentinel"
# Checks system health and performs restarts if critical services fail.

TARGET_CONTAINER="ubuntu-backend-blue-1"
HEALTH_URL="http://localhost:8080/api/v1/health"
LOG_FILE="/var/log/gstd/sentinel.log"
TELEGRAM_BOT_TOKEN="8306755226:AAEfG2-BZ1Xo9hPex7-igz_WzHEscJOOk-U"
ADMIN_ID="5700385228"

# Ensure log dir exists
mkdir -p /var/log/gstd

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

notify() {
    MSG="$1"
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -d chat_id="${ADMIN_ID}" \
        -d text="${MSG}" \
        -d parse_mode="Markdown" > /dev/null
}

check_health() {
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$HEALTH_URL")
    if [ "$HTTP_CODE" == "200" ]; then
        return 0
    else
        return 1
    fi
}

restart_service() {
    log "⚠️ Critical: Backend ($TARGET_CONTAINER) is unhealthy. Restarting..."
    notify "⚠️ **Sentinel Alert**\n\nBackend is unhealthy (HTTP $HTTP_CODE). Initiating emergency restart."
    
    docker restart "$TARGET_CONTAINER"
    
    # Wait for recovery
    sleep 20
    
    if check_health; then
        log "✅ Backend recovered successfully."
        notify "✅ **Recovery Successful**\n\nBackend is back online."
    else
        log "❌ Backend failed to recover after restart."
        notify "❌ **Recovery Failed**\n\nManual intervention required. Backend is still down."
    fi
}

# Main Loop
log "🛡️ Sentinel Self-Healing Loop Started"
notify "🛡️ **Sentinel Active**\n\nMonitoring system health..."

while true; do
    if ! check_health; then
        restart_service
    fi
    sleep 60
done
