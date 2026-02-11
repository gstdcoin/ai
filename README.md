<div align="center">

# GSTD — Sovereign AI Platform

**The decentralized AI infrastructure that belongs to humanity, not corporations.**

[![License: MIT](https://img.shields.io/badge/License-MIT-violet.svg)](LICENSE)
[![TON](https://img.shields.io/badge/Blockchain-TON-blue.svg)](https://ton.org)
[![Gold Backed](https://img.shields.io/badge/Reserve-XAUt_Gold-gold.svg)](#golden-reserve)
[![OpenAI Compatible](https://img.shields.io/badge/API-OpenAI_Compatible-green.svg)](#api)
[![Nodes](https://img.shields.io/badge/Network-DePIN-cyan.svg)](#network)

[Dashboard](https://app.gstdtoken.com) · [API Docs](https://app.gstdtoken.com/docs) · [Telegram](https://t.me/goldstandardcoin) · [OpenAPI Spec](openapi.yaml)

</div>

---

## What is GSTD?

GSTD is a **decentralized AI platform** where:
- **Users** get ChatGPT-level AI at a fraction of the cost, with zero censorship
- **Workers** earn GSTD tokens by contributing compute power from any device
- **Robots** connect via OpenClaw protocol to earn GSTD for physical tasks
- **Everything** is backed by physical gold (XAUt) on the TON blockchain

```
User → GSTD Token → AI Inference ← Worker earns GSTD
  ↕                                    ↕
Golden Reserve (XAUt)          Recycling Pool (93% to miners)
```

## Quick Start

### For Users (Chat with Sovereign AI)
```bash
# 1. Open the platform
open https://app.gstdtoken.com

# 2. Connect TON wallet
# 3. Start chatting — it's that simple
```

### For Workers (Earn GSTD)
```bash
# One command to join the network:
curl -fsSL https://app.gstdtoken.com/install.sh | bash
```

### For Developers (Use as API)
```bash
# OpenAI-compatible — works with Cursor, VS Code, LangChain, etc.
curl https://api.gstdtoken.com/v1/chat/completions \
  -H "Authorization: Bearer gstd_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "gstd-sovereign", "messages": [{"role": "user", "content": "Hello!"}]}'
```

### For Robots (OpenClaw Protocol)
```python
import httpx
response = httpx.post("https://api.gstdtoken.com/v1/openclaw/rpc", json={
    "jsonrpc": "2.0",
    "method": "claw.register",
    "params": {"wallet_address": "EQ...", "agent_type": "manipulator"},
    "id": 1
})
```

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

**Sovereign AI for everyone. No corporations. No censorship. No limits.**

[Join the Revolution →](https://app.gstdtoken.com)

</div>
