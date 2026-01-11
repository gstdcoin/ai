#!/bin/bash
# Enhanced deployment script for GSTD Platform
# Supports both blue-green and standard deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="/home/ubuntu"
COMPOSE_FILE="docker-compose.prod.yml"
COLOR_FILE="/tmp/gstd_deployment_color"
HEALTH_CHECK_URL="http://localhost:8080/api/v1/health"
MAX_HEALTH_WAIT=180
HEALTH_RETRY_INTERVAL=5

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_health() {
    local service=$1
    local url=$2
    local max_wait=${3:-$MAX_HEALTH_WAIT}
    local waited=0
    
    log_info "Checking health of $service..."
    
    while [ $waited -lt $max_wait ]; do
        if curl -f -s "$url" > /dev/null 2>&1; then
            log_success "$service is healthy"
            return 0
        fi
        waited=$((waited + HEALTH_RETRY_INTERVAL))
        echo -n "."
        sleep $HEALTH_RETRY_INTERVAL
    done
    
    log_error "$service health check failed after ${max_wait}s"
    return 1
}

rollback() {
    log_warning "Rolling back deployment..."
    
    if [ -f "$COLOR_FILE" ]; then
        CURRENT_COLOR=$(cat "$COLOR_FILE")
        if [ "$CURRENT_COLOR" = "blue" ]; then
            ACTIVE_COLOR="green"
        else
            ACTIVE_COLOR="blue"
        fi
        
        log_info "Switching back to $ACTIVE_COLOR deployment"
        echo "$ACTIVE_COLOR" > "$COLOR_FILE"
        
        # Update nginx to point to active color
        if [ -f "$PROJECT_DIR/nginx/load-balancer.conf" ]; then
            sed -i "s/backend_blue/backend_$ACTIVE_COLOR/g" "$PROJECT_DIR/nginx/load-balancer.conf" || true
            docker-compose -f "$COMPOSE_FILE" restart nginx-lb || true
        fi
    fi
    
    log_error "Rollback completed"
    exit 1
}

# Main deployment
main() {
    log_info "=========================================="
    log_info "GSTD Platform - Deployment Script"
    log_info "=========================================="
    
    cd "$PROJECT_DIR" || {
        log_error "Cannot access project directory: $PROJECT_DIR"
        exit 1
    }
    
    # Check if blue-green deployment is available
    if [ -f "scripts/blue-green-deploy.sh" ] && [ -f "$COMPOSE_FILE" ]; then
        log_info "Using blue-green deployment strategy"
        bash scripts/blue-green-deploy.sh || rollback
    else
        log_info "Using standard deployment strategy"
        
        # Pull latest images
        log_info "Pulling latest Docker images..."
        docker-compose -f "$COMPOSE_FILE" pull || log_warning "Some images could not be pulled"
        
        # Build if needed
        log_info "Building services..."
        docker-compose -f "$COMPOSE_FILE" build --no-cache || log_warning "Build had warnings"
        
        # Stop old containers gracefully
        log_info "Stopping old containers..."
        docker-compose -f "$COMPOSE_FILE" down --timeout 30 || true
        
        # Start new containers
        log_info "Starting new containers..."
        docker-compose -f "$COMPOSE_FILE" up -d --remove-orphans
        
        # Wait for services to be ready
        log_info "Waiting for services to initialize..."
        sleep 10
        
        # Health checks
        if ! check_health "backend" "$HEALTH_CHECK_URL"; then
            log_error "Backend health check failed"
            log_info "Container logs:"
            docker-compose -f "$COMPOSE_FILE" logs --tail=50 backend || true
            rollback
        fi
        
        # Check frontend (non-critical)
        if curl -f -s http://localhost:3000 > /dev/null 2>&1; then
            log_success "Frontend is accessible"
        else
            log_warning "Frontend health check failed (non-critical)"
        fi
    fi
    
    # Cleanup old images
    log_info "Cleaning up old Docker images..."
    docker image prune -f --filter "until=24h" || true
    
    # Show status
    log_info "Deployment status:"
    docker-compose -f "$COMPOSE_FILE" ps
    
    log_success "Deployment completed successfully!"
    log_info "Services are available at:"
    log_info "  - Frontend: https://app.gstdtoken.com"
    log_info "  - API: https://app.gstdtoken.com/api/v1"
}

# Trap errors
trap 'rollback' ERR

# Run main function
main "$@"
