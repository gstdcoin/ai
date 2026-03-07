#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# GSTD Frontend — Reliable Build & Deploy Script
# Solves ALL known Next.js 16 build issues permanently.
#
# Usage: bash /home/ubuntu/scripts/deploy-frontend.sh
#
# Known issues this script handles:
#   1. NEXT_BUILD_WORKERS=0 — webpack workers hang without this
#   2. --webpack flag — Turbopack doesn't create BUILD_ID
#   3. standalone copy — static + public must be copied manually
#   4. systemd restart — graceful restart after successful build
#   5. Health check — verifies chat works after deploy
#   6. Rollback — restores previous build on failure
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

FRONTEND_DIR="/home/ubuntu/frontend"
BACKUP_DIR="/home/ubuntu/frontend/.next-backup"
SERVICE_NAME="gstd-frontend"
MAX_BUILD_RETRIES=2
HEALTH_CHECK_URL="http://localhost:3000/chat"
CHAT_API_URL="http://localhost:3000/api/chat"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; }

# ─── Step 1: Backup current working build ──────────────────────
backup_current() {
    if [ -f "$FRONTEND_DIR/.next/BUILD_ID" ]; then
        log "Backing up current working build..."
        rm -rf "$BACKUP_DIR"
        cp -a "$FRONTEND_DIR/.next" "$BACKUP_DIR"
        log "✅ Backup saved to $BACKUP_DIR"
    else
        warn "No existing BUILD_ID found, skipping backup"
    fi
}

# ─── Step 2: Build ─────────────────────────────────────────────
build_frontend() {
    local attempt=1
    
    while [ $attempt -le $MAX_BUILD_RETRIES ]; do
        log "Building frontend (attempt $attempt/$MAX_BUILD_RETRIES)..."
        
        # Free memory before build
        sync && echo 3 | sudo tee /proc/sys/vm/drop_caches > /dev/null 2>&1 || true
        
        # Clean .next but keep cache for faster rebuilds
        if [ -d "$FRONTEND_DIR/.next" ]; then
            # Keep cache, remove everything else
            local CACHE_DIR=$(mktemp -d)
            if [ -d "$FRONTEND_DIR/.next/cache" ]; then
                mv "$FRONTEND_DIR/.next/cache" "$CACHE_DIR/"
            fi
            rm -rf "$FRONTEND_DIR/.next"
            mkdir -p "$FRONTEND_DIR/.next"
            if [ -d "$CACHE_DIR/cache" ]; then
                mv "$CACHE_DIR/cache" "$FRONTEND_DIR/.next/"
            fi
            rm -rf "$CACHE_DIR"
        fi
        
        # THE BUILD COMMAND — all fixes applied:
        # NEXT_BUILD_WORKERS=0 : prevents webpack worker subprocesses from hanging
        # --webpack             : forces webpack bundler (Turbopack doesn't create BUILD_ID)
        # --max-old-space-size  : prevents OOM on 16GB servers
        cd "$FRONTEND_DIR"
        NEXT_BUILD_WORKERS=0 \
        NODE_OPTIONS="--max-old-space-size=4096" \
        npx next build --webpack 2>&1
        
        # Verify build succeeded
        if [ -f "$FRONTEND_DIR/.next/BUILD_ID" ] && [ -f "$FRONTEND_DIR/.next/build-manifest.json" ]; then
            log "✅ Build successful! BUILD_ID: $(cat "$FRONTEND_DIR/.next/BUILD_ID")"
            return 0
        fi
        
        err "Build attempt $attempt failed (no BUILD_ID generated)"
        attempt=$((attempt + 1))
        sleep 5
    done
    
    err "All build attempts failed!"
    return 1
}

# ─── Step 3: Prepare standalone ────────────────────────────────
prepare_standalone() {
    if [ ! -d "$FRONTEND_DIR/.next/standalone" ]; then
        warn "No standalone directory — using next start mode"
        return 1
    fi
    
    log "Preparing standalone server..."
    
    # Copy static assets (required for standalone)
    if [ -d "$FRONTEND_DIR/.next/static" ]; then
        mkdir -p "$FRONTEND_DIR/.next/standalone/.next"
        cp -r "$FRONTEND_DIR/.next/static" "$FRONTEND_DIR/.next/standalone/.next/static"
    fi
    
    # Copy public assets
    if [ -d "$FRONTEND_DIR/public" ]; then
        cp -r "$FRONTEND_DIR/public" "$FRONTEND_DIR/.next/standalone/public"
    fi
    
    log "✅ Standalone ready"
    return 0
}

# ─── Step 4: Configure systemd ─────────────────────────────────
configure_systemd() {
    local USE_STANDALONE=$1
    
    if [ "$USE_STANDALONE" = "true" ]; then
        log "Configuring systemd for standalone mode..."
        sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null << 'STANDALONE_SERVICE'
[Unit]
Description=GSTD Frontend (Next.js Standalone)
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/frontend/.next/standalone
EnvironmentFile=/home/ubuntu/frontend/.env
Environment="PORT=3000"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
NoNewPrivileges=true
PrivateTmp=true
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
STANDALONE_SERVICE
    else
        log "Configuring systemd for next start mode..."
        sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null << 'NEXTSTART_SERVICE'
[Unit]
Description=GSTD Frontend (Next.js)
After=network.target
Wants=network-online.target

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
NoNewPrivileges=true
PrivateTmp=true
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
NEXTSTART_SERVICE
    fi
    
    sudo systemctl daemon-reload
}

# ─── Step 5: Restart and verify ────────────────────────────────
restart_and_verify() {
    log "Restarting frontend service..."
    sudo systemctl restart "$SERVICE_NAME"
    
    # Wait for startup
    local MAX_WAIT=30
    local i=0
    while [ $i -lt $MAX_WAIT ]; do
        if systemctl is-active --quiet "$SERVICE_NAME"; then
            # Check if HTTP is responding
            local HTTP_CODE
            HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_CHECK_URL" 2>/dev/null || echo "000")
            if [ "$HTTP_CODE" = "200" ]; then
                log "✅ Frontend is live! (HTTP $HTTP_CODE after ${i}s)"
                return 0
            fi
        fi
        sleep 1
        i=$((i + 1))
    done
    
    err "Frontend failed to start within ${MAX_WAIT}s"
    journalctl -u "$SERVICE_NAME" --since "30 sec ago" --no-pager 2>&1 | tail -5
    return 1
}

# ─── Step 6: Verify chat API ──────────────────────────────────
verify_chat_api() {
    log "Verifying Chat API..."
    local RESPONSE
    RESPONSE=$(curl -s -m 30 "$CHAT_API_URL" \
        -X POST \
        -H "Content-Type: application/json" \
        -d '{"messages":[{"role":"user","content":"test"}],"model":"llama-3.1-8b","stream":false,"tier":"free"}' 2>/dev/null)
    
    if echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['choices'][0]['message']['content']" 2>/dev/null; then
        log "✅ Chat API working!"
        return 0
    else
        warn "Chat API test failed (might be rate limited, page still works)"
        return 0  # Don't fail deploy for API issues — page is accessible
    fi
}

# ─── Step 7: Rollback on failure ──────────────────────────────
rollback() {
    if [ -d "$BACKUP_DIR" ] && [ -f "$BACKUP_DIR/BUILD_ID" ]; then
        err "Rolling back to previous build..."
        rm -rf "$FRONTEND_DIR/.next"
        cp -a "$BACKUP_DIR" "$FRONTEND_DIR/.next"
        
        # Re-prepare standalone
        if [ -d "$FRONTEND_DIR/.next/standalone" ]; then
            prepare_standalone
            configure_systemd "true"
        else
            configure_systemd "false"
        fi
        
        sudo systemctl restart "$SERVICE_NAME"
        sleep 5
        
        if curl -s -o /dev/null -w "%{http_code}" "$HEALTH_CHECK_URL" 2>/dev/null | grep -q "200"; then
            warn "Rollback successful — previous build restored"
        else
            err "CRITICAL: Rollback also failed!"
        fi
    else
        err "No backup available for rollback!"
    fi
}

# ─── Main ──────────────────────────────────────────────────────
main() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  🚀 GSTD Frontend Deploy Script                  ${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
    echo ""
    
    local START_TIME=$(date +%s)
    
    # Step 1: Backup
    backup_current
    
    # Step 2: Build
    if ! build_frontend; then
        rollback
        exit 1
    fi
    
    # Step 3: Prepare standalone
    local USE_STANDALONE="false"
    if prepare_standalone; then
        USE_STANDALONE="true"
    fi
    
    # Step 4: Configure systemd
    configure_systemd "$USE_STANDALONE"
    
    # Step 5: Restart and verify
    if ! restart_and_verify; then
        rollback
        exit 1
    fi
    
    # Step 6: Verify chat API
    verify_chat_api
    
    local ELAPSED=$(( $(date +%s) - START_TIME ))
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  ✅ Deploy complete in ${ELAPSED}s                ${NC}"
    echo -e "${GREEN}  BUILD_ID: $(cat "$FRONTEND_DIR/.next/BUILD_ID")  ${NC}"
    echo -e "${GREEN}  Mode: $([ "$USE_STANDALONE" = "true" ] && echo "standalone" || echo "next start") ${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
    echo ""
}

main "$@"
