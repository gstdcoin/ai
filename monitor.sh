#!/bin/bash
# Мониторинг платформы GSTD Token
# Проверяет статус всех контейнеров и перезапускает при необходимости

LOG_FILE="$HOME/gstd-monitor.log"
MAX_RESTARTS=5

log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_container() {
    local container_name=$1
    local status=$(docker inspect --format='{{.State.Status}}' "$container_name" 2>/dev/null)
    
    if [ "$status" != "running" ]; then
        log_message "WARNING: Container $container_name is not running (status: $status)"
        
        # Проверяем количество перезапусков
        local restart_count=$(docker inspect --format='{{.RestartCount}}' "$container_name" 2>/dev/null)
        if [ "$restart_count" -lt "$MAX_RESTARTS" ]; then
            log_message "Restarting container $container_name (restart count: $restart_count)"
            docker restart "$container_name" 2>&1 | tee -a "$LOG_FILE"
        else
            log_message "ERROR: Container $container_name exceeded max restarts ($MAX_RESTARTS). Manual intervention required."
        fi
        return 1
    fi
    return 0
}

# Проверка всех критических контейнеров
log_message "Starting platform health check..."

containers=("nginx" "ubuntu_backend_1" "ubuntu_frontend_1" "ubuntu_postgres_1" "ubuntu_redis_1")

all_healthy=true
for container in "${containers[@]}"; do
    if ! check_container "$container"; then
        all_healthy=false
    fi
done

if [ "$all_healthy" = true ]; then
    log_message "All containers are healthy"
    exit 0
else
    log_message "Some containers have issues"
    exit 1
fi

