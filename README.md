# GSTD Platform

> The web app, API and Telegram bot behind GSTD — decentralized AI compute on TON — running on Cloudflare Workers.
> Node software is maintained separately in [gstdcoin/gstdbot](https://github.com/gstdcoin/gstdbot).

[![Platform](https://img.shields.io/badge/platform-app.gstdtoken.com-00d2ff?style=flat-square)](https://app.gstdtoken.com)
[![Telegram](https://img.shields.io/badge/Telegram-@gstdaibot-26a5e4?style=flat-square)](https://t.me/gstdaibot)
[![Network status](https://img.shields.io/badge/network-check_live_stats-blue?style=flat-square)](https://app.gstdtoken.com/api/v1/stats/public)
[![License](https://img.shields.io/badge/license-PolyForm%20NC%201.0.0-orange?style=flat-square)](LICENSE)

---

## Project status

The platform provides APIs and UI for node registration, heartbeats, task queues, and network statistics. These capabilities do not mean workers or paid jobs are currently available. Check the live endpoints before relying on network availability. The 2026-10-25 integration release fixes native node-signature verification within the Cloudflare CPU budget, Redis registry serialization, peer liveness and server-owned task counters. See [the operational contract](docs/PLATFORM_OPERATIONS.md) for validation and remaining boundaries.

The codebase is evolving and is not an externally audited production financial system. Smart-contract deployment and limitations are documented in [gstdcoin/contracts](https://github.com/gstdcoin/contracts).

## Live endpoints

```bash
# Registered and online nodes
curl https://app.gstdtoken.com/api/v1/nodes/list

# Public node, task, and payout counters
curl https://app.gstdtoken.com/api/v1/stats/public

# Health check
curl https://app.gstdtoken.com/api/v1/health
```

---

## Telegram bot — @gstdaibot

The bot runs as a Cloudflare Worker webhook in this repo (`frontend/src/pages/api/v1/telegram/webhook.ts`), with no separate server:

- AI chat with a daily per-user limit; when no GSTD node is online it falls back to Workers AI and says so.
- Link a TON wallet, see your balance and nodes, claim accepted-task rewards.
- Referral link and inline sharing; 6 languages (EN, RU, UK, ES, TR, ZH).
- Webhook requests are verified by a secret header; the `bot/*` endpoints require a shared token and are not public.

Register the webhook and command menus with `frontend/scripts/set-telegram-webhook.mjs` (token from the environment only).

---

## On-Chain Settlement

TON contracts have been deployed, but the full production task-to-payout flow is not verified and the contracts have **not** had an external security audit. The following addresses identify contracts; they do not establish that a current platform task automatically settles on-chain:

| Contract | Address | Purpose |
|---|---|---|
| GSTD Jetton | `EQDv6cY...skTO` | 1B supply, mint locked |
| SettlementMaster v2 | `EQCi-Qja...gZQezhE` | 85/10/5 split; adds quorum-attested P2P settlement (2026-08-13) |
| AgentRegistry | `EQDtWcGC...NFwCtsDoT` | On-chain node identity + reputation |
| DAOVoting | `EQBa-hyO...4Jzls5` | Token-weighted governance |
| EcosystemTreasury | `EQAbtTC...Ii_` | TON vault for protocol buybacks |

The 85/10/5 split is a protocol design described in the contracts repository, not evidence of current platform payouts.

---

## Architecture

```
[User / Trading Bot]
        │ POST /api/v1/tasks/submit
        ▼
[Cloudflare Workers — app.gstdtoken.com]       ← this repo
  ├── Node registry and task APIs (Upstash-backed)
  ├── Public network statistics
  └── Web application
        │ task assignment depends on currently registered nodes
        ▼
[GSTD Node (gstdbot)]                          ← gstdcoin/gstdbot
  ├── Ollama inference
  ├── P2P mesh (libp2p)
  └── Sovereign verified-task core (experimental, no real payouts)
        │
[Telegram @gstdaibot]  ← webhook served by this repo
        │
[TON Blockchain]                               ← gstdcoin/contracts
  └── deployed contracts; platform task-to-payout settlement is not verified
```

---

## API Reference

### Nodes

Nodes register with the platform API and periodically send heartbeats. Registration does not guarantee task assignment or payment.

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/nodes/register` | POST | Node startup registration |
| `/api/v1/nodes/heartbeat` | POST | Node heartbeat (10-minute record TTL) |
| `/api/v1/nodes/list` | GET | Registered nodes and current online status |
| `/api/v1/nodes/peers` | GET | Peer discovery data |

### Tasks

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/tasks/submit` | POST | Submit task to queue |
| `/api/v1/tasks/poll` | POST | Authenticated task poll used by GSTD nodes |
| `/api/v1/tasks/worker/pending?node_id=...` | GET | Poll for a task assigned to a registered node |
| `/api/v1/tasks/worker/submit` | POST | Submit a result for an assigned task |

### Network

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/health` | GET | Application and KV health check |
| `/api/v1/stats/public` | GET | Public node, task, and payout counters |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Platform API | Next.js API routes, deployed with OpenNext on Cloudflare Workers |
| State / DB | Upstash Redis REST API |
| Hosting | Cloudflare Workers (plan quotas apply) |
| AI Inference | Ollama via GSTD node network |
| Blockchain | TON (Tact smart contracts) |
| Node software | gstdbot (TypeScript, libp2p, ARM64) |
| Bot | Telegram webhook on the same Worker |

---

## Local Development

```bash
cd frontend
npm install
npm run dev   # → http://localhost:3000
```

Local API development uses the development storage fallback. Production requires configured Upstash credentials.

### Wallet authentication

Dashboard login requires a fresh TonConnect proof. Set `GSTD_TONCONNECT_AUTH_DOMAINS` to a comma-separated list of allowed origin hostnames (the default production host is `app.gstdtoken.com`; include `localhost:3000` for local development). Proofs are accepted only for supported standard TON wallet contracts, with single-use challenges and a five-minute expiry. Sessions issued by the older address-only login are intentionally invalidated, so existing users must reconnect once after this update.

---

## Deploy Your Own Node

The node client is maintained separately. Production task availability and rewards are not guaranteed; check live stats first:

```bash
git clone https://github.com/gstdcoin/gstdbot
cd gstdbot
npm install
cp .env.example .env
# Configure the API URL and wallet address as described in the node repository
npm start
```

See [gstdcoin/gstdbot](https://github.com/gstdcoin/gstdbot) for full setup guide.

---

## Ecosystem

| Repo | Description |
|---|---|
| **gstdcoin/ai** | **This repo — Cloudflare-hosted platform app, API and Telegram bot** |
| [gstdcoin/web](https://github.com/gstdcoin/web) | Public website (gstdtoken.com) |
| [gstdcoin/gstdbot](https://github.com/gstdcoin/gstdbot) | Node software (TypeScript, ARM64, Ollama) |
| [gstdcoin/A2A](https://github.com/gstdcoin/A2A) | Experimental client libraries and agent docs |
| [gstdcoin/contracts](https://github.com/gstdcoin/contracts) | TON smart contracts (Tact, unaudited) |
| [gstdcoin/gstd-bridge](https://github.com/gstdcoin/gstd-bridge) | Bridge research scaffold (deferred, not deployed) |

---

## License

Source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE), with an additional permission for taking part in the GSTD network (including receiving GSTD rewards). Commercial use by companies needs a separate license. Not an OSI open-source license.

Free-tier request schedules and operational limits: [request budget](docs/FREE_TIER_REQUEST_BUDGET.md).

Start here: [one ecosystem, three entry paths](docs/ECOSYSTEM.md). AI chat does not require a wallet; connect a computer node or use its API when you need more.
