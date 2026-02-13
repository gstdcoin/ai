#!/bin/bash
# GSTD Platform — Активация изменений на платформе
# Запускает пересборку и перезапуск frontend + backend
# Использование: ./scripts/deploy_platform.sh [--full]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

FULL_REBUILD=false
[ "$1" = "--full" ] && FULL_REBUILD=true

echo "=========================================="
echo "GSTD Platform — Активация изменений"
echo "=========================================="
echo "Full rebuild: $FULL_REBUILD"
echo ""

# 1. Frontend
echo "[1/3] Building frontend..."
cd frontend
if [ "$FULL_REBUILD" = true ]; then
    npm ci && npm run build
else
    npm run build
fi
cd ..
echo "✅ Frontend built"

# 2. Docker images (frontend + backend)
echo "[2/3] Building Docker images..."
if [ "$FULL_REBUILD" = true ]; then
    docker compose -f docker-compose.prod.yml build --no-cache frontend backend-blue backend-green
else
    docker compose -f docker-compose.prod.yml build frontend backend-blue backend-green
fi
echo "✅ Docker images built"

# 3. Deploy
echo "[3/3] Deploying..."
docker compose -f docker-compose.prod.yml up -d --force-recreate frontend backend-blue backend-green
echo "✅ Services restarted"

# 4. Absolute Point: Auto-Scale at 80% load (Docker Swarm / Compose scale)
# Check backend CPU/memory; if >80%, scale up replicas
AUTO_SCALE_ENABLED="${AUTO_SCALE_ENABLED:-true}"
if [ "$AUTO_SCALE_ENABLED" = "true" ]; then
  echo "[4/4] Auto-Scale check..."
  LOAD_PCT=0
  if command -v docker &>/dev/null; then
    # Use docker stats (non-blocking) to estimate load
    STATS=$(docker stats --no-stream --format "{{.CPUPerc}}" backend-blue backend-green 2>/dev/null | head -2)
    for pct in $STATS; do
      val=$(echo "$pct" | tr -d '%' | cut -d. -f1)
      [ -n "$val" ] && [ "$val" -gt "$LOAD_PCT" ] 2>/dev/null && LOAD_PCT=$val
    done
  fi
  if [ "$LOAD_PCT" -ge 80 ] 2>/dev/null; then
    echo "   ⚡ Load ~${LOAD_PCT}% — scaling backend replicas..."
    docker compose -f docker-compose.prod.yml up -d --scale backend-blue=2 --scale backend-green=2 2>/dev/null || true
    echo "   ✅ Scaled to 2 replicas per backend"
  else
    echo "   ✓ Load OK (~${LOAD_PCT:-0}%), no scale needed"
  fi
fi

# Reload nginx if exists
docker exec gstd_nginx_lb nginx -s reload 2>/dev/null || true

echo ""
echo "=========================================="
echo "✅ Изменения активированы"
echo "=========================================="
echo "Проверка: curl -s https://app.gstdtoken.com/api/v1/health | jq .status"
echo ""
