#!/bin/bash
# GSTD Sentinel - Autonomous Health Monitor & Recovery
# Checks backend health and restarts if necessary without human intervention
# Usage: ./sentinel.sh

# Configuration
URL="http://localhost:80/api/v1/health"
COMPOSE_FILE="/home/ubuntu/docker-compose.prod.yml"
LOG_FILE="/home/ubuntu/logs/sentinel.log"
TELEGRAM_BOT_TOKEN="8306755226:AAEfG2-BZ1Xo9hPex7-igz_WzHEscJOOk-U"
CHAT_ID="5700385228"

timestamp() {
    date "+%Y-%m-%d %H:%M:%S"
}

log() {
    echo "[$(timestamp)] $1" | tee -a "$LOG_FILE"
}

send_telegram() {
    local message="$1"
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
