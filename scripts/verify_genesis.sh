#!/bin/bash
# Genesis Network Verification Script
# Verifies that the system correctly handles concurrent operations

echo "=========================================="
echo "GSTD Platform Genesis Verification"
echo "=========================================="
echo ""

# Check database for completed tasks
echo "[1] Checking completed tasks..."
docker exec -it gstd_db psql -U postgres -d distributed_computing -c "
SELECT 
    COUNT(*) as total_completed,
    SUM(budget_gstd) as total_budget,
    SUM(reward_gstd) as total_rewards,
    SUM(platform_fee_ton) as total_fees
FROM tasks 
WHERE status = 'completed';
"

echo ""
echo "[2] Verifying 95/5 split..."
docker exec -it gstd_db psql -U postgres -d distributed_computing -c "
SELECT 
    task_id,
    budget_gstd,
    reward_gstd,
    platform_fee_ton,
    CASE 
        WHEN ABS(reward_gstd - (budget_gstd * 0.95)) < 0.0001 THEN '✓ Correct'
        ELSE '✗ Incorrect'
    END as reward_check,
    CASE 
        WHEN ABS(platform_fee_ton - (budget_gstd * 0.05)) < 0.0001 THEN '✓ Correct'
        ELSE '✗ Incorrect'
    END as fee_check
FROM tasks 
WHERE status = 'completed'
ORDER BY completed_at DESC
LIMIT 10;
"

echo ""
echo "[3] Checking for double-spending (duplicate completions)..."
docker exec -it gstd_db psql -U postgres -d distributed_computing -c "
SELECT task_id, COUNT(*) as completion_count
FROM tasks
WHERE status = 'completed'
GROUP BY task_id
HAVING COUNT(*) > 1;
"

echo ""
echo "[4] Checking Golden Reserve accumulation..."
docker exec -it gstd_db psql -U postgres -d distributed_computing -c "
SELECT 
    COUNT(*) as total_accumulations,
    SUM(gstd_amount) as total_gstd_accumulated,
    SUM(COALESCE(xaut_amount, 0)) as total_xaut_accumulated
FROM golden_reserve_log;
"

echo ""
echo "[5] Checking failed payouts..."
docker exec -it gstd_db psql -U postgres -d distributed_computing -c "
SELECT 
    COUNT(*) as pending_retries,
    SUM(amount_gstd) as total_failed_amount
FROM failed_payouts
WHERE status = 'pending' AND retry_count < max_retries;
"

echo ""
echo "[6] System Health Check..."
curl -s http://localhost:8080/api/v1/admin/health | python3 -m json.tool || echo "Health endpoint not accessible"

echo ""
echo "=========================================="
echo "Verification Complete"
echo "=========================================="

