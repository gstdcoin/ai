# Eternal Synergy Protocol

Final status for symbiotic protection and transparency of the GSTD Swarm.

## 1. Reputation Shield

**Protection against resource attacks from low-rated agents.**

When an agent with reliability rating < 30 attempts inference:
- **2x fee** is applied (base inference fee × 2)
- Fee is deducted from `users.balance` before processing
- If insufficient balance → **402 Payment Required** with `required_fee`

**Identification**: Requester wallet from headers:
- `X-Wallet-Address`
- `X-GSTD-Target-Wallet`

**Implementation**: `UniversalMeshService.Infer()` checks `AgentRatingService.GetRating()`; when rating < 30, deducts 2× fee from `users.balance`.

## 2. Leaderboard Transparency

**Weekly Top-10 Agents by GSTD economy contribution.**

**Endpoint**: `GET /api/v1/admin/agents/leaderboard?limit=10`  
**Auth**: Admin wallet (RequireAdminWallet)

**Contribution** = last 7 days:
- `settlement_ledger.worker_amount` (worker earnings)
- `referral_rewards.amount_gstd` (referrer earnings, pending+paid)

**Response**:
```json
{
  "leaderboard": [
    {"rank": 1, "wallet": "EQ...", "total_gstd": 12.5, "period": "7d"}
  ],
  "period": "7d",
  "updated_at": "2026-02-14T..."
}
```

## 3. Automatic Payout Integration

**Referrers receive rewards in the same Payout Waves as workers.**

When a Payout Wave is triggered (10 GSTD threshold or 7 days):
1. **Workers**: `settlement_ledger` → mark paid, `payout_wave_id`
2. **Referrers**: `referral_rewards` (status=pending) → credit `users.balance`, mark paid, `payout_wave_id`

**Schema**:
- `referral_rewards.payout_wave_id` — links to wave
- `settlement_payout_waves.referral_gstd`, `referrer_count` — audit

**Trigger**: Wave runs when either workers or referrers have ≥10 GSTD pending, or 7 days since last wave.
