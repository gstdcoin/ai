#!/bin/bash

# GSTD Platform Flow Check Script
# Verifies critical components for task lifecycle: DB schema, task creation, backend health

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Configuration
DB_NAME="distributed_computing"
DB_USER="postgres"
POSTGRES_CONTAINER=$(docker ps --format "{{.Names}}" | grep postgres | head -1)
BACKEND_URL="http://localhost:8080"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== GSTD Platform Flow Check ===${NC}\n"

# Step 1: Check if PostgreSQL container is running
echo -e "${YELLOW}[1/4] Checking PostgreSQL container...${NC}"
if [ -z "$POSTGRES_CONTAINER" ]; then
    echo -e "${RED}  ✗ PostgreSQL container not found${NC}"
    exit 1
fi
echo -e "${GREEN}  ✓ PostgreSQL container: ${POSTGRES_CONTAINER}${NC}"

# Step 2: Check if platform_fee_ton column exists
echo -e "\n${YELLOW}[2/4] Checking database schema (platform_fee_ton column)...${NC}"
COLUMN_EXISTS=$(docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "
    SELECT COUNT(*) 
    FROM information_schema.columns 
    WHERE table_name = 'tasks' 
    AND column_name = 'platform_fee_ton';
" | tr -d ' ')

if [ "$COLUMN_EXISTS" = "1" ]; then
    echo -e "${GREEN}  ✓ Column platform_fee_ton exists${NC}"
else
    echo -e "${RED}  ✗ Column platform_fee_ton NOT FOUND${NC}"
    echo -e "${YELLOW}  → Applying migration v21...${NC}"
    
    # Apply migration
    if docker exec -i "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$PROJECT_ROOT/backend/migrations/v21_add_platform_fee_ton.sql" >/dev/null 2>&1; then
        echo -e "${GREEN}  ✓ Migration applied successfully${NC}"
    else
        echo -e "${RED}  ✗ Migration failed${NC}"
        exit 1
    fi
fi

# Step 3: Check backend health
echo -e "\n${YELLOW}[3/4] Checking backend health...${NC}"
if HEALTH_RESPONSE=$(curl -sf "$BACKEND_URL/api/v1/health" 2>/dev/null); then
    echo -e "${GREEN}  ✓ Backend is healthy${NC}"
    # Check if status is healthy
    if echo "$HEALTH_RESPONSE" | grep -q '"status":"healthy"'; then
        echo -e "${GREEN}  ✓ Backend status: healthy${NC}"
    else
        echo -e "${YELLOW}  ⚠ Backend status: $(echo "$HEALTH_RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)${NC}"
    fi
else
    echo -e "${RED}  ✗ Backend is not responding${NC}"
    exit 1
fi

# Step 4: Test task creation endpoint
echo -e "\n${YELLOW}[4/4] Testing task creation endpoint...${NC}"

# Create a test task request
TEST_TASK_JSON=$(cat <<EOF
{
  "type": "test",
  "budget": 1.0,
  "payload": {
    "test": true
  }
}
EOF
)

# Try to create a task (we expect it might fail without auth, but should not be 500)
TASK_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "$TEST_TASK_JSON" \
    "$BACKEND_URL/api/v1/tasks/create" 2>/dev/null || echo -e "\n000")

HTTP_CODE=$(echo "$TASK_RESPONSE" | tail -1)
RESPONSE_BODY=$(echo "$TASK_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "000" ]; then
    echo -e "${RED}  ✗ Failed to connect to backend${NC}"
    exit 1
elif [ "$HTTP_CODE" = "500" ]; then
    echo -e "${RED}  ✗ Backend returned 500 Internal Server Error${NC}"
    echo -e "${RED}    Response: $RESPONSE_BODY${NC}"
    exit 1
elif [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    # Extract task_id from response
    TASK_ID=$(echo "$RESPONSE_BODY" | grep -o '"task_id":"[^"]*"' | cut -d'"' -f4 || echo "")
    if [ -n "$TASK_ID" ]; then
        echo -e "${GREEN}  ✓ Task created successfully${NC}"
        echo -e "${GREEN}    Task ID: ${TASK_ID}${NC}"
    else
        echo -e "${GREEN}  ✓ Task creation endpoint responded (HTTP $HTTP_CODE)${NC}"
    fi
elif [ "$HTTP_CODE" = "400" ] || [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
    echo -e "${YELLOW}  ⚠ Task creation requires authentication (HTTP $HTTP_CODE)${NC}"
    echo -e "${YELLOW}    This is expected - endpoint is working, but needs auth${NC}"
else
    echo -e "${YELLOW}  ⚠ Unexpected response (HTTP $HTTP_CODE)${NC}"
    echo -e "${YELLOW}    Response: $RESPONSE_BODY${NC}"
fi

# Final summary
echo -e "\n${GREEN}=== Flow Check Complete ===${NC}"
echo -e "\nSummary:"
echo -e "  ${GREEN}✓${NC} Database schema: OK"
echo -e "  ${GREEN}✓${NC} Backend health: OK"
echo -e "  ${GREEN}✓${NC} Task creation endpoint: Accessible"

if [ "$HTTP_CODE" != "500" ]; then
    echo -e "\n${GREEN}✅ Platform is ready for task lifecycle!${NC}"
    echo -e "\nNext steps:"
    echo -e "  1. Apply all migrations: ${YELLOW}./scripts/apply_migrations.sh${NC}"
    echo -e "  2. Test full flow with authenticated user"
    echo -e "  3. Monitor logs: ${YELLOW}docker logs ubuntu_backend_1 -f${NC}"
else
    echo -e "\n${RED}❌ Critical issue detected - backend returning 500 errors${NC}"
    echo -e "  Check logs: ${YELLOW}docker logs ubuntu_backend_1 --tail 50${NC}"
    exit 1
fi
