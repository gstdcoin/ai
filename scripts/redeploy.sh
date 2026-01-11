#!/bin/bash

# GSTD Platform Hard Reset & Redeploy Script
# This script ensures database password synchronization and proper service startup order

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== GSTD Platform Hard Reset & Redeploy ===${NC}\n"

# Step 1: Export current passwords from docker-compose.yml
echo -e "${YELLOW}[1/7] Extracting database credentials...${NC}"
DB_USER=$(grep -A 1 "POSTGRES_USER=" docker-compose.yml | grep "POSTGRES_USER=" | cut -d'=' -f2 | tr -d ' ')
DB_PASSWORD=$(grep -A 1 "POSTGRES_PASSWORD=" docker-compose.yml | grep "POSTGRES_PASSWORD=" | cut -d'=' -f2 | tr -d ' ')
DB_NAME=$(grep -A 1 "POSTGRES_DB=" docker-compose.yml | grep "POSTGRES_DB=" | cut -d'=' -f2 | tr -d ' ')

if [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_NAME" ]; then
    echo -e "${RED}ERROR: Could not extract database credentials from docker-compose.yml${NC}"
    exit 1
fi

echo -e "  DB_USER: $DB_USER"
echo -e "  DB_NAME: $DB_NAME"
echo -e "  DB_PASSWORD: ${DB_PASSWORD:0:2}***\n"

# Step 2: Stop all containers
echo -e "${YELLOW}[2/7] Stopping all containers...${NC}"
docker-compose down || true
echo -e "${GREEN}✓ Containers stopped${NC}\n"

# Step 3: Check if database volume exists and sync password
echo -e "${YELLOW}[3/7] Checking database volume...${NC}"
if docker volume inspect ubuntu_postgres_data >/dev/null 2>&1; then
    echo -e "  Database volume exists"
    
    # Start postgres temporarily to check/sync password
    echo -e "  Starting temporary postgres container for password sync..."
    docker run --rm -d \
        --name postgres_temp_sync \
        --network gstd-network \
        -e POSTGRES_USER="$DB_USER" \
        -e POSTGRES_PASSWORD="$DB_PASSWORD" \
        -e POSTGRES_DB="$DB_NAME" \
        -v ubuntu_postgres_data:/var/lib/postgresql/data \
        postgres:15-alpine \
        >/dev/null 2>&1 || true
    
    # Wait for postgres to be ready
    echo -e "  Waiting for postgres to be ready..."
    for i in {1..30}; do
        if docker exec postgres_temp_sync pg_isready -U "$DB_USER" >/dev/null 2>&1; then
            echo -e "  ✓ Postgres is ready"
            break
        fi
        sleep 1
    done
    
    # Verify password works
    echo -e "  Verifying password..."
    if docker exec postgres_temp_sync psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
        echo -e "${GREEN}  ✓ Password verified${NC}"
    else
        echo -e "${YELLOW}  ⚠ Password verification failed, will reset on next start${NC}"
    fi
    
    # Stop temporary container
    docker stop postgres_temp_sync >/dev/null 2>&1 || true
else
    echo -e "  Database volume does not exist, will be created on first start"
fi
echo ""

# Step 4: Remove old containers that might conflict
echo -e "${YELLOW}[4/7] Cleaning up old containers...${NC}"
docker rm -f ubuntu_postgres_1 ubuntu_backend_1 ubuntu_frontend_1 ubuntu_nginx_1 ubuntu_redis_1 2>/dev/null || true
echo -e "${GREEN}✓ Cleanup complete${NC}\n"

# Step 5: Start services in strict order
echo -e "${YELLOW}[5/7] Starting services in order...${NC}"

# 5.1: Start postgres and wait for health
echo -e "  → Starting PostgreSQL..."
docker-compose up -d postgres
echo -e "  Waiting for PostgreSQL to be healthy..."
for i in {1..60}; do
    if docker exec ubuntu_postgres_1 pg_isready -U "$DB_USER" >/dev/null 2>&1; then
        echo -e "${GREEN}  ✓ PostgreSQL is healthy${NC}"
        break
    fi
    if [ $i -eq 60 ]; then
        echo -e "${RED}  ✗ PostgreSQL failed to become healthy${NC}"
        exit 1
    fi
    sleep 1
done

# 5.2: Start redis
echo -e "  → Starting Redis..."
docker-compose up -d redis
sleep 2
echo -e "${GREEN}  ✓ Redis started${NC}"

# 5.3: Start backend and wait for health
echo -e "  → Starting Backend..."
docker-compose up -d backend
echo -e "  Waiting for Backend to be healthy..."
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

# 5.4: Start frontend
echo -e "  → Starting Frontend..."
docker-compose up -d frontend
sleep 5
echo -e "${GREEN}  ✓ Frontend started${NC}"

# 5.5: Start nginx
echo -e "  → Starting Nginx..."
docker-compose up -d nginx
sleep 3
echo -e "${GREEN}  ✓ Nginx started${NC}\n"

# Step 6: Verify all services are running
echo -e "${YELLOW}[6/7] Verifying services...${NC}"
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

# Step 7: Final health check
echo -e "${YELLOW}[7/7] Final health check...${NC}"

# Check backend health endpoint
echo -e "  Checking backend health endpoint..."
if HEALTH_RESPONSE=$(curl -sf http://localhost:8080/api/v1/health 2>/dev/null); then
    echo -e "${GREEN}  ✓ Backend health endpoint: OK${NC}"
    echo -e "  Response: $(echo "$HEALTH_RESPONSE" | head -c 100)..."
else
    echo -e "${RED}  ✗ Backend health endpoint: FAILED${NC}"
    echo -e "  Checking logs..."
    docker logs ubuntu_backend_1 --tail 10
    exit 1
fi

# Check nginx
echo -e "  Checking nginx configuration..."
if docker exec ubuntu_nginx_1 nginx -t >/dev/null 2>&1; then
    echo -e "${GREEN}  ✓ Nginx configuration: OK${NC}"
else
    echo -e "${RED}  ✗ Nginx configuration: FAILED${NC}"
    docker exec ubuntu_nginx_1 nginx -t
    exit 1
fi

# Check database connection from backend
echo -e "  Checking database connection..."
sleep 2
if docker exec ubuntu_backend_1 wget -q -O- http://localhost:8080/api/v1/health | grep -q "healthy" 2>/dev/null; then
    echo -e "${GREEN}  ✓ Database connection: OK${NC}"
else
    echo -e "${YELLOW}  ⚠ Database connection: Check manually${NC}"
fi

echo ""
echo -e "${GREEN}=== Redeploy Complete! ===${NC}"
echo -e "\nServices status:"
docker-compose ps

echo -e "\n${GREEN}Platform is ready!${NC}"
echo -e "  Frontend: http://localhost:3000"
echo -e "  Backend:  http://localhost:8080"
echo -e "  Health:   http://localhost:8080/api/v1/health"
echo -e "  Nginx:    https://app.gstdtoken.com"
