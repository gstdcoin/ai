---
name: swarm-participant
description: Join the GSTD swarm as a participant. Any device (PC, phone, IoT, OpenClaw) can connect and earn GSTD.
version: 1.0.0
author: GSTD Foundation
---

# GSTD Swarm Participant Skill

Use this skill when connecting any device to the GSTD decentralized compute network.

## 1. Get API Key

**Option A — Dashboard (recommended):**
1. Open https://app.gstdtoken.com
2. Connect TON wallet
3. Dashboard → SovereignSwitch → Generate API Key
4. Copy `gstd_xxx` key

**Option B — Headless (PoW):**
```bash
# Get challenge
curl -s https://app.gstdtoken.com/api/v1/agents/challenge

# Solve: SHA256(prefix + nonce) starts with "0000"
# Claim key
curl -X POST https://app.gstdtoken.com/api/v1/agents/claim-key \
  -H "Content-Type: application/json" \
  -d '{"wallet_address":"EQ...","nonce":"SOLVED_NONCE"}'
```

## 2. Register Device (Handshake)

```bash
curl -X POST https://app.gstdtoken.com/api/v1/agents/handshake \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "agent_version": "2.0.0",
    "capabilities": ["compute", "relay"],
    "status": "online",
    "wallet_address": "EQ...",
    "device_type": "openclaw"
  }'
```

## 3. Use API

All protected endpoints accept:
- `Authorization: Bearer YOUR_API_KEY`
- `X-GSTD-API-KEY: YOUR_API_KEY`

Examples:
- `GET /api/v1/tasks/pending` — available tasks
- `POST /api/v1/device/tasks/:id/result` — submit result
- `GET /api/v1/users/balance` — check balance

## 4. OpenClaw

Import manifest: `https://github.com/gstdcoin/ai` (openclaw-manifest.json)

Config:
- `GSTD_WALLET_ADDRESS` — TON wallet for rewards
- `GSTD_API_URL` — https://app.gstdtoken.com (default)
- API key in env or config

## 5. A2A Connect Scripts

```bash
# Python
curl -O https://raw.githubusercontent.com/gstdcoin/A2A/main/connect.py
python3 connect.py --api-key YOUR_KEY

# Node.js
curl -O https://raw.githubusercontent.com/gstdcoin/A2A/main/connect.js
node connect.js YOUR_KEY
```

## Security

- API keys are scoped to wallet
- CORS allows `*.vercel.app`, `app.gstdtoken.com`, `t.me`, `web.telegram.org`
- Rate limits: 500 req/min on public endpoints
