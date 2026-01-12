#!/bin/bash

# GSTD Platform Safe Release Script
# Applies migrations, updates containers, and verifies all APIs

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== GSTD Platform Safe Release ===${NC}\n"

# Step 1: Create database backup
echo -e "${YELLOW}[1/6] Creating database backup...${NC}"
if [ -f "$SCRIPT_DIR/backup_db.sh" ]; then
    bash "$SCRIPT_DIR/backup_db.sh"
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}  ✓ Backup completed${NC}\n"
    else
        echo -e "${RED}  ✗ Backup failed, but continuing...${NC}\n"
    fi
else
    echo -e "${YELLOW}  ⚠ Backup script not found, skipping backup${NC}\n"
fi

# Step 2: Apply database migrations
echo -e "${YELLOW}[2/6] Applying database migrations...${NC}"
if [ -f "$SCRIPT_DIR/apply_migrations.sh" ]; then
    bash "$SCRIPT_DIR/apply_migrations.sh"
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}  ✓ Migrations applied${NC}\n"
    else
        echo -e "${RED}  ✗ Migrations failed${NC}"
        exit 1
    fi
else
    echo -e "${RED}  ✗ Migration script not found${NC}"
    exit 1
fi

# Step 3: Rebuild backend (to include code changes)
echo -e "${YELLOW}[3/6] Rebuilding backend...${NC}"
docker-compose build backend
if [ $? -eq 0 ]; then
    echo -e "${GREEN}  ✓ Backend rebuilt${NC}\n"
else
    echo -e "${RED}  ✗ Backend rebuild failed${NC}"
    exit 1
fi

# Step 4: Restart services in order
echo -e "${YELLOW}[4/6] Restarting services...${NC}"

# Stop services
echo -e "  → Stopping services..."
docker-compose stop backend frontend nginx 2>/dev/null || true

# Start in order: postgres -> redis -> backend -> frontend -> nginx
echo -e "  → Starting PostgreSQL..."
docker-compose up -d postgres
sleep 5

echo -e "  → Starting Redis..."
docker-compose up -d redis
sleep 2

echo -e "  → Starting Backend..."
docker-compose up -d backend
echo -e "  Waiting for backend to be healthy..."
for i in {1..120}; do
    if curl -sf http://localhost:8080/api/v1/health >/dev/null 2>&1; then
        echo -e "${GREEN}  ✓ Backend is healthy${NC}"
        break
    fi
    if [ $i -eq 120 ]; then
        echo -e "${YELLOW}  ⚠ Backend health check timeout (may still be starting)${NC}"
    fi
    sleep 1
done

echo -e "  → Starting Frontend..."
docker-compose up -d frontend
sleep 5

echo -e "  → Starting Nginx..."
docker-compose up -d nginx
sleep 3

echo -e "${GREEN}  ✓ All services restarted${NC}\n"

# Step 5: Verify all services are running
echo -e "${YELLOW}[5/6] Verifying services...${NC}"
SERVICES=("ubuntu_postgres_1:PostgreSQL" "ubuntu_redis_1:Redis" "ubuntu_backend_1:Backend" "ubuntu_frontend_1:Frontend" "ubuntu_nginx_1:Nginx")
ALL_OK=true

for service in "${SERVICES[@]}"; do
    container="${service%%:*}"
    name="${service##*:}"
    if docker ps --format "{{.Names}}" | grep -q "^${container}$"; then
        echo -e "  ${GREEN}✓${NC} $name is running"
    else
        echo -e "  ${RED}✗${NC} $name is NOT running"
        ALL_OK=false
    fi
done

if [ "$ALL_OK" = false ]; then
    echo -e "\n${RED}ERROR: Some services failed to start${NC}"
    exit 1
fi
echo ""

# Step 6: API Health Checks
echo -e "${YELLOW}[6/6] Testing API endpoints...${NC}"

# Test backend health endpoint
echo -e "  → Testing /api/v1/health..."
if HEALTH_RESPONSE=$(curl -sf http://localhost:8080/api/v1/health 2>/dev/null); then
    echo -e "  ${GREEN}✓${NC} Backend health: OK"
    echo -e "    Response: $(echo "$HEALTH_RESPONSE" | head -c 100)..."
else
    echo -e "  ${RED}✗${NC} Backend health: FAILED"
    echo -e "    Checking logs..."
    docker logs ubuntu_backend_1 --tail 10
    exit 1
fi

# Test stats endpoint
echo -e "  → Testing /api/v1/stats..."
if STATS_RESPONSE=$(curl -sf http://localhost:8080/api/v1/stats 2>/dev/null); then
    if echo "$STATS_RESPONSE" | grep -q "error"; then
        echo -e "  ${YELLOW}⚠${NC} Stats endpoint returned error (may be schema issue)"
        echo -e "    Response: $STATS_RESPONSE"
    else
        echo -e "  ${GREEN}✓${NC} Stats endpoint: OK"
    fi
else
    echo -e "  ${RED}✗${NC} Stats endpoint: FAILED"
    exit 1
fi

# Test version endpoint
echo -e "  → Testing /api/v1/version..."
if VERSION_RESPONSE=$(curl -sf http://localhost:8080/api/v1/version 2>/dev/null); then
    echo -e "  ${GREEN}✓${NC} Version endpoint: OK"
else
    echo -e "  ${YELLOW}⚠${NC} Version endpoint: Not accessible (non-critical)"
fi

# Test external health through nginx
echo -e "  → Testing external /api/v1/health (via nginx)..."
if EXTERNAL_HEALTH=$(curl -sf https://app.gstdtoken.com/api/v1/health 2>/dev/null); then
    echo -e "  ${GREEN}✓${NC} External health endpoint: OK"
else
    echo -e "  ${YELLOW}⚠${NC} External health endpoint: Not accessible (may need DNS/SSL)"
fi

# Final summary
echo -e "\n${GREEN}=== Release Complete! ===${NC}"
echo -e "\nServices status:"
docker-compose ps

echo -e "\n${GREEN}Platform is ready!${NC}"
echo -e "  Frontend: http://localhost:3000"
echo -e "  Backend:  http://localhost:8080"
echo -e "  Health:   http://localhost:8080/api/v1/health"
echo -e "  External: https://app.gstdtoken.com"
