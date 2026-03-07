#!/bin/bash
# GSTD PostgreSQL Backup Script
# Runs daily via cron, keeps 7 days of backups

BACKUP_DIR="/home/ubuntu/backups/postgres"
CONTAINER="c36f1de342a7_gstd_postgres_prod"
DB_NAME="distributed_computing"
DB_USER="postgres"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/gstd_${DATE}.sql.gz"
KEEP_DAYS=7

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Dump and compress
echo "[$(date)] Starting PostgreSQL backup..."
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ] && [ -s "$BACKUP_FILE" ]; then
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "[$(date)] ✅ Backup complete: $BACKUP_FILE ($SIZE)"
    
    # Remove old backups
    find "$BACKUP_DIR" -name "gstd_*.sql.gz" -mtime +$KEEP_DAYS -delete
    echo "[$(date)] Cleaned backups older than $KEEP_DAYS days"
else
    echo "[$(date)] ❌ Backup FAILED"
    rm -f "$BACKUP_FILE"
    exit 1
fi
