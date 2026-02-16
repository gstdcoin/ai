# Telegram Ascension Protocol

Architecture for Telegram Mini App (TMA) integration, Leviathan Bridge, and Gold UI.

## 1. TMA Integration

**Path:** `frontend/src/pages/tma.tsx`

Main screen for Telegram Mini App:
- **Node Status** — Online / Offline / Mining
- **Hashrate** — Total tasks completed (network throughput)
- **Golden Gate (XAUt)** — Gold reserve balance, USD value
- **Gold Multiplier** — Reward multiplier from Cosmic Genesis (1.0–1.5x)

**URL:** `https://app.gstdtoken.com/tma`

**Bot:** Button "📊 TMA" opens the Mini App.

## 2. Background Worker

**Path:** `frontend/public/workers/inference-worker.js`

Prototype for lightweight inference inside TMA:
- Web Worker (non-blocking)
- Rule-based sentiment classification (no heavy ML libs)
- Message protocol: `{ type: 'inference', payload: { text } }` → `{ type: 'inference_result', result: { score, label } }`

Extensible for transformer.js or WASM models.

## 3. Leviathan Bridge

**Backend:** `backend/internal/api/leviathan_ws.go`

WebSocket endpoint for Leviathan live stream:
- **URL:** `wss://app.gstdtoken.com/api/v1/leviathan/ws`
- **Payload:** `{ type: "leviathan", message: string, timestamp: number }`
- Subscribes to `leviathan.LiveStreamSubscribe()` and broadcasts to all connected clients
- Used by TMA for live ticker, bot can connect for instant notifications

**SSE (existing):** `GET /api/v1/leviathan/stream`

## 4. Gold UI (Golden Gate)

**Bot handlers:**
- `btnGoldenGate` — All users see Treasury, XAUt reserve, work→gold flow
- `btnTreasury` — Admin sees same data (fetched from API)

**API:** `GET /api/v1/stats/public`
- `golden_reserve_xaut` — XAUt balance
- `total_gstd_paid` — GSTD paid to workers
- `total_burned` — Burned supply
- `active_devices_count` — Online workers

**Flow visualization:**
- 70% of platform fees → Gold Reserve
- 2% of every task → XAUt (Tether Gold)
- User's completed tasks fund the reserve
