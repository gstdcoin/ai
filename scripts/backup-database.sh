#!/bin/bash
# Automated PostgreSQL backup script
# This script creates daily backups of the database

set -e

BACKUP_DIR="/home/ubuntu/backups/postgres"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.sql.gz"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Get container name
CONTAINER_NAME=$(docker ps --filter "ancestor=postgres:15-alpine" --format "{{.Names}}" | head -1)

if [ -z "$CONTAINER_NAME" ]; then
    echo "ERROR: PostgreSQL container not found"
    exit 1
fi

echo "Creating backup: $BACKUP_FILE"

# Create backup
docker exec "$CONTAINER_NAME" pg_dump -U postgres distributed_computing | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "Backup created successfully: $BACKUP_FILE"
    
    # Get backup size
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "Backup size: $BACKUP_SIZE"
    
    # Remove old backups (keep last N days)
    find "$BACKUP_DIR" -name "backup_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete
    echo "Old backups older than $RETENTION_DAYS days removed"
    
    # Verify backup integrity
    if gzip -t "$BACKUP_FILE" 2>/dev/null; then
        echo "Backup integrity verified"
        exit 0
    else
        echo "ERROR: Backup file is corrupted"
        rm -f "$BACKUP_FILE"
        exit 1
    fi
else
    echo "ERROR: Backup failed"
    exit 1
fi


