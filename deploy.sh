#!/bin/bash
# GSTD Platform Deployment Script

set -e

echo "🚀 GSTD Platform Deployment"
echo "============================"

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found"
    exit 1
fi

# Check SSL certificates
if [ ! -f nginx/ssl/live/app.gstdtoken.com/fullchain.pem ]; then
    echo "❌ Error: SSL certificates not found at nginx/ssl/live/app.gstdtoken.com/"
    exit 1
fi

echo "✅ Configuration files found"

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Check required variables
if [ -z "$TON_API_KEY" ]; then
    echo "⚠️  Warning: TON_API_KEY not set"
fi

if [ -z "$GSTD_JETTON_ADDRESS" ]; then
    echo "⚠️  Warning: GSTD_JETTON_ADDRESS not set"
fi

echo "📦 Building Docker images..."
docker-compose -f docker-compose.prod.yml build

echo "🔄 Starting services..."
docker-compose -f docker-compose.prod.yml up -d

echo "⏳ Waiting for services to be healthy..."
sleep 10

echo "🔍 Checking service status..."
docker-compose -f docker-compose.prod.yml ps

echo "✅ Deployment complete!"
echo ""
echo "📊 Service URLs:"
echo "   Frontend: https://app.gstdtoken.com"
echo "   API:      https://app.gstdtoken.com/api/v1/stats"
echo "   WebSocket: wss://app.gstdtoken.com/ws"
echo ""
echo "📝 View logs: docker-compose -f docker-compose.prod.yml logs -f"

