#!/bin/bash
# Check if Docker images are up to date with source code

set -e

echo "🔍 Checking Image Freshness"
echo "=========================="

cd /home/ubuntu

# Check Frontend
echo ""
echo "📱 Frontend:"
FRONTEND_IMAGE_DATE=$(docker inspect ubuntu_frontend:latest --format='{{.Created}}' 2>/dev/null | cut -d'T' -f1 || echo "not found")
LATEST_FRONTEND_CODE=$(find frontend/src frontend/package.json -type f 2>/dev/null | xargs stat -c "%Y" 2>/dev/null | sort -rn | head -1)

if [ -n "$LATEST_FRONTEND_CODE" ]; then
    LATEST_FRONTEND_DATE=$(date -d "@$LATEST_FRONTEND_CODE" +%Y-%m-%d 2>/dev/null || echo "unknown")
    echo "  Image date: $FRONTEND_IMAGE_DATE"
    echo "  Latest code: $LATEST_FRONTEND_DATE"
    
    if [ "$LATEST_FRONTEND_DATE" \> "$FRONTEND_IMAGE_DATE" ]; then
        echo "  ⚠️  WARNING: Code is newer than image!"
        echo "  Run: /home/ubuntu/scripts/rebuild-frontend.sh"
        exit 1
    else
        echo "  ✅ Image is up to date"
    fi
else
    echo "  ⚠️  Could not check frontend code dates"
fi

# Check Backend
echo ""
echo "⚙️  Backend:"
BACKEND_IMAGE_DATE=$(docker inspect ubuntu_backend:latest --format='{{.Created}}' 2>/dev/null | cut -d'T' -f1 || echo "not found")
LATEST_BACKEND_CODE=$(find backend -type f -name "*.go" -o -name "go.mod" 2>/dev/null | xargs stat -c "%Y" 2>/dev/null | sort -rn | head -1)

if [ -n "$LATEST_BACKEND_CODE" ]; then
    LATEST_BACKEND_DATE=$(date -d "@$LATEST_BACKEND_CODE" +%Y-%m-%d 2>/dev/null || echo "unknown")
    echo "  Image date: $BACKEND_IMAGE_DATE"
    echo "  Latest code: $LATEST_BACKEND_DATE"
    
    if [ "$LATEST_BACKEND_DATE" \> "$BACKEND_IMAGE_DATE" ]; then
        echo "  ⚠️  WARNING: Code is newer than image!"
        echo "  Run: docker-compose build backend && docker-compose up -d backend"
        exit 1
    else
        echo "  ✅ Image is up to date"
    fi
else
    echo "  ⚠️  Could not check backend code dates"
fi

echo ""
echo "✅ All images are up to date"


