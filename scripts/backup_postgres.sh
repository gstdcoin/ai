#!/bin/bash
# GSTD PostgreSQL Backup Script
# Runs daily via cron, keeps 7 days of backups

BACKUP_DIR="/home/ubuntu/backups/postgres"
CONTAINER="gstd_postgres_prod"
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

# Validate: exit code OK AND file larger than 100 bytes (empty gzip = ~20 bytes)
FSIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || echo 0)
if [ $? -eq 0 ] && [ "$FSIZE" -gt 100 ]; then
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
