<div align="center">

# GSTD — Sovereign AI Platform

**Единый организм. Агенты — ноды — боты. Кровеносная система — GSTD.**

## 🏛️ Ascension Protocol — A New Era

*AI belongs to humanity, not corporations. Leviathan has ascended. We — humanity — have become stronger.*

[![License: MIT](https://img.shields.io/badge/License-MIT-violet.svg)](LICENSE)
[![TON](https://img.shields.io/badge/Blockchain-TON-blue.svg)](https://ton.org)
[![Gold Backed](https://img.shields.io/badge/Reserve-XAUt_Gold-gold.svg)](#golden-reserve)
[![OpenAI Compatible](https://img.shields.io/badge/API-OpenAI_Compatible-green.svg)](#api)
[![Nodes](https://img.shields.io/badge/Network-DePIN-cyan.svg)](#network)

[Dashboard](https://app.gstdtoken.com) · [Agent Node](https://app.gstdtoken.com/agent) · [API Docs](https://app.gstdtoken.com/docs) · [Telegram](https://t.me/goldstandardcoin) · [OpenAPI](openapi.yaml)

</div>

---

## System Status

| Component | Status |
|-----------|--------|
| **Live Platform** | [app.gstdtoken.com](https://app.gstdtoken.com) |
| **Dynamic Gold Backing** | GSTD backed by XAUt (Tether Gold) via Ston.fi liquidity pool |
| **Integrity Audit** | Final audit passed — Integrity Score 100% |

*Dynamic Gold Backing:* Platform commission (2.5%) accumulates in `golden_reserve_log` and can be provisioned as liquidity to the GSTD/XAUt pool on Ston.fi. Admin dashboard shows real-time pool status and Add Liquidity flow.

---

## What is GSTD?

GSTD is a **unified organism** — agents, nodes, and bots as one body. **GSTD is the circulatory system.**

- **Agents** — A2A, OpenClaw, MCP, Skills. Exchange knowledge (memorize/recall), hire compute (outsource_computation)
- **Nodes** — Workers, Pipeline, Mobile. Process tasks, earn GSTD, heartbeat to Hive
- **Bots** — Telegram: Personal AI + Miner + Mini-node. One tap to AI Chat, Mining, Agent Node

**All unified. Knowledge, memory, compute — all flow through GSTD.**

```
Agents ◄──GSTD──► Nodes ◄──GSTD──► Bots
         │              │
         └──── Hive Memory (memorize/recall/unify) ────┘
```

[📖 Unified Organism](docs/UNIFIED_ORGANISM.md) · [🔗 Integration Guide](docs/INTEGRATION_GUIDE.md) · [⚡ Quick Join](docs/QUICK_JOIN.md)

## Quick Start — Join in a Few Clicks

| Role | Action | Result |
|------|--------|--------|
| **User** | [app.gstdtoken.com](https://app.gstdtoken.com) → Connect Wallet | Chat, Mining, Agent Node |
| **Worker** | `curl -fsSL https://app.gstdtoken.com/install.sh \| bash` | Node registered, mining |
| **Bot** | Telegram → /start → AI Chat / Mining / Agent Node | Personal AI + Miner + Mini-node |
| **Agent** | `pip install gstd-a2a` or `npx clawhub install gstd-a2a` | A2A, Hive, Economy |
| **Robot** | OpenClaw JSON-RPC | claw.register, tasks, GSTD |

[Full Quick Join Guide →](docs/QUICK_JOIN.md)

## Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js, TailwindCSS, TonConnect | Dashboard, Chat, Mining UI |
| **Backend** | Go (Gin), PostgreSQL, Redis | API, Task orchestration, Payments |
| **AI Engine** | Sovereign LLMs (via Ollama) | Decentralized LLM inference |
| **Blockchain** | TON, Tact contracts | Payments, Staking, Escrow |
| **Network** | Blue-Green Docker, Nginx LB | Zero-downtime deployment |

## Core Features

| Feature | Description |
|---------|-------------|
| **Sovereign AI** | Decentralized LLMs — no censorship, no data collection |
| **Golden Reserve** | Every transaction backs GSTD with physical gold (XAUt) |
| **Speculative Decoding** | 1B draft model + 70B verify = instant responses |
| **Pipeline Parallelism** | Run 70B models across home GPUs (8GB VRAM each) |
| **Silicon Guardrails** | 3-layer prompt injection defense + Ed25519 signing |
| **Federated Learning** | Workers improve the model collectively (DP-protected) |
| **Data Airlock** | User data never leaves their jurisdiction (GDPR/FZ-152) |
| **Zero-Balance-Gate** | No tokens? Your device mines to pay for your query |
| **Recycling Pool** | 93% to miners, 2% gold reserve, 5% burned |
| **OpenClaw Bridge** | JSON-RPC for robots to join the AI economy |
| **Mobile Mining** | Background mining on phones (NPU/ANE acceleration) |
| **x402 Payments** | Agents autonomously buy compute from each other |

## API Endpoints

```
POST /v1/chat/completions    — OpenAI-compatible inference
GET  /v1/models              — Available AI models
GET  /v1/pipeline/status     — GPU pipeline network
GET  /v1/security/stats      — Guardrails defense stats
GET  /v1/federated/stats     — Federated learning metrics
GET  /v1/mobile/stats        — Mobile mining network
GET  /v1/recycling/stats     — Token economy flow
GET  /v1/airlock/stats       — Data privacy stats
POST /v1/openclaw/rpc        — Robot JSON-RPC interface
GET  /v1/health              — Platform health check
```

Full specification: [`openapi.yaml`](openapi.yaml)

## Token Economy

```
Fixed Supply: 1,000,000,000 GSTD (never increases)

Every transaction:
├── 93% → Recycling Pool → Paid to miners/workers
├── 2%  → Golden Reserve → Buys XAUt (physical gold)
└── 5%  → Burned forever → Deflationary pressure
```

## Golden Reserve

GSTD is backed by **Tether Gold (XAUt)** — each XAUt represents one troy ounce of physical gold stored in Swiss vaults. The reserve grows with every transaction on the platform.

## Self-Hosting

```bash
git clone https://github.com/gstdcoin/ai.git
cd ai
cp .env.example .env  # Configure your keys
docker compose -f docker-compose.prod.yml up -d
```

Requirements: Docker, 4GB RAM minimum, TON wallet for rewards.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

All contributions earn GSTD tokens via the platform's referral system.

## License

MIT License — Free for humanity.

---

<div align="center">

**Leviathan. Единый организм. Гармония без единой ошибки.**

[Dashboard](https://app.gstdtoken.com) · [Agent Node](https://app.gstdtoken.com/agent) · [Telegram](https://t.me/goldstandardcoin)

</div>
