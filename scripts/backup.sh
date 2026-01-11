#!/bin/bash
# Database backup script for GSTD Platform

set -e

BACKUP_DIR="${BACKUP_DIR:-./backups/postgres}"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting database backup..."

# Create backup
docker-compose exec -T postgres pg_dump -U postgres distributed_computing | gzip > "$BACKUP_DIR/backup_$DATE.sql.gz"

# Remove old backups
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "[$(date)] Backup completed: backup_$DATE.sql.gz"
echo "[$(date)] Old backups (older than $RETENTION_DAYS days) removed"
