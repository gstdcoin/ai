#!/bin/bash
# GSTD Platform - Production Deployment Script
# Version: 2.0.0 (2026-01-18)
# 
# This script performs clean rebuild and deployment with:
# - Proper cleanup of orphan containers
# - Health check verification 
# - Automatic nginx reload for DNS refresh
# - No duplicate containers

set -e  # Exit on any error

echo "========================================="
echo "🚀 GSTD Platform - Production Deployment"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.prod.yml"
PROJECT_NAME="gstd-prod"

# Function to print status
status() { echo -e "${GREEN}✓${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }
info() { echo -e "${BLUE}ℹ${NC} $1"; }

# Step 1: Stop all containers and remove orphans
echo "Step 1/8: Stopping containers and removing orphans..."
docker compose -f $COMPOSE_FILE down --remove-orphans 2>/dev/null || true

# Also clean any orphaned containers from old deployments
docker ps -a --format '{{.Names}}' | grep -E 'gstd_|ubuntu-(frontend|backend|postgres|redis)' | xargs -r docker rm -f 2>/dev/null || true
status "Containers stopped and orphans removed"

# Step 2: Remove old images to force rebuild
echo ""
echo "Step 2/8: Removing old application images..."
docker rmi gstd-frontend:latest gstd-backend:latest 2>/dev/null || true
status "Old images removed"

# Step 3: Clean Docker system (careful - keeps volumes)
echo ""
echo "Step 3/8: Pruning unused Docker resources..."
docker system prune -f 2>/dev/null || true
status "Docker system pruned"

# Step 4: Build images without cache
echo ""
echo "Step 4/8: Building fresh images (no cache)..."
docker compose -f $COMPOSE_FILE build --no-cache --parallel
status "Images built successfully"

# Step 5: Start infrastructure first (postgres, redis)
echo ""
echo "Step 5/8: Starting infrastructure services..."
docker compose -f $COMPOSE_FILE up -d postgres redis
echo "  Waiting for databases to become healthy..."
sleep 15

# Check if postgres and redis are healthy
POSTGRES_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' gstd_postgres_prod 2>/dev/null || echo "unknown")
REDIS_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' gstd_redis_prod 2>/dev/null || echo "unknown")

if [ "$POSTGRES_HEALTH" = "healthy" ] && [ "$REDIS_HEALTH" = "healthy" ]; then
    status "Infrastructure services are healthy"
else
    warning "Waiting additional 15s for infrastructure..."
    sleep 15
fi

# Step 6: Start all services
echo ""
echo "Step 6/8: Starting all services..."
docker compose -f $COMPOSE_FILE up -d
status "All services started"

# Step 7: Wait for services to be ready
echo ""
echo "Step 7/8: Waiting for all services to be ready..."
echo "  (This may take up to 90 seconds for frontend build)"

# Wait for health checks
MAX_WAIT=90
WAITED=0
ALL_HEALTHY=false

while [ $WAITED -lt $MAX_WAIT ]; do
    sleep 10
    WAITED=$((WAITED + 10))
    
    # Check all services
    UNHEALTHY=$(docker compose -f $COMPOSE_FILE ps --format json 2>/dev/null | jq -r 'select(.Health == "unhealthy" or .Health == "starting") | .Name' 2>/dev/null | wc -l)
    
    if [ "$UNHEALTHY" = "0" ]; then
        ALL_HEALTHY=true
        break
    fi
    
    echo "  Still waiting... ($WAITED/$MAX_WAIT seconds)"
done

if [ "$ALL_HEALTHY" = "true" ]; then
    status "All services are healthy"
else
    warning "Some services may still be starting, continuing..."
fi

# Reload nginx to ensure fresh DNS resolution
docker exec gstd_nginx_lb nginx -s reload 2>/dev/null || true
status "Nginx configuration reloaded"

# Step 8: Health checks
echo ""
echo "Step 8/8: Running health checks..."

# Check API health
echo "  Checking /api/v1/health..."
API_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:80/api/v1/health 2>/dev/null || echo "000")
if [ "$API_HEALTH" = "200" ]; then
    status "API health check passed (HTTP $API_HEALTH)"
else
    error "API health check failed (HTTP $API_HEALTH)"
fi

# Check frontend
echo "  Checking frontend..."
FRONTEND_CHECK=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:80/ 2>/dev/null || echo "000")
if [ "$FRONTEND_CHECK" = "200" ] || [ "$FRONTEND_CHECK" = "301" ]; then
    status "Frontend accessible (HTTP $FRONTEND_CHECK)"
else
    error "Frontend check failed (HTTP $FRONTEND_CHECK)"
fi

# Check HTTPS
echo "  Checking HTTPS..."
HTTPS_CHECK=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 https://localhost/ 2>/dev/null || echo "000")
if [ "$HTTPS_CHECK" = "200" ]; then
    status "HTTPS working (HTTP $HTTPS_CHECK)"
else
    warning "HTTPS check returned HTTP $HTTPS_CHECK"
fi

echo ""
echo "========================================="
echo "📊 Deployment Summary"
echo "========================================="

# Container status
echo ""
echo "Running containers:"
docker compose -f $COMPOSE_FILE ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || docker ps --format "table {{.Names}}\t{{.Status}}"

# Count containers
EXPECTED_CONTAINERS=6  # postgres, redis, backend-blue, backend-green, frontend x2, nginx-lb
ACTUAL_CONTAINERS=$(docker compose -f $COMPOSE_FILE ps -q 2>/dev/null | wc -l)

echo ""
if [ "$API_HEALTH" = "200" ] && [ "$FRONTEND_CHECK" = "200" ] || [ "$FRONTEND_CHECK" = "301" ]; then
    echo -e "${GREEN}✅ DEPLOYMENT SUCCESSFUL${NC}"
    echo ""
    echo "Platform is ready at:"
    echo "  - Frontend: https://app.gstdtoken.com"
    echo "  - API: https://app.gstdtoken.com/api/v1/"
    echo "  - Health: https://app.gstdtoken.com/api/v1/health"
else
    echo -e "${RED}⚠️ DEPLOYMENT COMPLETED WITH WARNINGS${NC}"
    echo ""
    echo "Some health checks failed. Please verify:"
    echo "  1. docker compose -f $COMPOSE_FILE logs"
    echo "  2. docker compose -f $COMPOSE_FILE ps"
fi
echo "========================================="
