#!/bin/bash

# Exit on any error
set -e

echo "🚀 Starting DevOps Clean Install..."

# 1. Update Codebase
echo "📥 Pulling latest changes from Git..."
git reset --hard
git pull origin main

# 2. Cleanup Docker Environment
echo "🧹 Cleaning up Docker environment..."
# Stop containers
docker compose -f docker-compose.prod.yml down --remove-orphans || true

# Remove specific images to force rebuild
echo "🗑️ Removing application images..."
docker rmi gstd-frontend:latest gstd-backend:latest 2>/dev/null || true

# Prune unused data (be careful with this in production, but user requested clean slate)
echo "♻️ Pruning system (unused images/containers)..."
docker system prune -af

# 3. Build & Deploy
echo "🏗️ Building new production images..."
docker compose -f docker-compose.prod.yml build --no-cache

echo "🚀 Starting services..."
docker compose -f docker-compose.prod.yml up -d

echo "✅ Deployment Complete!"
echo "📡 Checking Health..."
sleep 10
curl -k -f https://localhost/api/v1/health || echo "⚠️ Warning: Health check failed, please check logs."
