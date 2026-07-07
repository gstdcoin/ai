# GSTD Oracle — Public API & Demo Design
**Date:** 2026-07-07  
**Approach:** Oracle-first (Phase A)

## Goal
Make the GSTD network demonstrably useful RIGHT NOW by:
1. Verifying the trading bot → gstdbot → Ollama oracle pipeline actually works
2. Adding oracle decision tracking (SQLite) to prove value
3. Exposing a public `POST /api/v1/oracle/evaluate` endpoint
4. Updating `/developers` page with real examples and live stats

## Architecture

### Pipeline (already live)
```
trading_bot/intel/gstd_oracle.py
  → POST http://localhost:8080/api/v1/chat  (gstdbot)
    → Ollama llama3.2:3b  (local)        OR
    → GSTD swarm node     (cloud)
  → parse ENTER/SKIP + confidence
  → gate trade entry
```

### New: Oracle Stats (SQLite)
Table `oracle_decisions` in `data/trades.db`:
- `id, timestamp, symbol, side, enter, confidence, source, latency_ms, reason, trade_id`

New endpoint: `GET /oracle/stats` in trading bot dashboard.

### New: Public Oracle API
`POST /api/v1/oracle/evaluate` on app.gstdtoken.com (Vercel)
- Input: `{symbol, side, strength?, rsi?, btc_trend?, ml_score?, funding_rate?}`
- Auth: `Authorization: Bearer gstd_key_xxx` (enterprise key) OR IP-based free tier (10/day)
- Routes to gstdbot tunnel URL → /api/v1/chat
- Returns: `{enter, confidence, reason, source, latency_ms}`

### Updated: /developers page
- Section: "Real-world demo: AI Trading Oracle"
- Live stats from oracle (total evaluated, accuracy estimate)
- curl example, Python example
- "Get API Key" CTA

## Success Criteria
- [ ] Oracle pipeline verified: logs show real Ollama responses
- [ ] `oracle_decisions` table populated during live trading
- [ ] `POST /api/v1/oracle/evaluate` returns valid JSON in <5s
- [ ] `/developers` shows oracle section with working copy-paste examples
