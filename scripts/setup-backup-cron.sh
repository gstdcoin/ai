#!/bin/bash
# Setup cron job for PostgreSQL backups
# This script cleans up duplicate cron jobs and sets up backup every 12 hours

set -euo pipefail

CRON_USER="${1:-ubuntu}"
BACKUP_SCRIPT="/home/ubuntu/scripts/backup.sh"
CRON_LOG="/home/ubuntu/logs/backup.log"

# Create logs directory if it doesn't exist
mkdir -p "$(dirname "$CRON_LOG")"

# Backup current crontab
if crontab -l > /tmp/crontab_backup_$(date +%Y%m%d_%H%M%S).txt 2>/dev/null; then
    echo "✅ Current crontab backed up"
fi

# Get current crontab
CURRENT_CRON=$(crontab -l 2>/dev/null || echo "")

# Remove duplicate backup tasks
# Remove old backup-database.sh entries (duplicates)
CLEANED_CRON=$(echo "$CURRENT_CRON" | grep -v "backup-database.sh" | grep -v "^$")

# Remove old backup_db.sh entry
CLEANED_CRON=$(echo "$CLEANED_CRON" | grep -v "backup_db.sh" | grep -v "^$")

# Remove monitor.sh (runs every minute - too frequent, use health-check.sh instead)
CLEANED_CRON=$(echo "$CLEANED_CRON" | grep -v "monitor.sh" | grep -v "^$")

# Remove check_gateway.sh (use health-check.sh instead)
CLEANED_CRON=$(echo "$CLEANED_CRON" | grep -v "check_gateway.sh" | grep -v "^$")

# Check if backup.sh already exists in cron
if echo "$CLEANED_CRON" | grep -q "backup.sh"; then
    echo "⚠️  backup.sh already exists in crontab, removing old entry..."
    CLEANED_CRON=$(echo "$CLEANED_CRON" | grep -v "backup.sh" | grep -v "^$")
fi

# Add new backup task (every 12 hours at :00 and :00)
# Format: minute hour day month weekday
# 0 */12 means: at minute 0 of every 12th hour (00:00 and 12:00)
BACKUP_CRON="0 */12 * * * $BACKUP_SCRIPT >> $CRON_LOG 2>&1"

# Combine cleaned cron with new backup task
NEW_CRON=$(echo -e "$CLEANED_CRON\n$BACKUP_CRON")

# Install new crontab
echo "$NEW_CRON" | crontab -

echo "✅ Crontab updated successfully"
echo ""
echo "📋 Current cron jobs:"
crontab -l | grep -v "^#" | grep -v "^$" | nl
echo ""
echo "🔄 Backup will run every 12 hours at 00:00 and 12:00"
echo "📝 Logs: $CRON_LOG"
