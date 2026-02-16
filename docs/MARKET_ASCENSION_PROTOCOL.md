# Market Ascension Protocol

First-Query Bonus, Viral Sharing, and Model Comparison for user growth.

## 1. First-Query Bonus

**Backend**: `handler_gateway.go` — new users with connected wallet get 0.05 GSTD (Internal Credit) for their first test request.

- Column: `users.first_query_bonus_used BOOLEAN DEFAULT false`
- When `first_query_bonus_used = false` and fee ≤ 0.05 GSTD: skip deduction, set `first_query_bonus_used = true`
- Covers Tier 1 models (0.01 GSTD) — user gets first request free

**Migration**: `v68_market_ascension.sql`

## 2. Viral Sharing

**Frontend**: `ChatPanel.tsx` — "Поделиться ответом" button on assistant messages.

- Generates share text: "Этот ответ был рассчитан {N} смартфонами в сети GSTD. Присоединяйся и зарабатывай золото! {url}"
- Uses `navigator.share()` when available, else copies to clipboard
- N = actual `swarm_devices` from PoW stats (default 1500)

## 3. Model Comparison Mode

**Frontend**: `ChatPanel.tsx` — "Compare" toggle.

- Select model A and model B (e.g. Llama vs Qwen)
- Send same prompt to both in parallel
- Display results side-by-side with cost and quality comparison
- Shows: model name, content, cost (GSTD), swarm devices, Copy/Share

## Files

| Component | Path |
| --- | --- |
| Migration | `backend/migrations/v68_market_ascension.sql` |
| Gateway | `backend/internal/api/handler_gateway.go` |
| Chat | `frontend/src/components/dashboard/ChatPanel.tsx` |
