#!/bin/bash

# GSTD Platform Database Migrations Script
# Applies all migrations from backend/migrations/ directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Configuration
MIGRATIONS_DIR="backend/migrations"
DB_NAME="distributed_computing"
DB_USER="postgres"
DB_CONTAINER="gstd_postgres_prod"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== GSTD Database Migrations ===${NC}\n"

# Check if PostgreSQL container is running
if ! docker ps --format "{{.Names}}" | grep -q "^${DB_CONTAINER}$"; then
    echo -e "${RED}ERROR: PostgreSQL container '${DB_CONTAINER}' is not running${NC}"
    exit 1
fi

# Check if migrations directory exists
if [ ! -d "$MIGRATIONS_DIR" ]; then
    echo -e "${RED}ERROR: Migrations directory '${MIGRATIONS_DIR}' not found${NC}"
    exit 1
fi

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}[1/4] Waiting for PostgreSQL to be ready...${NC}"
for i in {1..30}; do
    if docker exec "$DB_CONTAINER" pg_isready -U "$DB_USER" >/dev/null 2>&1; then
        echo -e "${GREEN}  ✓ PostgreSQL is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}  ✗ PostgreSQL failed to become ready${NC}"
        exit 1
    fi
    sleep 1
done

# Get list of SQL migration files, sorted by name
echo -e "\n${YELLOW}[2/4] Finding migration files...${NC}"
MIGRATION_FILES=$(find "$MIGRATIONS_DIR" -name "*.sql" -type f | sort)

if [ -z "$MIGRATION_FILES" ]; then
    echo -e "${YELLOW}  ⚠ No migration files found${NC}"
    exit 0
fi

MIGRATION_COUNT=$(echo "$MIGRATION_FILES" | wc -l)
echo -e "${GREEN}  ✓ Found ${MIGRATION_COUNT} migration file(s)${NC}"

# Create schema_migrations table if it doesn't exist
echo -e "\n${YELLOW}[3/4] Ensuring schema_migrations table exists...${NC}"
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT NOW()
);
" >/dev/null 2>&1
echo -e "${GREEN}  ✓ Schema migrations table ready${NC}"

# Apply each migration
echo -e "\n${YELLOW}[4/4] Applying migrations...${NC}"
APPLIED_COUNT=0
SKIPPED_COUNT=0
FAILED_COUNT=0

for migration_file in $MIGRATION_FILES; do
    migration_name=$(basename "$migration_file")
    
    # Check if migration already applied
    if docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT 1 FROM schema_migrations WHERE version = '${migration_name}';
    " | grep -q 1; then
        echo -e "  ⏭ Skipping ${migration_name} (already applied)"
        SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
        continue
    fi
    
    # Apply migration
    echo -e "  → Applying ${migration_name}..."
    if docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$migration_file" >/dev/null 2>&1; then
        # Record migration as applied
        docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
            INSERT INTO schema_migrations (version) VALUES ('${migration_name}')
            ON CONFLICT (version) DO NOTHING;
        " >/dev/null 2>&1
        
        echo -e "  ${GREEN}✓${NC} Applied ${migration_name}"
        APPLIED_COUNT=$((APPLIED_COUNT + 1))
    else
        echo -e "  ${RED}✗${NC} Failed to apply ${migration_name}"
        FAILED_COUNT=$((FAILED_COUNT + 1))
        # Continue with other migrations
    fi
done

# Summary
echo -e "\n${GREEN}=== Migration Summary ===${NC}"
echo -e "  Applied:   ${APPLIED_COUNT}"
echo -e "  Skipped:   ${SKIPPED_COUNT}"
echo -e "  Failed:    ${FAILED_COUNT}"
echo -e "  Total:     ${MIGRATION_COUNT}"

if [ $FAILED_COUNT -gt 0 ]; then
    echo -e "\n${RED}⚠ Some migrations failed. Please check the logs above.${NC}"
    exit 1
fi

if [ $APPLIED_COUNT -eq 0 ] && [ $SKIPPED_COUNT -gt 0 ]; then
    echo -e "\n${GREEN}✓ All migrations are already applied${NC}"
fi

echo -e "\n${GREEN}=== Migrations Complete ===${NC}"
