#!/bin/bash
# Ensure full platform stack is running (postgres, redis, backend, frontend, nginx)
# Call this after reboot or when platform is unreachable
set -e
cd "$(dirname "$0")/.."

echo "Ensuring Postgres & Redis..."
docker compose -f docker-compose.prod.yml up -d postgres redis
sleep 15

echo "Ensuring Backend..."
docker compose -f docker-compose.prod.yml up -d backend-blue backend-green
sleep 20

echo "Ensuring Frontend & Nginx..."
docker compose -f docker-compose.prod.yml up -d frontend nginx-lb

echo "Waiting for API..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost/api/v1/health | grep -q 200; then
    echo "✅ Platform is up (API: 200)"
    exit 0
  fi
  sleep 5
done
echo "⚠️ API not responding after 50s — check: docker compose -f docker-compose.prod.yml ps -a"
exit 1
