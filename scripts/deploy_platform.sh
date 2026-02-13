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

# 2. Backend
echo "[2/3] Building backend..."
if [ "$FULL_REBUILD" = true ]; then
    docker compose -f docker-compose.prod.yml build --no-cache backend-blue backend-green
else
    docker compose -f docker-compose.prod.yml build backend-blue backend-green
fi
echo "✅ Backend built"

# 3. Deploy
echo "[3/3] Deploying..."
docker compose -f docker-compose.prod.yml up -d frontend backend-blue backend-green
echo "✅ Services restarted"

# Reload nginx if exists
docker exec gstd_nginx_lb nginx -s reload 2>/dev/null || true

echo ""
echo "=========================================="
echo "✅ Изменения активированы"
echo "=========================================="
echo "Проверка: curl -s https://app.gstdtoken.com/api/v1/health | jq .status"
echo ""
