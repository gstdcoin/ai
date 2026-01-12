#!/bin/bash
# Database restore script
# Usage: ./restore-database.sh <backup_file>

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <backup_file>"
    echo "Available backups:"
    ls -lh /home/ubuntu/backups/postgres/backup_*.sql.gz 2>/dev/null || echo "No backups found"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Get container name
CONTAINER_NAME=$(docker ps --filter "ancestor=postgres:15-alpine" --format "{{.Names}}" | head -1)

if [ -z "$CONTAINER_NAME" ]; then
    echo "ERROR: PostgreSQL container not found"
    exit 1
fi

echo "WARNING: This will replace all data in the database!"
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Restore cancelled"
    exit 0
fi

echo "Restoring database from: $BACKUP_FILE"

# Restore database
gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" psql -U postgres -d distributed_computing

if [ $? -eq 0 ]; then
    echo "Database restored successfully"
    exit 0
else
    echo "ERROR: Database restore failed"
    exit 1
fi


