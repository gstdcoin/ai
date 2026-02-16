#!/bin/bash
# GSTD Platform — Deploy script
# Usage: ./scripts/deploy-platform.sh [frontend|backend|all]

set -e
cd "$(dirname "$0")/.."

case "${1:-all}" in
  frontend)
    echo "Building frontend..."
    docker compose -f docker-compose.prod.yml build frontend --no-cache
    echo "Restarting frontend..."
    docker compose -f docker-compose.prod.yml up -d frontend --force-recreate
    ;;
  backend)
    echo "Building backend..."
    docker compose -f docker-compose.prod.yml build backend-blue backend-green --no-cache
    echo "Restarting backend..."
    docker compose -f docker-compose.prod.yml up -d backend-blue backend-green --force-recreate
    ;;
  all)
    echo "Full platform deploy..."
    docker compose -f docker-compose.prod.yml build --no-cache
    docker compose -f docker-compose.prod.yml up -d --force-recreate
    ;;
  *)
    echo "Usage: $0 [frontend|backend|all]"
    exit 1
    ;;
esac

echo "Done. Verify: curl -sk https://app.gstdtoken.com/api/v1/health"
