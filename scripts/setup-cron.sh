#!/bin/bash
# Setup cron jobs for automated backups and health checks

set -e

CRON_DIR="/home/ubuntu/cron"
mkdir -p "$CRON_DIR"

# Create cron job for daily backups at 2 AM
echo "0 2 * * * /home/ubuntu/scripts/backup-database.sh >> /home/ubuntu/logs/backup.log 2>&1" > "$CRON_DIR/backup.cron"

# Create cron job for health checks every 5 minutes
echo "*/5 * * * * /home/ubuntu/scripts/health-check.sh >> /home/ubuntu/logs/health.log 2>&1" > "$CRON_DIR/health.cron"

# Create cron job for auto-recovery every 15 minutes
echo "*/15 * * * * /home/ubuntu/scripts/auto-recovery.sh >> /home/ubuntu/logs/recovery.log 2>&1" > "$CRON_DIR/recovery.cron"

# Create cron job for automatic rebuild every 6 hours
echo "0 */6 * * * /home/ubuntu/scripts/auto-rebuild.sh >> /home/ubuntu/logs/auto-rebuild.log 2>&1" > "$CRON_DIR/auto-rebuild.cron"

# Install cron jobs
echo "Installing cron jobs..."
crontab -l > "$CRON_DIR/current.cron" 2>/dev/null || true
cat "$CRON_DIR"/*.cron >> "$CRON_DIR/current.cron" 2>/dev/null || true
crontab "$CRON_DIR/current.cron"

echo "Cron jobs installed:"
crontab -l | grep -E "backup|health|recovery"

echo ""
echo "Cron jobs setup complete!"

