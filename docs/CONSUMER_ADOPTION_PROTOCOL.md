# Consumer Adoption Protocol

Unified payment, cost transparency, staking incentives, and public Proof-of-Work for chat inference.

## 1. Unified Payment Gateway

**Backend**: `handler_gateway.go` — every chat request:

- Requires wallet (402 if not connected)
- Deducts GSTD before inference (from `gstd_balance` or `balance`)
- Records via `SettlementService.ProcessPayment()` (85% worker pool, 10% treasury, 5% protocol)
- `worker_wallet = "platform_consumer"` for direct Ollama (no proxy node)

**Cost per model**:
- Tier 1 (7b, 8b): 0.01 GSTD
- Tier 2 (32b): 0.05 GSTD
- Ultra (70b, DeepSeek-R1): 1.0 GSTD

## 2. Easy-Onboarding: Cost Indicator

**Frontend**: `ChatPanel.tsx` — before sending:

- Shows: "Cost: X.XX GSTD" for selected model
- Uses `cost_per_model` from `/api/v1/chat/ultra-status`
- Shows "(−10%)" when staking discount applies

## 3. Staking-for-Access

**Mechanic**: If user holds > 1000 GSTD (balance + frozen), 10% discount on inference.

**Backend**: Applied in `HandleChatCompletions` before deduction.

**API**: `GetUltraStatus` returns `staking_discount: true` and adjusted `cost_per_model`.

## 4. Public Proof-of-Work

**Response**: `gstd_pow` in chat response:

```json
{
  "gstd_pow": {
    "swarm_devices": 1200,
    "workers_gstd": 0.85,
    "fee_deducted": 1.0
  }
}
```

**Frontend**: Message footer shows: "🐝 1200 devices • 0.85 GSTD → workers"

## Files

| Component | Path |
| --- | --- |
| Gateway handler | `backend/internal/api/handler_gateway.go` |
| Chat panel | `frontend/src/components/dashboard/ChatPanel.tsx` |
| Settlement | `backend/internal/services/settlement_service.go` |
| Routes | `backend/internal/api/routes.go` |
