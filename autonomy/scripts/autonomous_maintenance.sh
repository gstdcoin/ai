#!/bin/bash

# GSTD Autonomous Maintenance Script
# This script checks the health of the platform and performs self-healing actions.
# It is designed to be run periodically (e.g., via cron or the autonomy bot).

LOG_FILE="/home/ubuntu/logs/autonomy_maintenance.log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_container() {
    local container_name=$1
    if ! docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
        log "⚠️ Container $container_name is NOT running. Attempting restart..."
        docker restart "$container_name"
        sleep 5
        if docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
            log "✅ Container $container_name restarted successfully."
        else
            log "❌ Failed to restart $container_name."
            return 1
        fi
    else
        # Check health status
        local health_status=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null)
        if [ "$health_status" == "unhealthy" ]; then
            log "⚠️ Container $container_name is UNHEALTHY. Restarting..."
            docker restart "$container_name"
        fi
    fi
    return 0
}

check_api() {
    local url=$1
    local status_code=$(curl -o /dev/null -s -w "%{http_code}\n" "$url")
    if [ "$status_code" != "200" ]; then
        log "⚠️ API Endpoint $url returned $status_code. potential issue."
        return 1
    fi
    return 0
}

log "🔍 Starting Autonomous Maintenance Check..."

# 1. Check Core Infrastructure
check_container "gstd_postgres_prod"
check_container "gstd_redis_prod"
check_container "gstd_nginx_lb"

# 2. Check Backend Services
check_container "ubuntu-backend-blue-1"
# If we are using blue-green, one might be down, but usually one should be up. 
# For now, we check if at least one backend is responsive via Nginx.

if ! check_api "http://127.0.0.1/api/v1/health"; then
    log "🔴 System Health Check Failed via Load Balancer."
    # Attempt to restart Nginx first
    docker restart gstd_nginx_lb
    sleep 5
    if ! check_api "http://127.0.0.1/api/v1/health"; then
        log "🔴 System still down. Restarting Backends..."
        docker restart ubuntu-backend-blue-1
        docker restart ubuntu-backend-green-1
    fi
else
    log "✅ System Health API is operational."
fi

# 3. Bot Status Check
check_container "gstd_bot"

# 4. Log Maintenance
clean_logs() {
    log "🧹 Checking log sizes..."
    # Find docker logs > 1GB and truncate them
    find /var/lib/docker/containers/ -type f -name "*.log" -size +1G -exec sh -c 'echo "Truncating large log: {}"; > {}' \;
}
clean_logs

# 5. Database Maintenance (Autonomy)
# Run vacuum if needed (simplified) - avoid running in transaction block issues
# docker exec gstd_postgres_prod psql -U postgres -d distributed_computing -c "VACUUM ANALYZE tasks;" 2>/dev/null

log "✅ Maintenance Cycle Complete."
