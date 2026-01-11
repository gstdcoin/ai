#!/bin/bash
# Rollback Script for GSTD Platform

set -e

COLOR_FILE="/tmp/gstd_deployment_color"
NGINX_CONF="/home/ubuntu/nginx/load-balancer.conf"

if [ ! -f "$COLOR_FILE" ]; then
    echo "❌ No deployment color file found. Cannot rollback."
    exit 1
fi

CURRENT_COLOR=$(cat "$COLOR_FILE")

if [ "$CURRENT_COLOR" = "blue" ]; then
    ROLLBACK_COLOR="green"
else
    ROLLBACK_COLOR="blue"
fi

echo "=========================================="
echo "GSTD Platform - Rollback"
echo "=========================================="
echo "Current deployment: $CURRENT_COLOR"
echo "Rolling back to: $ROLLBACK_COLOR"
echo ""

# Step 1: Verify rollback target is healthy
echo "[1/3] Verifying $ROLLBACK_COLOR is healthy..."
HEALTHY=$(docker-compose -f docker-compose.prod.yml exec -T backend-$ROLLBACK_COLOR wget -q -O- http://localhost:8080/api/v1/health | grep -o '"status":"healthy"' || echo "")
if [ -z "$HEALTHY" ]; then
    echo "❌ $ROLLBACK_COLOR is not healthy. Cannot rollback."
    exit 1
fi

# Step 2: Update nginx configuration
echo "[2/3] Updating nginx to route traffic to $ROLLBACK_COLOR..."
sed -i "s/weight=100/weight=0 backup/" "$NGINX_CONF"
sed -i "s/weight=0 backup/weight=100/" "$NGINX_CONF"

# Step 3: Reload nginx
echo "[3/3] Reloading nginx..."
docker-compose -f docker-compose.prod.yml exec -T nginx-lb nginx -s reload

# Update color file
echo "$ROLLBACK_COLOR" > "$COLOR_FILE"

# Verify
sleep 5
HEALTH_CHECK=$(curl -s http://localhost/api/v1/health | grep -o '"status":"healthy"' || echo "")
if [ -n "$HEALTH_CHECK" ]; then
    echo "✅ Rollback successful! Traffic is now routed to $ROLLBACK_COLOR"
else
    echo "❌ Rollback verification failed"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ Rollback Complete!"
echo "Active deployment: $ROLLBACK_COLOR"
echo "=========================================="
