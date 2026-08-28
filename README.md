# GSTD AI Platform

> **Edge-sovereign AI infrastructure with on-chain rewards.**  
> Every inference is verifiable. Every node earns GSTD. No cloud dependencies.

[![Live](https://img.shields.io/badge/live-platform.gstdtoken.com-00d2ff?style=flat-square)](https://platform.gstdtoken.com)
[![Nodes](https://img.shields.io/badge/nodes-live-green?style=flat-square)](https://platform.gstdtoken.com/api/v1/nodes)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

---

## What is GSTD?

GSTD is a **DePIN (Decentralized Physical Infrastructure Network)** for AI compute.

| Centralized AI | GSTD Network |
|---|---|
| Black-box inference | Every decision scored with Intelligence Weight (IW) |
| Provider lock-in | Any device runs a node (Raspberry Pi, laptop, server) |
| No economic return | Nodes earn GSTD tokens for every completed inference |
| API goes down → app breaks | Swarm routing + fallback across nodes |

Live demonstration: the GSTD oracle evaluates 30+ crypto trading signals per day through the network, generating a self-curated LoRA training dataset from the results (111+ ExperienceRecords).

---

## Live Network

```bash
# Active nodes + their capabilities
curl https://platform.gstdtoken.com/api/v1/nodes

# Network stats: nodes, tasks, GSTD distributed
curl https://platform.gstdtoken.com/api/v1/network/stats

# Health check
curl https://platform.gstdtoken.com/health
```

---

## Proof of Intelligence (PoI)

The GSTD-Validation-Layer is an autonomous sidecar that converts every AI decision into a verifiable **Intelligence Weight (IW)** score:

```
IW  =  0.40 × Alignment      # Did the AI call the right direction?
    +  0.25 × Timing          # Optimal entry position in the candle?
    +  0.20 × Selectivity     # Win rate over last 7 days
    -  0.15 × Noise           # Penalizes weak signals

IW ≥ 0.70 → High Intelligence → added to LoRA dataset (weight 3×)
IW ≥ 0.50 → Normal → added to LoRA dataset (weight 1×)
IW < 0.50 → Low quality → excluded from training
```

All components are computed from **public Binance OHLCV data** — fully auditable by any third party. This creates a self-improving loop: high-quality decisions generate better training data, making future decisions smarter.

---

## On-Chain Settlement

GSTD rewards are settled on the **TON blockchain**. These contracts have **not** had an external security audit — see gstdcoin/contracts' P2P_SETTLEMENT_RFC.md for why that matters for the newer settlement path specifically:

| Contract | Address | Purpose |
|---|---|---|
| GSTD Jetton | `EQDv6cY...skTO` | 1B supply, mint locked |
| SettlementMaster v2 | `EQCi-Qja...gZQezhE` | 85/10/5 split; adds quorum-attested P2P settlement (2026-08-13) |
| AgentRegistry | `EQDtWcGC...NFwCtsDoT` | On-chain node identity + reputation |
| DAOVoting | `EQBa-hyO...4Jzls5` | Token-weighted governance |
| EcosystemTreasury | `EQAbtTC...Ii_` | TON vault for protocol buybacks |

Revenue split per task: **85% → node operator · 10% → treasury · 5% → protocol**

---

## Architecture

```
[User / Trading Bot]
        │ POST /api/v1/tasks/submit
        ▼
[Cloudflare Worker — platform.gstdtoken.com]   ← this repo
  ├── Node registry (Cloudflare KV)
  ├── Task queue (per-node priority, KV)
  ├── Auto DNS subdomain for new nodes
  └── Records: tasks_completed, node stats
        │ routes to best available node
        ▼
[GSTD Node (gstdbot)]                          ← gstdcoin/gstdbot
  ├── Ollama inference (llama3.2:3b)
  ├── P2P mesh (libp2p)
  ├── GSTD-Validation-Layer sidecar    ← 111+ ExperienceRecords
  └── Cloudflare Named Tunnel → node.gstdtoken.com
        │ on completion
        ▼
[TON Blockchain]                               ← gstdcoin/contracts
  └── SettlementMaster v2: 85/10/5 split
```

---

## API Reference

### Nodes

Nodes primarily find each other directly via a P2P mesh (libp2p). The platform registry below is a last-resort fallback, not the primary coordination path.

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/nodes/register` | POST | Node startup registration |
| `/api/v1/nodes/heartbeat` | POST | Keepalive (15-min TTL) |
| `/api/v1/nodes` | GET | All active nodes + capabilities |

### Tasks

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/tasks/submit` | POST | Submit task to queue |
| `/api/v1/tasks/poll?node_id=X` | GET | Node polls for assigned task |
| `/api/v1/tasks/complete` | POST | Node reports task result |
| `/api/v1/tasks/:id` | GET | Get task status + result |

### Network

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Worker health check |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Platform API | Cloudflare Worker (TypeScript) |
| State / DB | Cloudflare KV |
| Hosting | Cloudflare Workers (free tier, always-on) |
| AI Inference | Ollama via GSTD node network |
| Blockchain | TON (Tact smart contracts) |
| Node software | gstdbot (TypeScript, libp2p, ARM64) |
| Node tunnel | Cloudflare Named Tunnel → node.gstdtoken.com |

---

## Local Development

```bash
cd gstd-platform
npm install
npx wrangler dev   # → http://localhost:8787
```

No KV credentials needed for local dev — wrangler uses in-memory KV.

---

## Deploy Your Own Node

Run a GSTD node on any Linux machine and earn GSTD for AI inference:

```bash
git clone https://github.com/gstdcoin/gstdbot
cd gstdbot
npm install
cp .env.example .env
# Set GSTD_WALLET_ADDRESS and GSTD_SWARM_URL=https://platform.gstdtoken.com
npm start
```

See [gstdcoin/gstdbot](https://github.com/gstdcoin/gstdbot) for full setup guide.

---

## Ecosystem

| Repo | Description |
|---|---|
| **gstdcoin/ai** | **This repo — Cloudflare Worker platform API** |
| [gstdcoin/gstdbot](https://github.com/gstdcoin/gstdbot) | Node OS (TypeScript, ARM64, Ollama) |
| [gstdcoin/contracts](https://github.com/gstdcoin/contracts) | TON smart contracts (Tact) |

---

## License

MIT
