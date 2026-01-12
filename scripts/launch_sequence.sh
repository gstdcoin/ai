#!/bin/bash
# GSTD Platform - Mainnet Launch Sequence
# This script performs the complete launch sequence for production

set -e

echo "=========================================="
echo "GSTD Platform - Mainnet Launch Sequence"
echo "=========================================="
echo ""
echo "⚠️  WARNING: This will reset the database and deploy to production!"
echo ""
read -p "Are you ready to launch? Type 'LAUNCH' to continue: " confirmation

if [ "$confirmation" != "LAUNCH" ]; then
    echo "Launch aborted."
    exit 1
fi

LAUNCH_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo ""
echo "Launch initiated at: $LAUNCH_TIMESTAMP"
echo ""

# Step 1: Database Cleanup
echo "[1/5] Cleaning database for production..."
./scripts/production_ready.sh <<< "YES"
echo "✅ Database cleaned"

# Step 2: Verify Environment
echo ""
echo "[2/5] Verifying environment configuration..."
if [ -z "$ADMIN_SECRET" ]; then
    echo "⚠️  WARNING: ADMIN_SECRET not set in environment"
    echo "   Please set it in .env file"
fi

if [ "$GIN_MODE" != "release" ]; then
    echo "⚠️  WARNING: GIN_MODE is not set to 'release'"
    echo "   Current: $GIN_MODE"
    echo "   Recommended: release"
fi

if [ "$TON_NETWORK" != "mainnet" ]; then
    echo "⚠️  WARNING: TON_NETWORK is not 'mainnet'"
    echo "   Current: $TON_NETWORK"
    exit 1
fi

echo "✅ Environment verified"

# Step 3: Build Frontend
echo ""
echo "[3/5] Building frontend for production..."
docker compose build frontend
echo "✅ Frontend built"

# Step 4: Restart Infrastructure
echo ""
echo "[4/5] Restarting infrastructure..."
docker compose down
docker compose up -d --force-recreate
echo "✅ Infrastructure restarted"

# Step 5: Health Check
echo ""
echo "[5/5] Performing health checks..."
sleep 5

# Check backend
if curl -f -s http://localhost:8080/api/v1/stats/public > /dev/null; then
    echo "✅ Backend health check passed"
else
    echo "❌ Backend health check failed"
    exit 1
fi

# Check SSL (if available)
if curl -f -s -I https://app.gstdtoken.com > /dev/null 2>&1; then
    echo "✅ SSL certificate valid"
else
    echo "⚠️  SSL check skipped (may not be configured locally)"
fi

echo ""
echo "=========================================="
echo "✅ LAUNCH SEQUENCE COMPLETE"
echo "=========================================="
echo ""
echo "System is ready for mainnet operations."
echo "Launch timestamp: $LAUNCH_TIMESTAMP"
echo ""
echo "Next steps:"
echo "1. Connect mainnet wallet"
echo "2. Register first node"
echo "3. Create first task"
echo "4. Process and verify XAUt swap"
echo ""

