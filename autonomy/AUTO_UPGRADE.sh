#!/bin/bash
# GSTD System Auto-Upgrade
# Updates Docker images, AI models, and cleans up resources.

set -e

LOG_FILE="/home/ubuntu/autonomy/upgrade_log.txt"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=========================================="
echo "🚀 Auto-Upgrade Started: $(date)"
echo "=========================================="

# 1. Update AI Models
echo "🧠 Upgrade Stage 1: AI Models"
source /home/ubuntu/autonomy/manage_models.sh

# 2. Update System Images
echo "🐳 Upgrade Stage 2: Docker Images"
cd /home/ubuntu/autonomy
docker-compose -f docker-compose.autonomy.yml pull
docker-compose -f docker-compose.autonomy.yml up -d

# 3. Clean up
echo "🧹 Upgrade Stage 3: Cleanup"
docker image prune -f

echo "✅ Upgrade Complete: $(date)"
echo "=========================================="
