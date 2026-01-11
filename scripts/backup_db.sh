#!/bin/bash

# GSTD Platform Database Backup Script
# Creates compressed backups with 7-day rotation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Configuration
BACKUP_DIR="/home/ubuntu/backups"
DB_NAME="distributed_computing"
DB_USER="postgres"
DB_CONTAINER="ubuntu_postgres_1"
RETENTION_DAYS=7

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== GSTD Database Backup ===${NC}\n"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Generate backup filename with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/gstd_db_${TIMESTAMP}.sql.gz"

echo -e "${YELLOW}[1/3] Creating database backup...${NC}"

# Check if PostgreSQL container is running
if ! docker ps --format "{{.Names}}" | grep -q "^${DB_CONTAINER}$"; then
    echo -e "${RED}ERROR: PostgreSQL container '${DB_CONTAINER}' is not running${NC}"
    exit 1
fi

# Create backup using pg_dump
echo -e "  Dumping database '${DB_NAME}'..."
if docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" | gzip > "$BACKUP_FILE"; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}  ✓ Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})${NC}"
else
    echo -e "${RED}  ✗ Backup failed${NC}"
    exit 1
fi

# Rotate old backups (keep last 7 days)
echo -e "\n${YELLOW}[2/3] Rotating old backups (keeping last ${RETENTION_DAYS} days)...${NC}"
DELETED_COUNT=0
CURRENT_TIME=$(date +%s)

for backup in "$BACKUP_DIR"/gstd_db_*.sql.gz; do
    if [ -f "$backup" ]; then
        # Get file modification time
        FILE_TIME=$(stat -c %Y "$backup")
        AGE_DAYS=$(( (CURRENT_TIME - FILE_TIME) / 86400 ))
        
        if [ $AGE_DAYS -gt $RETENTION_DAYS ]; then
            echo -e "  Deleting old backup: $(basename "$backup") (${AGE_DAYS} days old)"
            rm -f "$backup"
            DELETED_COUNT=$((DELETED_COUNT + 1))
        fi
    fi
done

if [ $DELETED_COUNT -eq 0 ]; then
    echo -e "${GREEN}  ✓ No old backups to delete${NC}"
else
    echo -e "${GREEN}  ✓ Deleted ${DELETED_COUNT} old backup(s)${NC}"
fi

# List current backups
echo -e "\n${YELLOW}[3/3] Current backups:${NC}"
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/gstd_db_*.sql.gz 2>/dev/null | wc -l)
if [ $BACKUP_COUNT -eq 0 ]; then
    echo -e "  No backups found"
else
    ls -lh "$BACKUP_DIR"/gstd_db_*.sql.gz | tail -5 | while read -r line; do
        echo -e "  ${line}"
    done
    echo -e "${GREEN}  ✓ Total backups: ${BACKUP_COUNT}${NC}"
fi

echo -e "\n${GREEN}=== Backup Complete ===${NC}"
echo -e "Backup location: ${BACKUP_FILE}"
echo -e "Retention: ${RETENTION_DAYS} days"
