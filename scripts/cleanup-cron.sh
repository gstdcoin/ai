#!/bin/bash
# Cleanup duplicate cron jobs
# Removes duplicates and keeps only unique entries

set -euo pipefail

# Backup current crontab
BACKUP_FILE="/tmp/crontab_backup_$(date +%Y%m%d_%H%M%S).txt"
if crontab -l > "$BACKUP_FILE" 2>/dev/null; then
    echo "✅ Current crontab backed up to: $BACKUP_FILE"
fi

# Get current crontab
CURRENT_CRON=$(crontab -l 2>/dev/null || echo "")

# Remove empty lines and comments
CLEANED_CRON=$(echo "$CURRENT_CRON" | grep -v "^#" | grep -v "^$")

# Remove duplicates using sort -u (keeps only unique lines)
UNIQUE_CRON=$(echo "$CLEANED_CRON" | sort -u)

# Install cleaned crontab
echo "$UNIQUE_CRON" | crontab -

echo "✅ Crontab cleaned successfully"
echo ""
echo "📋 Current cron jobs (unique):"
crontab -l | grep -v "^#" | grep -v "^$" | nl || echo "No cron jobs found"
