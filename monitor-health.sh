#!/bin/bash
# GSTD Platform - Health Monitor & Auto-Recovery Script
# Version: 1.0.0 (2026-01-18)
#
# This script monitors platform health and automatically restarts failed services.
# Run via cron: */5 * * * * /home/ubuntu/monitor-health.sh >> /home/ubuntu/logs/monitor.log 2>&1

COMPOSE_FILE="/home/ubuntu/docker-compose.prod.yml"
LOG_DIR="/home/ubuntu/logs"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Colors (only for terminal output)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    NC=''
fi

log() {
    echo "[$TIMESTAMP] $1"
}

# Check if a service is running and healthy
check_service() {
    local service_name=$1
    local container_pattern=$2
    
    # Check if container exists and is running
    local status=$(docker ps --filter "name=$container_pattern" --format "{{.Status}}" | head -1)
    
    if [ -z "$status" ]; then
        return 1  # Container not found
    elif echo "$status" | grep -q "Up"; then
        if echo "$status" | grep -q "healthy"; then
            return 0  # Healthy
        elif echo "$status" | grep -q "unhealthy"; then
            return 2  # Unhealthy but running
        else
            return 0  # Running (no health check)
        fi
    else
        return 1  # Not running
    fi
}

# Restart a specific service
restart_service() {
    local service=$1
    log "⚠️ Restarting $service..."
    cd /home/ubuntu
    docker compose -f $COMPOSE_FILE restart $service
    sleep 10
}

# Main health check — ORDER MATTERS: postgres/redis first (backend depends on them)
ISSUES_FOUND=0
BACKEND_RESTARTED=0

# 1. Check postgres FIRST — backend cannot start without it
if ! check_service "postgres" "gstd_postgres_prod"; then
    log "❌ PostgreSQL is down!"
    cd /home/ubuntu
    docker compose -f $COMPOSE_FILE up -d postgres
    sleep 15
    ISSUES_FOUND=1
fi

# 2. Check redis — backend cannot start without it
if ! check_service "redis" "gstd_redis_prod"; then
    log "❌ Redis is down!"
    cd /home/ubuntu
    docker compose -f $COMPOSE_FILE up -d redis
    sleep 10
    ISSUES_FOUND=1
fi

# 3. If we just started postgres/redis, wait for healthy then restart backend
if [ "$ISSUES_FOUND" -eq 1 ]; then
    for i in 1 2 3 4 5; do
        if check_service "postgres" "gstd_postgres_prod" && check_service "redis" "gstd_redis_prod"; then
            log "✅ Postgres & Redis healthy, restarting backend..."
            cd /home/ubuntu
            docker compose -f $COMPOSE_FILE restart backend-blue backend-green
            sleep 20
            BACKEND_RESTARTED=1
            break
        fi
        sleep 5
    done
fi

# 4. Check nginx
if ! check_service "nginx" "gstd_nginx_lb"; then
    log "❌ NGINX is down!"
    restart_service "nginx-lb"
    ISSUES_FOUND=1
fi

# 5. Check backend (only after postgres/redis are up; skip if we just restarted)
if [ "$BACKEND_RESTARTED" -eq 0 ]; then
    if ! check_service "backend-blue" "backend-blue"; then
        log "❌ Backend-blue is down!"
        restart_service "backend-blue"
        ISSUES_FOUND=1
    fi

    if ! check_service "backend-green" "backend-green"; then
        log "❌ Backend-green is down!"
        restart_service "backend-green"
        ISSUES_FOUND=1
    fi
fi

# 6. Check frontend
FRONTEND_COUNT=$(docker ps --filter "name=frontend" --format "{{.Names}}" | wc -l)
if [ "$FRONTEND_COUNT" -lt 1 ]; then
    log "❌ Frontend containers are down!"
    cd /home/ubuntu
    docker compose -f $COMPOSE_FILE up -d frontend
    ISSUES_FOUND=1
fi

# API Health Check
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:80/api/v1/health 2>/dev/null || echo "000")
if [ "$API_STATUS" != "200" ]; then
    log "❌ API health check failed (HTTP $API_STATUS)"
    # Reload nginx DNS
    docker exec gstd_nginx_lb nginx -s reload 2>/dev/null || true
    ISSUES_FOUND=1
else
    if [ "$ISSUES_FOUND" -eq 0 ]; then
        log "✅ All services healthy (API: $API_STATUS)"
    fi
fi

# Frontend accessibility check
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:80/ 2>/dev/null || echo "000")
if [ "$FRONTEND_STATUS" != "200" ] && [ "$FRONTEND_STATUS" != "301" ]; then
    log "❌ Frontend check failed (HTTP $FRONTEND_STATUS)"
    # Try reloading nginx
    docker exec gstd_nginx_lb nginx -s reload 2>/dev/null || true
    ISSUES_FOUND=1
fi

# Clean up orphan containers (run once a day via separate cron)
if [ "$1" = "--cleanup" ]; then
    log "🧹 Running cleanup..."
    docker system prune -f 2>/dev/null || true
    # Remove containers with weird names (duplicates from failed deployments)
    docker ps -a --format '{{.Names}}' | grep -E '^[a-f0-9]{12}_' | xargs -r docker rm -f 2>/dev/null || true
    log "✅ Cleanup complete"
fi

exit $ISSUES_FOUND
