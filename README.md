# GSTD Platform

> Source for the GSTD web application and API, deployed on Cloudflare Workers.
> Node software is maintained separately in [gstdcoin/gstdbot](https://github.com/gstdcoin/gstdbot).

[![Platform](https://img.shields.io/badge/platform-app.gstdtoken.com-00d2ff?style=flat-square)](https://app.gstdtoken.com)
[![Network status](https://img.shields.io/badge/network-check_live_stats-blue?style=flat-square)](https://app.gstdtoken.com/api/v1/stats/public)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

---

## Project status

The platform provides APIs and UI for node registration, heartbeats, task queues, and network statistics. These capabilities do not mean workers or paid jobs are currently available. As of 2026-10-17, production stats report **0 registered/online nodes, 0 tasks, and 0 payouts**. Check the live endpoints before relying on network availability.

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

## Experimental: Proof of Intelligence (PoI)

The repository includes experimental scoring and training components. The following formula describes the intended scoring model; it is not a claim that every production inference is currently verified:

```
IW  =  0.40 × Alignment      # Did the AI call the right direction?
    +  0.25 × Timing          # Optimal entry position in the candle?
    +  0.20 × Selectivity     # Win rate over last 7 days
    -  0.15 × Noise           # Penalizes weak signals

IW ≥ 0.70 → High Intelligence → added to LoRA dataset (weight 3×)
IW ≥ 0.50 → Normal → added to LoRA dataset (weight 1×)
IW < 0.50 → Low quality → excluded from training
```

Evaluations depend on their input data and implementation. Do not treat a score as an independent audit or proof of a model's correctness.

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
  ├── Ollama inference (llama3.2:3b)
  ├── P2P mesh (libp2p)
  ├── GSTD-Validation-Layer sidecar    ← 111+ ExperienceRecords
  └── Cloudflare Named Tunnel → node.gstdtoken.com
        │ on completion
        ▼
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
| Node tunnel | Cloudflare Named Tunnel → node.gstdtoken.com |

---

## Local Development

```bash
cd frontend
npm install
npm run dev   # → http://localhost:3000
```

Local API development uses the development storage fallback. Production requires configured Upstash credentials.

### Wallet authentication

Dashboard login requires a fresh TonConnect proof. Set `GSTD_TONCONNECT_AUTH_DOMAINS` to a comma-separated list of allowed origin hostnames (the default production hosts are `app.gstdtoken.com` and `app.gstdtoken.com`; include `localhost:3000` for local development). Proofs are accepted only for supported standard TON wallet contracts, with single-use challenges and a five-minute expiry. Sessions issued by the older address-only login are intentionally invalidated, so existing users must reconnect once after this update.

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
| **gstdcoin/ai** | **This repo — Cloudflare-hosted platform app and API** |
| [gstdcoin/gstdbot](https://github.com/gstdcoin/gstdbot) | Node OS (TypeScript, ARM64, Ollama) |
| [gstdcoin/contracts](https://github.com/gstdcoin/contracts) | TON smart contracts (Tact) |

---

## License

MIT
