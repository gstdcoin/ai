#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# OPTIONAL — copy local Postgres backups off-site via rsync over SSH.
# Copy to backup-offsite-rsync.sh, chmod +x, set vars, add to cron AFTER backup_postgres.sh.
#
# Required on host: ssh key to remote, rsync, remote directory writable.
# Env (export or prefix the cron line):
#   BACKUP_OFFSITE_HOST=user@backup.example.com
#   BACKUP_OFFSITE_PATH=/backups/gstd-postgres/
#   BACKUP_LOCAL_DIR=/home/ubuntu/backups/postgres
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

BACKUP_LOCAL_DIR="${BACKUP_LOCAL_DIR:-/home/ubuntu/backups/postgres}"
BACKUP_OFFSITE_HOST="${BACKUP_OFFSITE_HOST:-}"
BACKUP_OFFSITE_PATH="${BACKUP_OFFSITE_PATH:-}"

if [[ -z "$BACKUP_OFFSITE_HOST" ]] || [[ -z "$BACKUP_OFFSITE_PATH" ]]; then
  echo "backup-offsite: set BACKUP_OFFSITE_HOST and BACKUP_OFFSITE_PATH" >&2
  exit 1
fi

if [[ ! -d "$BACKUP_LOCAL_DIR" ]]; then
  echo "backup-offsite: missing $BACKUP_LOCAL_DIR" >&2
  exit 1
fi

rsync -avz --delete-after \
  "$BACKUP_LOCAL_DIR/" \
  "${BACKUP_OFFSITE_HOST}:${BACKUP_OFFSITE_PATH}"

echo "backup-offsite: synced $(date -u +%Y-%m-%dT%H:%M:%SZ)"
