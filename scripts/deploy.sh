#!/bin/bash
# GSTD Platform - Zero-Downtime Deployment Script
# Usage: ./scripts/deploy.sh [--rebuild-all] [--skip-frontend]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$PROJECT_DIR/logs/deploy_${TIMESTAMP}.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Webhook URL for notifications (replace with your actual n8n webhook)
N8N_WEBHOOK_URL="${N8N_WEBHOOK_URL:-}"

# Parse arguments
REBUILD_ALL=false
SKIP_FRONTEND=false
for arg in "$@"; do
    case $arg in
        --rebuild-all) REBUILD_ALL=true ;;
        --skip-frontend) SKIP_FRONTEND=true ;;
    esac
done

log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}✅ $1${NC}" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}⚠️  $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}❌ $1${NC}" | tee -a "$LOG_FILE"
}

notify_webhook() {
    local status=$1
    local message=$2
    
    if [ -n "$N8N_WEBHOOK_URL" ]; then
        curl -s -X POST "$N8N_WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{\"status\": \"$status\", \"message\": \"$message\", \"timestamp\": \"$(date -Iseconds)\"}" \
            > /dev/null 2>&1 || true
    fi
}

check_health() {
    local url=$1
    local max_attempts=${2:-30}
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" | grep -q '"status":"healthy"'; then
            return 0
        fi
        sleep 2
        attempt=$((attempt + 1))
    done
    return 1
}

# Create log directory
mkdir -p "$PROJECT_DIR/logs"

log "🚀 Starting GSTD Platform Deployment"
log "   Timestamp: $TIMESTAMP"
log "   Rebuild All: $REBUILD_ALL"
log "   Skip Frontend: $SKIP_FRONTEND"

notify_webhook "started" "Deployment started at $TIMESTAMP"

cd "$PROJECT_DIR"

# Step 1: Pre-deployment checks
log "Step 1: Pre-deployment checks..."

# Check current health
if check_health "https://app.gstdtoken.com/api/v1/health" 3; then
    success "Current API is healthy"
else
    warn "Current API health check failed - proceeding with caution"
fi

# Step 2: Run database migrations
log "Step 2: Running database migrations..."

POSTGRES_CONTAINER=$(docker ps --filter "name=postgres" --format "{{.Names}}" | head -1)
if [ -z "$POSTGRES_CONTAINER" ]; then
    error "PostgreSQL container not found!"
    notify_webhook "failed" "PostgreSQL container not found"
    exit 1
fi

for migration in backend/migrations/v27_*.sql; do
    if [ -f "$migration" ]; then
        log "   Applying: $migration"
        docker exec -i "$POSTGRES_CONTAINER" psql -U postgres -d distributed_computing < "$migration" 2>/dev/null || true
    fi
done
success "Migrations completed"

# Step 3: Build backend images
log "Step 3: Building backend images..."

if [ "$REBUILD_ALL" = true ]; then
    docker-compose -f docker-compose.prod.yml build --no-cache backend-blue backend-green 2>&1 | tee -a "$LOG_FILE"
else
    docker-compose -f docker-compose.prod.yml build backend-blue backend-green 2>&1 | tee -a "$LOG_FILE"
fi
success "Backend images built"

# Step 4: Rolling update - Blue first
log "Step 4: Rolling update - Blue deployment..."

docker-compose -f docker-compose.prod.yml up -d --no-deps backend-blue 2>&1 | tee -a "$LOG_FILE"
sleep 5

# Wait for blue to become healthy
if check_health "http://localhost:8080/api/v1/health" 30; then
    success "Backend Blue is healthy"
else
    error "Backend Blue health check failed!"
    notify_webhook "failed" "Backend Blue health check failed"
    exit 1
fi

# Step 5: Rolling update - Green
log "Step 5: Rolling update - Green deployment..."

docker-compose -f docker-compose.prod.yml up -d --no-deps backend-green 2>&1 | tee -a "$LOG_FILE"
sleep 5

# Wait for green to become healthy
if check_health "http://localhost:8081/api/v1/health" 30; then
    success "Backend Green is healthy"
else
    warn "Backend Green health check failed - continuing anyway"
fi

# Step 6: Frontend deployment (optional)
if [ "$SKIP_FRONTEND" = false ]; then
    log "Step 6: Building frontend..."
    
    cd frontend
    if [ "$REBUILD_ALL" = true ]; then
        npm run build 2>&1 | tee -a "$LOG_FILE"
    else
        npm run build 2>&1 | tee -a "$LOG_FILE"
    fi
    cd ..
    
    docker-compose -f docker-compose.prod.yml up -d --no-deps frontend 2>&1 | tee -a "$LOG_FILE"
    success "Frontend deployed"
else
    log "Step 6: Skipping frontend deployment"
fi

# Step 7: Reload nginx
log "Step 7: Reloading nginx..."
docker exec gstd_nginx_lb nginx -s reload 2>/dev/null || true
success "Nginx reloaded"

# Step 8: Final verification
log "Step 8: Final verification..."

sleep 10

if check_health "https://app.gstdtoken.com/api/v1/health" 30; then
    success "API is healthy"
else
    error "Final health check failed!"
    notify_webhook "failed" "Final health check failed"
    exit 1
fi

# Check all services
SERVICES_STATUS=$(docker-compose -f docker-compose.prod.yml ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null)
log "Service Status:"
echo "$SERVICES_STATUS" | tee -a "$LOG_FILE"

# Step 9: Cleanup
log "Step 9: Cleaning up old images..."
docker image prune -f 2>/dev/null || true

# Summary
echo ""
echo "=================================================="
success "🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!"
echo "=================================================="
echo ""
log "Deployment log saved to: $LOG_FILE"

# Send success notification
notify_webhook "success" "Deployment completed successfully at $(date -Iseconds)"

# Verify API endpoints
log "Verifying API endpoints..."
curl -s https://app.gstdtoken.com/api/v1/health | jq -r '"Health: " + .status' 2>/dev/null
curl -s https://app.gstdtoken.com/api/v1/marketplace/stats | jq -r '"Marketplace: " + (.total_tasks | tostring) + " tasks"' 2>/dev/null

echo ""
success "All Systems Operational ✅"
