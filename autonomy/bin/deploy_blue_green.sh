#!/bin/bash
# Blue-Green Deployment Manager for GSTD
# Usage: ./deploy_blue_green.sh [prepare|switch|status|rollback] <filename>

NGINX_CONF="/home/ubuntu/nginx/conf.d/load-balancer.conf"
DOCKER_COMPOSE="docker-compose -f /home/ubuntu/docker-compose.yml"
BACKEND_DIR="/home/ubuntu/backend"

# Determine current active color
if grep -q "server backend-blue:8080.*weight=100" "$NGINX_CONF"; then
    ACTIVE="blue"
    INACTIVE="green"
elif grep -q "server backend-green:8080.*weight=100" "$NGINX_CONF"; then
    ACTIVE="green"
    INACTIVE="blue"
else
    # Default fallback
    ACTIVE="blue"
    INACTIVE="green"
fi

case $1 in
    "status")
        echo "Active: $ACTIVE"
        echo "Candidate: $INACTIVE"
        ;;

    "prepare")
        FILE=$2
        echo "🛠 Preparing Deployment to $INACTIVE (Candidate)..."
        
        # 1. Update Source (Bot already wrote the file to internal/services, but we need to ensure it's in the build context)
        # Assuming bot wrote to /home/ubuntu/backend/internal/services/$FILE
        
        # 2. Rebuild Candidate
        echo "📦 Building $INACTIVE container..."
        $DOCKER_COMPOSE build backend-$INACTIVE
        if [ $? -ne 0 ]; then echo "❌ Build Failed"; exit 1; fi
        
        # 3. Start Candidate
        echo "🚀 Starting $INACTIVE..."
        $DOCKER_COMPOSE up -d backend-$INACTIVE
        
        # 4. Wait for Health
        echo "🏥 Checking Health of $INACTIVE..."
        for i in {1..12}; do
            HEALTH=$($DOCKER_COMPOSE ps backend-$INACTIVE | grep "healthy")
            if [ ! -z "$HEALTH" ]; then
                echo "✅ $INACTIVE is HEALTHY."
                exit 0
            fi
            echo "   Waiting for health... ($i/12)"
            sleep 5
        done
        echo "❌ Health Check Failed for $INACTIVE"
        exit 1
        ;;

    "switch")
        echo "🔀 Switching Traffic: $ACTIVE -> $INACTIVE..."
        
        # Backup Config
        cp $NGINX_CONF $NGINX_CONF.bak
        
        # Modify NGINX Config using sed
        if [ "$INACTIVE" == "green" ]; then
            # Enable Green, Disable Blue
            sed -i 's/server backend-blue:8080 max_fails=3 fail_timeout=30s weight=100;/server backend-blue:8080 max_fails=3 fail_timeout=30s backup;/g' $NGINX_CONF
            sed -i 's/server backend-green:8080 max_fails=3 fail_timeout=30s backup;/server backend-green:8080 max_fails=3 fail_timeout=30s weight=100;/g' $NGINX_CONF
        else
            # Enable Blue, Disable Green
            sed -i 's/server backend-green:8080 max_fails=3 fail_timeout=30s weight=100;/server backend-green:8080 max_fails=3 fail_timeout=30s backup;/g' $NGINX_CONF
            sed -i 's/server backend-blue:8080 max_fails=3 fail_timeout=30s backup;/server backend-blue:8080 max_fails=3 fail_timeout=30s weight=100;/g' $NGINX_CONF
        fi
        
        # Reload Nginx
        docker exec gstd_nginx_lb nginx -s reload
        
        # Tag Git
        cd /home/ubuntu
        TAG="v1.0.$(date +%s)-stable"
        git tag $TAG
        echo "✅ Traffic Switched to $INACTIVE. Git Tag: $TAG"
        ;;

    "rollback")
        echo "🔙 Rolling back to $INACTIVE..."
        # Just run switch logic in reverse effectively, or restore backup
        mv $NGINX_CONF.bak $NGINX_CONF
        docker exec gstd_nginx_lb nginx -s reload
        echo "✅ Rollback Complete. Active: $ACTIVE (Restored)"
        ;;
esac
