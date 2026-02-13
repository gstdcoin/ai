#!/bin/bash

# GSTD Self-Healing Loop v2.0
# "The Sentinel"
# Checks system health and performs restarts if critical services fail.

TARGET_CONTAINER="ubuntu-backend-blue-1"
HEALTH_URL="http://localhost:8080/api/v1/health"
LOG_FILE="/var/log/gstd/sentinel.log"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-$(grep '^TELEGRAM_BOT_TOKEN=' /home/ubuntu/.env 2>/dev/null | cut -d= -f2-)}"
ADMIN_ID="${TELEGRAM_CHAT_ID:-$(grep '^TELEGRAM_CHAT_ID=' /home/ubuntu/.env 2>/dev/null | cut -d= -f2-)}"

# Ensure log dir exists
mkdir -p /var/log/gstd

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

notify() {
    MSG="$1"
    [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$ADMIN_ID" ] && return 0
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


# --- Sentinel 2.0 Upgrade: Resource Monitoring ---
check_resources() {
    # Check Docker Container Memory Usage
    # We filter for our containers and check if any is above 80% usage
    # This is a bit complex in bash without jq, so we use a simplified approach
    
    # Check Redis Memory specifically
    if [ $(command -v redis-cli) ]; then
        REDIS_MEM_USED=$(redis-cli info memory | grep used_memory_rss: | cut -d: -f2 | tr -d '\r')
        # 800MB limit (approx 838860800 bytes)
        if [ "$REDIS_MEM_USED" -gt 838860800 ]; then
             log "⚠️ Redis memory high (${REDIS_MEM_USED} bytes). Initiating safe cleanup..."
             redis-cli MEMORY PURGE
             # If extremely high, maybe flush partial? For now, PURGE is safe.
             notify "⚠️ **Sentinel**: Redis memory purge executed."
        fi
    fi
    
    # Check System Memory
    FREE_MEM_PCT=$(free | grep Mem | awk '{print $4/$2 * 100.0}')
    # If free memory < 10%
    if (( $(echo "$FREE_MEM_PCT < 10.0" | bc -l) )); then
        log "⚠️ System memory critical (Free: ${FREE_MEM_PCT}%). Clearing system caches."
        sync; echo 3 > /proc/sys/vm/drop_caches
        notify "⚠️ **Sentinel**: System cache cleared due to low memory."
    fi
}

report_status() {
    # Send hourly heartbeat if stable
    MINUTE=$(date +%M)
    if [ "$MINUTE" == "00" ]; then
        ONLINE_NODES=$(psql -U postgres -h localhost -d distributed_computing -t -c "SELECT count(*) FROM nodes WHERE status='online';" 2>/dev/null || echo "?")
        notify "✅ **System Stable**\nResources: OK\nNodes Online: ${ONLINE_NODES//[[:space:]]/}"
    fi
}

# Main Loop
log "🛡️ Sentinel v2.0 Started (Zero Failure Mode)"
notify "🛡️ **Sentinel v2.0 Active**"

while true; do
    if ! check_health; then
        restart_service
    else
        check_resources
        report_status
    fi
    sleep 60
done
