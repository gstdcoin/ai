# Genesis Sync Protocol

Ensures database integrity, balance harmonization, and reputation recovery for Zero-Start credit.

## 1. Database Integrity

**Migration**: `v67_zero_start_credit.sql`

- `internal_credit_used INT DEFAULT 0` — 0 = false (no credit used)
- `reputation_bonus INT DEFAULT 0` — bonus points for credit repayment
- `UPDATE users SET internal_credit_used = 0 WHERE internal_credit_used IS NULL` — ensure default

**Apply**: Migrations run at backend startup via `MigrationService.RunMigrations()`.

## 2. Balance Harmonization

**Logic** (in Go): `SettlementService.ProcessPayment()`

When funds arrive in `settlement_ledger` (worker earnings from proxy inference):

1. Check `users.internal_credit_used` for `worker_wallet`
2. If `internal_credit_used >= 1`:
   - Deduct 0.01 GSTD from `worker_amount`
   - Reset `internal_credit_used = 0`
   - Grant `reputation_bonus += 5`
3. Insert into `settlement_ledger` with net `worker_amount`

## 3. Reputation Recovery

**Trigger**: When internal credit is repaid (step 2 above)

**Effect**: `reputation_bonus += 5` — "Успешное выполнение обязательств"

**Usage**: `AgentRatingService.GetRating()` includes `reputation_bonus` in the final score (capped at 100).

## Files

| Component | Path |
| --- | --- |
| Migration | `backend/migrations/v67_zero_start_credit.sql` |
| Settlement + credit repayment | `backend/internal/services/settlement_service.go` |
| Rating + reputation_bonus | `backend/internal/services/agent_rating_service.go` |
