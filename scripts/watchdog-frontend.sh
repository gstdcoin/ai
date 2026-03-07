#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# GSTD Frontend Watchdog — Auto-heals chat if it goes down
# Runs via cron every 5 minutes.
#
# Install: crontab -e → */5 * * * * /home/ubuntu/scripts/watchdog-frontend.sh
# ═══════════════════════════════════════════════════════════════

LOGFILE="/var/log/gstd-watchdog.log"
SERVICE="gstd-frontend"
CHAT_URL="http://localhost:3000/chat"
FRONTEND_DIR="/home/ubuntu/frontend"
MAX_RESTARTS=3
RESTART_COUNT_FILE="/tmp/gstd-watchdog-restarts"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $1" >> "$LOGFILE"; }

# Check if frontend is responding
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 10 "$CHAT_URL" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
    # Reset restart counter on success
    echo "0" > "$RESTART_COUNT_FILE"
    exit 0
fi

# Chat is DOWN
log "ALERT: Chat returned HTTP $HTTP_CODE"

# Check restart count
RESTARTS=$(cat "$RESTART_COUNT_FILE" 2>/dev/null || echo "0")
RESTARTS=$((RESTARTS + 1))
echo "$RESTARTS" > "$RESTART_COUNT_FILE"

if [ "$RESTARTS" -gt "$MAX_RESTARTS" ]; then
    log "CRITICAL: $RESTARTS failed restarts. Stopping auto-recovery."
    exit 1
fi

log "Attempting recovery #$RESTARTS..."

# Step 0: Ensure UFW allows Docker/localhost → port 3000
if ! sudo ufw status 2>/dev/null | grep -q "3000.*172.18"; then
    log "UFW: Adding Docker access to port 3000"
    sudo ufw allow from 172.17.0.0/16 to any port 3000 comment "Frontend Docker" 2>/dev/null
    sudo ufw allow from 172.18.0.0/16 to any port 3000 comment "Frontend gstd" 2>/dev/null
    sudo ufw allow from 127.0.0.0/8 to any port 3000 comment "Frontend localhost" 2>/dev/null
fi

# Step 1: Try simple restart
sudo systemctl restart "$SERVICE"
sleep 10

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 10 "$CHAT_URL" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    log "RECOVERED: Simple restart worked (HTTP $HTTP_CODE)"
    echo "0" > "$RESTART_COUNT_FILE"
    exit 0
fi

# Step 2: Check if BUILD_ID exists, if not rebuild
if [ ! -f "$FRONTEND_DIR/.next/BUILD_ID" ]; then
    log "BUILD_ID missing. Running full rebuild..."
    bash /home/ubuntu/scripts/deploy-frontend.sh >> "$LOGFILE" 2>&1
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 10 "$CHAT_URL" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        log "RECOVERED: Full rebuild worked (HTTP $HTTP_CODE)"
        echo "0" > "$RESTART_COUNT_FILE"
        exit 0
    fi
fi

# Step 3: Check if standalone exists
if [ ! -f "$FRONTEND_DIR/.next/standalone/server.js" ]; then
    log "Standalone missing. Trying next start fallback..."
    
    sudo tee /etc/systemd/system/gstd-frontend.service > /dev/null << 'EOF'
[Unit]
Description=GSTD Frontend (Next.js Fallback)
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/frontend
EnvironmentFile=/home/ubuntu/frontend/.env
Environment="PORT=3000"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/npx next start -p 3000
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
    sudo systemctl restart "$SERVICE"
    sleep 10
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 10 "$CHAT_URL" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        log "RECOVERED: Fallback to next start worked (HTTP $HTTP_CODE)"
        echo "0" > "$RESTART_COUNT_FILE"
        exit 0
    fi
fi

log "FAILED: All recovery attempts exhausted for restart #$RESTARTS"
