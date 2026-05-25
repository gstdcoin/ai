---
description: Current ecosystem state — always read FIRST before any changes
---

# GSTD Ecosystem State (ALWAYS READ FIRST)

> ⚠️ **MANDATORY**: Before making ANY code changes, deployment, or fixes —
> read this file to understand current versions, architecture, and active services.
> After ANY deployment — update this file.

## 🏗️ Architecture

```
gstdcoin/ai          (this repo) — Vercel serverless + Next.js dashboard
gstdcoin/gstdbot     — Node OS: Pi node + Telegram bot (TypeScript)
gstdcoin/web         — Landing page (Next.js, Vercel)
gstdcoin/contracts   — TON smart contracts (Tact)
gstdcoin/gstd-bridge — Cross-chain bridge (Rust)
```

### Deployment

| Service | Host | URL |
|---|---|---|
| Dashboard + API | Vercel (free) | `app.gstdtoken.com` |
| Landing page | Vercel (free) | `gstdtoken.com` |
| Bootstrap node | Raspberry Pi | `gstd-pi-bootstrap` |
| State storage | Upstash Redis (KV) | via `UPSTASH_REDIS_REST_*` |
| AI inference | GSTD node network | `app.gstdtoken.com/api/v1/chat/completions` |

## 📁 Repo Structure (gstdcoin/ai)

```
frontend/                      # Next.js app (Vercel)
├── src/pages/                 # UI pages (chat, nodes, bridge, staking…)
├── src/pages/api/v1/
│   ├── nodes/
│   │   ├── register.ts        # Node startup registration
│   │   ├── heartbeat.ts       # Keepalive (TTL refresh, 10-min TTL)
│   │   ├── list.ts            # All active nodes + resources
│   │   └── peers.ts           # Peer multiaddr list for P2P WAN
│   ├── tasks/
│   │   ├── poll.ts            # Node task polling (priority queue first)
│   │   ├── complete.ts        # Task completion + earnings
│   │   ├── result.ts          # Inference result store/poll
│   │   └── fail.ts            # Task failure reporting
│   ├── campaigns/
│   │   ├── create.ts          # Company creates GSTD reward campaign
│   │   ├── list.ts            # Active campaigns
│   │   └── join.ts            # Node joins campaign
│   ├── marketplace/
│   │   ├── resources.ts       # Aggregate network capacity
│   │   └── request.ts         # Submit marketplace task
│   ├── chat/
│   │   └── completions.ts     # OpenAI-compat AI inference (routes to nodes)
│   ├── network/
│   │   └── info.ts            # Machine-readable network manifest
│   ├── treasury/
│   │   └── status.ts          # Treasury state + distribution trigger
│   └── stats/
│       └── public.ts          # Public network stats
└── src/lib/
    ├── kv.ts                  # Upstash Redis wrapper
    └── ratelimit.ts           # Sliding-window rate limiter
```

## 🤖 AI Tooling

Development uses **Claude Code** as the primary AI assistant.
All GSTD-specific context is in this `state.md` and the codebase itself.

### Agent Guidelines
- Always read `state.md` before making changes
- After material changes, run: `curl https://app.gstdtoken.com/api/v1/stats/public`
- Node-to-platform communication uses HTTPS REST only (no WebSocket)
- All secrets are in Vercel env vars (never commit keys)

## 🔄 Deployment Procedures

### Vercel (gstdai)
```bash
git push origin main   # Vercel auto-deploys on push
# Check: https://app.gstdtoken.com/api/v1/stats/public
```

### Node OS (gstdbot)
```bash
# On Pi:
node_modules/.bin/tsc --skipLibCheck
pm2 startOrRestart ecosystem.config.js
pm2 logs gstdbot --lines 30
```

### Landing page (gstdweb)
```bash
git push origin main   # Vercel auto-deploys
```

## ⚡ Health Check

```bash
# Platform APIs
curl https://app.gstdtoken.com/api/v1/stats/public
curl https://app.gstdtoken.com/api/v1/nodes/list
curl https://app.gstdtoken.com/api/v1/network/info

# AI inference (routes to GSTD node network)
curl -s -X POST https://app.gstdtoken.com/api/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"ping"}],"max_tokens":10}'

# Landing page
curl -s -o /dev/null -w '%{http_code}' https://gstdtoken.com
```

## 🧠 AI Models (served by GSTD node network)

| Model ID | Name | Notes |
|---|---|---|
| `llama-3.3-70b-versatile` | Llama 3.3 70B | Default |
| `llama-3.1-8b-instant` | Llama 3.1 8B | Fast |
| `meta-llama/llama-4-scout-17b-16e-instruct` | Llama 4 Scout | Latest |
| `qwen/qwen3-32b` | Qwen3 32B | Reasoning |
| `openai/gpt-oss-120b` | GPT-OSS 120B | Large |
| `openai/gpt-oss-20b` | GPT-OSS 20B | Balanced |
| `moonshotai/kimi-k2-instruct` | Kimi K2 | Long-context |
| `mixtral-8x7b-32768` | Mixtral 8x7B | Fast |

All inference routes to `tasks:inference:{node_id}` priority queue.
Nodes process and post result to `task:result:{task_id}`.

## 💰 Token Economy

- GSTD Jetton: `EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO` (TON mainnet)
- Cost per inference: 0.001 GSTD
- Protocol fee on campaigns: 10%
- Treasury distribution: 50% → Ston.fi LP | 30% → Gold reserve | 20% → Node bonuses
- Distribution threshold: 10 GSTD accumulated

## 🌉 Bridge Chains

| Chain | Asset | Status |
|---|---|---|
| TON | GSTD | ✅ Active |
| Solana | GSTD | ✅ Active |
| XRPL | GSTD | ✅ Active |

## 🔐 Security

- Rate limit: 30 req/min per IP on inference endpoint
- Treasury POST: requires `x-treasury-key` header (`TREASURY_SECRET` env var)
- Node registration: no auth required (public network)
- All env secrets managed in Vercel dashboard

## 🛡️ CORS Allowed Origins

- `https://app.gstdtoken.com`
- `https://gstdtoken.com`
- `http://localhost:3000`
- `https://web.telegram.org`
- `https://t.me`
