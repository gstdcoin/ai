# Eternal Flame Protocol

**Status**: Active  
**Config**: `eternal_flame: true` in `/api/v1/config`

## Overview

Eternal Flame ensures platform resilience, dynamic reward scaling, and financial integrity.

## 1. Global Availability (99.99% Uptime)

- **Node failover**: Every 10 seconds, nodes with `last_seen` older than 30 seconds are marked offline
- **Shard redistribution**: Failed pipeline nodes trigger `HandleNodeFailure` — layers reassigned via `EnsureRedundancy`
- **model_shard_replicas**: Failed node wallets have `is_available = false` so load balancer skips them

## 2. Auto-Scale Rewards

- **Volume threshold**: 10,000 GSTD/hour (settlement_ledger + completed tasks)
- **Action**: When exceeded, worker rewards increase by **+5%**
- **Applied to**: `SettlementService` (proxy inference), `RewardEngine` (task completion)
- **Check interval**: Every 5 minutes

## 3. Archon Oversight

- **Frequency**: Every hour
- **Reconciliation**:
  - `settlement_ledger`: `sum(amount_gstd)` must equal `sum(worker_amount) + sum(treasury_amount) + sum(protocol_amount)`
  - `golden_reserve_log`: Total GSTD logged vs treasury share
  - XAUt backing total
- **Integrity violations**: Logged to `platform_status` as `archon_alert_*`

## Implementation

- **Service**: `backend/internal/services/eternal_flame_service.go`
- **Migration**: `backend/migrations/v70_eternal_flame.sql`
- **Worker boost**: `GetWorkerRewardBoost()` / `SetWorkerRewardBoost()` in `golden_age_service.go`
