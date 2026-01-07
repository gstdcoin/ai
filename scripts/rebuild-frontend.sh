#!/bin/bash
# Rebuild frontend container with latest code

set -e

echo "🔄 Rebuilding Frontend Container..."
echo "===================================="

cd /home/ubuntu

# Check if code was modified after last build
FRONTEND_IMAGE_DATE=$(docker inspect ubuntu_frontend:latest --format='{{.Created}}' 2>/dev/null | cut -d'T' -f1 || echo "1970-01-01")
LATEST_CODE_DATE=$(find frontend/src -type f -name "*.tsx" -o -name "*.ts" -o -name "*.json" | xargs stat -c "%Y" 2>/dev/null | sort -rn | head -1)

if [ -n "$LATEST_CODE_DATE" ]; then
    LATEST_CODE_DATE_FORMATTED=$(date -d "@$LATEST_CODE_DATE" +%Y-%m-%d 2>/dev/null || echo "1970-01-01")
    
    echo "📅 Image build date: $FRONTEND_IMAGE_DATE"
    echo "📅 Latest code change: $LATEST_CODE_DATE_FORMATTED"
    
    if [ "$LATEST_CODE_DATE_FORMATTED" \> "$FRONTEND_IMAGE_DATE" ] || [ "$1" == "--force" ]; then
        echo "🔄 Code is newer than image, rebuilding..."
        
        # Stop frontend
        docker-compose stop frontend 2>/dev/null || true
        
        # Remove old image
        docker rmi ubuntu_frontend:latest 2>/dev/null || true
        
        # Build new image
        echo "🏗️  Building new frontend image..."
        docker-compose build --no-cache frontend
        
        # Start frontend
        echo "🚀 Starting new frontend container..."
        docker-compose up -d frontend
        
        echo "✅ Frontend rebuilt and restarted!"
        
        # Wait for health check
        echo "⏳ Waiting for frontend to be ready..."
        sleep 10
        
        # Check if frontend is running
        if docker ps | grep -q ubuntu_frontend; then
            echo "✅ Frontend is running"
        else
            echo "❌ Frontend failed to start"
            docker logs ubuntu_frontend_1 --tail 20
            exit 1
        fi
    else
        echo "✅ Image is up to date, no rebuild needed"
    fi
else
    echo "⚠️  Could not determine code modification date, forcing rebuild..."
    docker-compose build --no-cache frontend
    docker-compose up -d frontend
fi

echo ""
echo "📊 Frontend status:"
docker-compose ps frontend


