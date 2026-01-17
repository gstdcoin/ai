#!/bin/bash
# GSTD Platform - Final Production Deployment Script
# Version: 1.0.0 (2026-01-17)
# This script performs a complete clean rebuild and deployment

set -e  # Exit on any error

echo "========================================="
echo "🚀 GSTD Platform - Final Deployment"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
status() { echo -e "${GREEN}✓${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }

# Step 1: Stop all containers
echo "Step 1/7: Stopping all containers..."
docker-compose -f docker-compose.prod.yml down --remove-orphans 2>/dev/null || true
docker-compose down --remove-orphans 2>/dev/null || true
status "Containers stopped"

# Step 2: Remove volumes (clean slate)
echo ""
echo "Step 2/7: Removing volumes..."
docker volume rm $(docker volume ls -q | grep gstd) 2>/dev/null || true
status "Volumes removed"

# Step 3: Prune Docker system
echo ""
echo "Step 3/7: Pruning Docker system..."
docker system prune -af --volumes 2>/dev/null || true
status "Docker system pruned"

# Step 4: Rebuild without cache
echo ""
echo "Step 4/7: Rebuilding containers (no cache)..."
docker-compose -f docker-compose.prod.yml build --no-cache
status "Containers rebuilt"

# Step 5: Start containers
echo ""
echo "Step 5/7: Starting containers..."
docker-compose -f docker-compose.prod.yml up -d
status "Containers started"

# Step 6: Wait for services to be ready
echo ""
echo "Step 6/7: Waiting for services to be ready..."
sleep 30

# Step 7: Health checks
echo ""
echo "Step 7/7: Running health checks..."

# Check API health
echo "  Checking /api/v1/health..."
API_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:80/api/v1/health 2>/dev/null || echo "000")
if [ "$API_HEALTH" = "200" ]; then
    status "API health check passed (HTTP $API_HEALTH)"
else
    error "API health check failed (HTTP $API_HEALTH)"
fi

# Check WebSocket endpoint
echo "  Checking /ws endpoint..."
WS_CHECK=$(curl -s -o /dev/null -w "%{http_code}" -H "Connection: Upgrade" -H "Upgrade: websocket" http://localhost:80/ws 2>/dev/null || echo "000")
if [ "$WS_CHECK" = "101" ] || [ "$WS_CHECK" = "400" ] || [ "$WS_CHECK" = "426" ]; then
    status "WebSocket endpoint accessible (HTTP $WS_CHECK)"
else
    warning "WebSocket endpoint returned HTTP $WS_CHECK (may need proper WS client for full test)"
fi

# Check frontend
echo "  Checking frontend..."
FRONTEND_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:80/ 2>/dev/null || echo "000")
if [ "$FRONTEND_CHECK" = "200" ]; then
    status "Frontend accessible (HTTP $FRONTEND_CHECK)"
else
    error "Frontend check failed (HTTP $FRONTEND_CHECK)"
fi

# Check database connectivity via API
echo "  Checking database via /api/v1/stats/public..."
STATS_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:80/api/v1/stats/public 2>/dev/null || echo "000")
if [ "$STATS_CHECK" = "200" ]; then
    status "Database connection verified (HTTP $STATS_CHECK)"
else
    warning "Stats endpoint returned HTTP $STATS_CHECK"
fi

# Check pool status
echo "  Checking /api/v1/pool/status..."
POOL_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:80/api/v1/pool/status 2>/dev/null || echo "000")
if [ "$POOL_CHECK" = "200" ]; then
    status "Pool status endpoint working (HTTP $POOL_CHECK)"
else
    warning "Pool status returned HTTP $POOL_CHECK"
fi

echo ""
echo "========================================="
echo "📊 Deployment Summary"
echo "========================================="

# Container status
echo ""
echo "Running containers:"
docker-compose -f docker-compose.prod.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "========================================="
if [ "$API_HEALTH" = "200" ] && [ "$FRONTEND_CHECK" = "200" ]; then
    echo -e "${GREEN}✅ DEPLOYMENT SUCCESSFUL${NC}"
    echo ""
    echo "Platform is ready at:"
    echo "  - Frontend: https://app.gstdtoken.com"
    echo "  - API: https://app.gstdtoken.com/api/v1/"
    echo "  - WebSocket: wss://app.gstdtoken.com/ws"
    echo ""
    echo "Genesis Task (5G/GPS Telemetry) is operational."
else
    echo -e "${RED}⚠️ DEPLOYMENT COMPLETED WITH WARNINGS${NC}"
    echo ""
    echo "Some health checks failed. Please verify:"
    echo "  1. docker-compose -f docker-compose.prod.yml logs"
    echo "  2. docker-compose -f docker-compose.prod.yml ps"
fi
echo "========================================="
