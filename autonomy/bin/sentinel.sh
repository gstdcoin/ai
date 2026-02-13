#!/bin/bash
# GSTD Sentinel - Autonomous Health Monitor & Recovery
# Checks backend health and restarts if necessary without human intervention
# Usage: ./sentinel.sh

# Configuration
URL="http://localhost:80/api/v1/health"
COMPOSE_FILE="/home/ubuntu/docker-compose.prod.yml"
LOG_FILE="/home/ubuntu/logs/sentinel.log"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-$(grep '^TELEGRAM_BOT_TOKEN=' /home/ubuntu/.env 2>/dev/null | cut -d= -f2-)}"
CHAT_ID="${TELEGRAM_CHAT_ID:-$(grep '^TELEGRAM_CHAT_ID=' /home/ubuntu/.env 2>/dev/null | cut -d= -f2-)}"

timestamp() {
    date "+%Y-%m-%d %H:%M:%S"
}

log() {
    echo "[$(timestamp)] $1" | tee -a "$LOG_FILE"
}

send_telegram() {
    local message="$1"
    [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$CHAT_ID" ] && return 0
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -d chat_id="${CHAT_ID}" \
        -d text="${message}" > /dev/null
}

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Check Health
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$URL")

if [ "$HTTP_CODE" == "200" ]; then
    # Health OK - silent success
    exit 0
else
    log "❌ CRITICAL: Backend returned HTTP $HTTP_CODE"
    
    # Send alert
    send_telegram "⚠️ GSTD Sentinel Alert: Backend returned HTTP $HTTP_CODE. Initiating autonomous recovery..."
    
    # Restart Backend
    log "Restarting backend services..."
    cd /home/ubuntu
    docker compose -f "$COMPOSE_FILE" restart backend-blue backend-green nginx-lb
    
    # Wait for recovery
    sleep 30
    
    # Verify Recovery
    RECOVERY_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$URL")
    
    if [ "$RECOVERY_CODE" == "200" ]; then
        log "✅ Recovery successful"
        send_telegram "✅ GSTD Sentinel: System successfully recovered. Health check passed."
    else
        log "❌ Recovery failed (HTTP $RECOVERY_CODE)"
        send_telegram "❌ GSTD Sentinel: Recovery FAILED! Manual intervention required."
    fi
fi

# Check Bot Health
BOT_STATUS=$(docker inspect -f '{{.State.Status}}' gstd_bot 2>/dev/null)

if [ "$BOT_STATUS" != "running" ]; then
    log "⚠️ ALERT: Bot container is $BOT_STATUS. Restarting..."
    docker restart gstd_bot
    send_telegram "🤖 GSTD Sentinel: Bot was down. Autonomous restart triggered."
fi

# 🛡️ File Integrity Check (Zero Trust)
CRITICAL_FILE="/home/ubuntu/backend/internal/api/routes.go"
# Known good hash (This should be updated on deploy, for now we check if file exists and size > 0)
if [ -s "$CRITICAL_FILE" ]; then
    # In a real scenario, we would compare against a stored hash
    # CURRENT_HASH=$(md5sum "$CRITICAL_FILE" | awk '{print $1}')
    # if [ "$CURRENT_HASH" != "$KNOWN_HASH" ]; then send_telegram "🚨 SECURITY ALERT: Core file modified!"; fi
    : # pass
else
    send_telegram "🚨 CRITICAL: Core system file missing!"
fi
