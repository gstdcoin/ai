#!/bin/bash
# Automatic recovery script
# This script attempts to recover the platform if services are down

set -e

LOG_FILE="/home/ubuntu/logs/recovery.log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Auto-recovery script started ==="

# Check if containers are running
CONTAINERS=("ubuntu_postgres_1" "ubuntu_redis_1" "ubuntu_backend_1" "ubuntu_frontend_1" "nginx")
RESTART_NEEDED=false

for container in "${CONTAINERS[@]}"; do
    if ! docker ps --format "{{.Names}}" | grep -q "^${container}$"; then
        log "Container $container is not running, will restart"
        RESTART_NEEDED=true
    fi
done

if [ "$RESTART_NEEDED" = true ]; then
    log "Restarting services..."
    cd /home/ubuntu
    docker-compose up -d
    
    # Wait for services to start
    sleep 10
    
    # Check PostgreSQL health
    if ! docker exec ubuntu_postgres_1 pg_isready -U postgres >/dev/null 2>&1; then
        log "ERROR: PostgreSQL is not healthy after restart"
        
        # Check if database is corrupted
        DB_ERROR=$(docker logs ubuntu_postgres_1 2>&1 | grep -i "corrupt\|fatal\|pg_attribute" | tail -1)
        if [ -n "$DB_ERROR" ]; then
            log "Database corruption detected: $DB_ERROR"
            log "Attempting database recovery..."
            
            # Stop postgres
            docker-compose stop postgres
            
            # Try to recover using pg_resetwal (last resort)
            log "Attempting pg_resetwal recovery..."
            # Note: This is destructive and should be used carefully
            # For now, we'll just log the issue
            log "Manual intervention required for database recovery"
        fi
    else
        log "PostgreSQL is healthy"
    fi
else
    log "All containers are running"
fi

# Check if backend is responding
if ! curl -sf http://localhost/api/v1/admin/health >/dev/null 2>&1 && \
   ! curl -sfk https://localhost/api/v1/admin/health >/dev/null 2>&1; then
    log "Backend is not responding, restarting backend..."
    docker-compose restart backend
    sleep 5
fi

# Check and rebuild outdated images
log "Checking image freshness..."
if ! /home/ubuntu/scripts/check-image-freshness.sh >/dev/null 2>&1; then
    log "Outdated images detected, attempting rebuild..."
    /home/ubuntu/scripts/rebuild-frontend.sh --force >> "$LOG_FILE" 2>&1 || log "Frontend rebuild failed"
fi

log "=== Auto-recovery script completed ==="

