#!/bin/bash
# Blue-Green Deployment Script for GSTD Platform

set -e

COLOR_FILE="/tmp/gstd_deployment_color"
NGINX_CONF="/home/ubuntu/nginx/load-balancer.conf"

# Get current deployment color
if [ -f "$COLOR_FILE" ]; then
    CURRENT_COLOR=$(cat "$COLOR_FILE")
else
    CURRENT_COLOR="blue"
    echo "$CURRENT_COLOR" > "$COLOR_FILE"
fi

# Determine next color
if [ "$CURRENT_COLOR" = "blue" ]; then
    NEXT_COLOR="green"
    ACTIVE_UPSTREAM="backend_blue"
    NEXT_UPSTREAM="backend_green"
else
    NEXT_COLOR="blue"
    ACTIVE_UPSTREAM="backend_green"
    NEXT_UPSTREAM="backend_blue"
fi

echo "=========================================="
echo "GSTD Platform - Blue-Green Deployment"
echo "=========================================="
echo "Current deployment: $CURRENT_COLOR"
echo "Deploying to: $NEXT_COLOR"
echo ""

# Step 1: Build and start next color
echo "[1/5] Building and starting $NEXT_COLOR deployment..."
docker-compose -f docker-compose.prod.yml up -d --build --scale backend-$NEXT_COLOR=2 --no-deps backend-$NEXT_COLOR

# Step 2: Wait for health checks
echo "[2/5] Waiting for $NEXT_COLOR to be healthy..."
MAX_WAIT=120
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if docker-compose -f docker-compose.prod.yml ps backend-$NEXT_COLOR | grep -q "healthy\|Up"; then
        HEALTHY=$(docker-compose -f docker-compose.prod.yml exec -T backend-$NEXT_COLOR wget -q -O- http://localhost:8080/api/v1/health | grep -o '"status":"healthy"' || echo "")
        if [ -n "$HEALTHY" ]; then
            echo "✅ $NEXT_COLOR is healthy"
            break
        fi
    fi
    sleep 5
    WAITED=$((WAITED + 5))
    echo "   Waiting... ($WAITED/$MAX_WAIT seconds)"
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo "❌ $NEXT_COLOR failed to become healthy"
    echo "[ROLLBACK] Stopping $NEXT_COLOR deployment..."
    docker-compose -f docker-compose.prod.yml stop backend-$NEXT_COLOR
    exit 1
fi

# Step 3: Update nginx configuration
echo "[3/5] Updating nginx configuration to route traffic to $NEXT_COLOR..."
sed -i "s/backend_active {/backend_active {\n    # Active: $NEXT_COLOR\n    least_conn;/" "$NGINX_CONF"
sed -i "s/weight=100/weight=0 backup/" "$NGINX_CONF"  # Old color
sed -i "s/weight=0 backup/weight=100/" "$NGINX_CONF"  # New color (first occurrence)

# Step 4: Reload nginx
echo "[4/5] Reloading nginx..."
docker-compose -f docker-compose.prod.yml exec -T nginx-lb nginx -s reload

# Step 5: Update deployment color
echo "$NEXT_COLOR" > "$COLOR_FILE"

# Step 6: Wait and verify
echo "[5/5] Verifying deployment..."
sleep 10
HEALTH_CHECK=$(curl -s http://localhost/api/v1/health | grep -o '"status":"healthy"' || echo "")
if [ -n "$HEALTH_CHECK" ]; then
    echo "✅ Deployment successful! Traffic is now routed to $NEXT_COLOR"
    
    # Optionally stop old deployment after grace period
    echo ""
    read -p "Stop old $CURRENT_COLOR deployment? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Stopping $CURRENT_COLOR deployment..."
        docker-compose -f docker-compose.prod.yml stop backend-$CURRENT_COLOR
    fi
else
    echo "❌ Health check failed after deployment"
    echo "[ROLLBACK] Reverting to $CURRENT_COLOR..."
    echo "$CURRENT_COLOR" > "$COLOR_FILE"
    # Revert nginx config
    sed -i "s/weight=100/weight=0 backup/" "$NGINX_CONF"
    sed -i "s/weight=0 backup/weight=100/" "$NGINX_CONF"
    docker-compose -f docker-compose.prod.yml exec -T nginx-lb nginx -s reload
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ Blue-Green Deployment Complete!"
echo "Active deployment: $NEXT_COLOR"
echo "=========================================="
