#!/bin/bash
# PostgreSQL Backup Script for DePIN Platform
# Creates compressed database backups with retention policy
# 
# Usage: ./scripts/backup.sh
# Cron: 0 */12 * * * /home/ubuntu/scripts/backup.sh >> /home/ubuntu/logs/backup.log 2>&1

set -euo pipefail

# Configuration
BACKUP_DIR="/home/ubuntu/backups"
RETENTION_DAYS=14  # Keep backups for 14 days
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/postgres_backup_${TIMESTAMP}.sql.gz"
LOG_FILE="${BACKUP_DIR}/backup.log"

# Database configuration (from docker-compose.yml)
DB_NAME="distributed_computing"
DB_USER="postgres"
CONTAINER_NAME="gstd_postgres"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    log_error "Docker is not running"
    exit 1
fi

# Check if PostgreSQL container is running
if ! docker ps --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    # Try to find container by name pattern
    CONTAINER_NAME=$(docker ps --format "{{.Names}}" | grep -i postgres | head -1)
    if [ -z "$CONTAINER_NAME" ]; then
        log_error "PostgreSQL container not found"
        exit 1
    else
        log_warning "Using container: $CONTAINER_NAME"
    fi
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

log "Starting PostgreSQL backup..."
log "Container: $CONTAINER_NAME"
log "Database: $DB_NAME"
log "Backup file: $BACKUP_FILE"

# Create backup using pg_dump
if docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl 2>/dev/null | gzip > "$BACKUP_FILE"; then
    # Check if backup file was created and is not empty
    if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
        BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        log_success "Backup created successfully: $BACKUP_FILE"
        log "Backup size: $BACKUP_SIZE"
        
        # Verify backup integrity
        if gzip -t "$BACKUP_FILE" 2>/dev/null; then
            log_success "Backup integrity verified"
        else
            log_error "Backup file is corrupted"
            rm -f "$BACKUP_FILE"
            exit 1
        fi
        
        # Remove old backups (keep last N days)
        OLD_BACKUPS=$(find "$BACKUP_DIR" -name "postgres_backup_*.sql.gz" -type f -mtime +$RETENTION_DAYS 2>/dev/null | wc -l)
        if [ "$OLD_BACKUPS" -gt 0 ]; then
            find "$BACKUP_DIR" -name "postgres_backup_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete
            log "Removed $OLD_BACKUPS old backup(s) older than $RETENTION_DAYS days"
        fi
        
        # List current backups
        BACKUP_COUNT=$(find "$BACKUP_DIR" -name "postgres_backup_*.sql.gz" -type f | wc -l)
        TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
        log "Total backups: $BACKUP_COUNT"
        log "Total backup size: $TOTAL_SIZE"
        
        exit 0
    else
        log_error "Backup file is empty or was not created"
        rm -f "$BACKUP_FILE"
        exit 1
    fi
else
    log_error "Backup failed - pg_dump command failed"
    rm -f "$BACKUP_FILE"
    exit 1
fi
