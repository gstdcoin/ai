#!/bin/bash
# Start host backend (for nginx proxy to 127.0.0.1:8080)
# Requires: Docker postgres and redis running (get IPs from docker inspect)
set -e
cd "$(dirname "$0")/.."

# Get Docker container IPs
PG_IP=$(docker inspect gstd_postgres_prod --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null || echo "172.18.0.2")
REDIS_IP=$(docker inspect gstd_redis_prod --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null || echo "172.18.0.5")

[ -f .env ] && set -a && source .env && set +a
export DB_HOST="${DB_HOST:-$PG_IP}"
export REDIS_HOST="${REDIS_HOST:-$REDIS_IP}"

cd backend
pkill -f "backend/server" 2>/dev/null || true
sleep 2
nohup ./server >> /tmp/backend.log 2>&1 &
echo "Backend starting (PID $!). Wait ~10s then: curl http://127.0.0.1:8080/api/v1/health"
