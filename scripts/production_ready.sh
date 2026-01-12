#!/bin/bash
# Production Ready Script - Clean Database for Mainnet Launch
# WARNING: This will delete ALL data. Use only before mainnet launch.

set -e

echo "=========================================="
echo "GSTD Platform - Production Ready Script"
echo "=========================================="
echo ""
echo "⚠️  WARNING: This script will DELETE ALL DATA from the database!"
echo "This should only be run before the official mainnet launch."
echo ""
read -p "Are you sure you want to proceed? Type 'YES' to continue: " confirmation

if [ "$confirmation" != "YES" ]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "Starting database cleanup..."

# Get database connection details
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-distributed_computing}"

# Truncate all tables (in correct order to respect foreign keys)
echo "[1] Truncating tables..."

docker exec -i gstd_db psql -U postgres -d distributed_computing <<EOF
-- Disable foreign key checks temporarily
SET session_replication_role = 'replica';

-- Truncate tables (order matters for foreign keys)
TRUNCATE TABLE golden_reserve_log CASCADE;
TRUNCATE TABLE failed_payouts CASCADE;
TRUNCATE TABLE withdrawal_locks CASCADE;
TRUNCATE TABLE task_assignments CASCADE;
TRUNCATE TABLE tasks CASCADE;
TRUNCATE TABLE nodes CASCADE;
TRUNCATE TABLE users CASCADE;

-- Re-enable foreign key checks
SET session_replication_role = 'origin';

-- Reset sequences
ALTER SEQUENCE IF EXISTS golden_reserve_log_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS failed_payouts_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS withdrawal_locks_id_seq RESTART WITH 1;

-- Verify tables are empty
SELECT 
    'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'nodes', COUNT(*) FROM nodes
UNION ALL
SELECT 'tasks', COUNT(*) FROM tasks
UNION ALL
SELECT 'failed_payouts', COUNT(*) FROM failed_payouts
UNION ALL
SELECT 'golden_reserve_log', COUNT(*) FROM golden_reserve_log
UNION ALL
SELECT 'withdrawal_locks', COUNT(*) FROM withdrawal_locks;
EOF

echo ""
echo "✅ Database cleanup complete!"
echo ""
echo "The database is now ready for mainnet launch."
echo "The first transaction will be Launch Transaction #1."
echo ""
echo "Next steps:"
echo "1. Verify .env has mainnet addresses configured"
echo "2. Restart backend service"
echo "3. Connect mainnet wallet"
echo "4. Create first task"
echo ""

