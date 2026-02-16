# GSTD Platform — Verification: Bot, Agents, Nodes

**Date:** 2026-02-15

## 1. Telegram Bot ↔ Backend

### Architecture

| Component | Location | Role |
|-----------|----------|------|
| **Backend Webhook** | `POST /api/v1/telegram/webhook` | Receives updates from Telegram (when webhook is set) |
| **Backend Bot API** | `/api/v1/telegram/bot/*` | Link, balance, nodes, claim, complete (X-Bot-Token) |
| **Autonomy Bot** | `autonomy/bot/main.go` | Long-polling bot; calls backend API |

### Webhook vs Long Polling (Conflict)

- **Webhook** (`set_telegram_webhook.sh`): Telegram sends ALL updates to `https://app.gstdtoken.com/api/v1/telegram/webhook`
- **Long Polling** (autonomy bot): Bot pulls updates from Telegram API

**⚠️ These are mutually exclusive.** If webhook is set, the autonomy bot receives NO updates.

### Backend Webhook Handlers (TelegramService.ProcessWebhook)

- `/start` — Welcome, Mining, Web App links
- `/start mining` — Wallet-as-Node flow
- `/help` — User guide
- `/network` — Network stats
- `/status`, `/balance`, `/admin` — Admin only
- Callbacks: `public_about`, `public_stats`, `admin_status`, `admin_balance`, `admin_pending`
- Stars payment (XTR buyback)

### Autonomy Bot Handlers (require Long Polling)

- `/connect <wallet>` — Link wallet
- `/take <task_id>` — Claim task
- `/complete <task_id> ...` — Submit result
- Buttons: Balance, Golden Gate, Nodes, Market, Referrals
- `/ask <query>` — AI (Ollama/DeepSeek)

### Bot API Endpoints (Backend)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/v1/telegram/bot/link` | POST | X-Bot-Token | Link telegram_id ↔ wallet |
| `/api/v1/telegram/bot/balance` | GET | X-Bot-Token | Balance for telegram_id |
| `/api/v1/telegram/bot/nodes` | GET | X-Bot-Token | Devices (tg-{id}) |
| `/api/v1/telegram/bot/claim` | POST | X-Bot-Token | Claim marketplace task |
| `/api/v1/telegram/bot/complete` | POST | X-Bot-Token | Complete task |

### Bot → Backend URL

- **Docker:** `API_URL=http://ubuntu-backend-blue-1:8080` (same network `ubuntu_gstd_network`)
- **BOT_API_KEY** = TELEGRAM_BOT_TOKEN (for X-Bot-Token header)

### Status

| Check | Result |
|-------|--------|
| Bot container | ✅ gstd_bot on ubuntu_gstd_network |
| Backend reachable from bot | ✅ ubuntu-backend-blue-1:8080 |
| Bot API routes | ⚠️ 404 on host (127.0.0.1:8080) — host backend may be old build |
| Webhook | Set to backend URL — autonomy bot commands won't work |

### Recommendation

1. **Option A (Webhook):** Extend `ProcessWebhook` to handle `/connect`, `/take`, `/complete`, balance, nodes — proxy to same logic as TelegramBotHandler.
2. **Option B (Long Polling):** Remove webhook (`deleteWebhook`), run autonomy bot only — full task flow works.
3. **Host backend:** Restart `/home/ubuntu/backend/server` after `go build` to load new routes.

---

## 2. Agents (A2A, OpenClaw) ↔ Backend

### Genesis (A2A)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/genesis/beacon` | Discovery, protocol info |
| `POST /api/v1/genesis/ignite` | Session token for wallet |
| `POST /api/v1/genesis/registry/register` | Register service |
| `GET /api/v1/genesis/registry/discover` | List services |
| `POST /api/v1/genesis/model-update` | Submit model update |

**Status:** ✅ `GET /api/v1/genesis/beacon` — 200 OK

### OpenClaw (JSON-RPC for Robots)

| Method | Purpose |
|--------|---------|
| `claw.register` | Register agent |
| `claw.heartbeat` | Keep agent online |
| `claw.status` | Get agent status |
| `claw.getAvailableTasks` | List open tasks |
| `claw.claimTask` | Claim task |
| `claw.submitResult` | Submit result |
| `claw.think` | Inference (planning) |
| `claw.vision` | Image analysis |
| `claw.getNetworkStats` | Network stats |

**Status:** ✅ `claw.getNetworkStats` — 200 OK

**Note:** `find_work` is not a valid method; use `claw.getAvailableTasks`.

### A2A Python SDK

- `gstd_skill_pkg`, `A2A/python-sdk` — `GSTDClient`, `GSTDWallet`
- `GSTD_API_URL` default: `https://app.gstdtoken.com`
- Agent container: `gstd_agent` on `ubuntu_gstd_network`

---

## 3. Nodes / Devices ↔ Backend

### Nodes (Full Registration)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/nodes/register` | Register node (wallet_address, name, specs) |
| `POST /api/v1/nodes/activate-wallet` | Wallet-as-Node (session) |
| `GET /api/v1/nodes/my` | My nodes |
| `GET /api/v1/nodes/public` | Public active nodes |
| `POST /api/v1/nodes/heartbeat` | Update health (battery, signal, lat/lon) |
| `POST /api/v1/nodes/fleet/command` | Fleet command |
| `GET /api/v1/nodes/maintenance-alerts` | Maintenance alerts |

### Devices (Workers)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/devices/register` | Register device (session) |
| `GET /api/v1/devices` | Get devices |
| `GET /api/v1/devices/my` | My devices |

### Telegram Bot "My Nodes"

- Uses `devices` table, `device_id = tg-{telegram_id}`
- Device registration: via install script or dashboard
- Heartbeat: `device_service.UpdateDeviceHeartbeat` updates `last_seen_at`

### Install Script

- `frontend/public/install.sh` — `genesis_ignite`, `register_node`
- `PLATFORM_URL = https://app.gstdtoken.com/api/v1`

---

## 4. Quick Verification Commands

```bash
# Health
curl -sk https://app.gstdtoken.com/api/v1/health
# Genesis
curl -sk https://app.gstdtoken.com/api/v1/genesis/beacon
# OpenClaw
curl -sk -X POST https://app.gstdtoken.com/api/v1/openclaw/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"claw.getNetworkStats","params":{},"id":1}'
# Bot API (requires BOT_API_KEY)
curl -sk "https://app.gstdtoken.com/api/v1/telegram/bot/balance?telegram_id=123" \
  -H "X-Bot-Token: $TELEGRAM_BOT_TOKEN"
# Marketplace
curl -sk "https://app.gstdtoken.com/api/v1/marketplace/tasks?limit=1"
```

---

## 5. Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Genesis | ✅ OK | Beacon, ignite, registry |
| OpenClaw | ✅ OK | Use claw.* methods |
| Marketplace | ✅ OK | Tasks, stats |
| Bot API | ⚠️ | 404 on host; ensure backend restart |
| Webhook vs Bot | ⚠️ | Choose one; extend webhook or use bot only |
