#!/bin/bash
# Automatic rebuild script - checks and rebuilds outdated images

set -e

LOG_FILE="/home/ubuntu/logs/auto-rebuild.log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Auto-rebuild script started ==="

cd /home/ubuntu

# Check frontend
FRONTEND_NEEDS_REBUILD=false
if [ -f "/home/ubuntu/frontend/package.json" ]; then
    FRONTEND_IMAGE_DATE=$(docker inspect ubuntu_frontend:latest --format='{{.Created}}' 2>/dev/null | cut -d'T' -f1 || echo "1970-01-01")
    LATEST_FRONTEND_CODE=$(find frontend/src frontend/package.json -type f 2>/dev/null | xargs stat -c "%Y" 2>/dev/null | sort -rn | head -1)
    
    if [ -n "$LATEST_FRONTEND_CODE" ]; then
        LATEST_FRONTEND_DATE=$(date -d "@$LATEST_FRONTEND_CODE" +%Y-%m-%d 2>/dev/null || echo "1970-01-01")
        
        if [ "$LATEST_FRONTEND_DATE" \> "$FRONTEND_IMAGE_DATE" ]; then
            log "Frontend code is newer than image ($LATEST_FRONTEND_DATE > $FRONTEND_IMAGE_DATE)"
            FRONTEND_NEEDS_REBUILD=true
        fi
    fi
fi

# Check backend
BACKEND_NEEDS_REBUILD=false
if [ -f "/home/ubuntu/backend/go.mod" ]; then
    BACKEND_IMAGE_DATE=$(docker inspect ubuntu_backend:latest --format='{{.Created}}' 2>/dev/null | cut -d'T' -f1 || echo "1970-01-01")
    LATEST_BACKEND_CODE=$(find backend -type f -name "*.go" -o -name "go.mod" 2>/dev/null | xargs stat -c "%Y" 2>/dev/null | sort -rn | head -1)
    
    if [ -n "$LATEST_BACKEND_CODE" ]; then
        LATEST_BACKEND_DATE=$(date -d "@$LATEST_BACKEND_CODE" +%Y-%m-%d 2>/dev/null || echo "1970-01-01")
        
        if [ "$LATEST_BACKEND_DATE" \> "$BACKEND_IMAGE_DATE" ]; then
            log "Backend code is newer than image ($LATEST_BACKEND_DATE > $BACKEND_IMAGE_DATE)"
            BACKEND_NEEDS_REBUILD=true
        fi
    fi
fi

# Rebuild if needed
if [ "$FRONTEND_NEEDS_REBUILD" = true ]; then
    log "Rebuilding frontend..."
    /home/ubuntu/scripts/rebuild-frontend.sh --force >> "$LOG_FILE" 2>&1
    if [ $? -eq 0 ]; then
        log "Frontend rebuilt successfully"
    else
        log "ERROR: Frontend rebuild failed"
    fi
fi

if [ "$BACKEND_NEEDS_REBUILD" = true ]; then
    log "Rebuilding backend..."
    docker-compose build backend >> "$LOG_FILE" 2>&1
    docker-compose up -d backend >> "$LOG_FILE" 2>&1
    if [ $? -eq 0 ]; then
        log "Backend rebuilt successfully"
    else
        log "ERROR: Backend rebuild failed"
    fi
fi

if [ "$FRONTEND_NEEDS_REBUILD" = false ] && [ "$BACKEND_NEEDS_REBUILD" = false ]; then
    log "All images are up to date"
fi

log "=== Auto-rebuild script completed ==="


