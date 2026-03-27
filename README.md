# 🔱 GSTD — Sovereign AI Network (v1.4.0 Mainnet Ready)

> A decentralized AI swarm of millions of devices, united by A2A protocol and Hive Memory, creating a computational organism that thinks, learns, and serves humanity. Now with an integrated Agent Marketplace, Telegram DEX swapping, and Sovereign Reputation Protocol.

[![CI](https://github.com/gstdcoin/ai/actions/workflows/ci.yml/badge.svg)](https://github.com/gstdcoin/ai/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](LICENSE)
[![Release: v1.4.0](https://img.shields.io/badge/Release-v1.4.0-blueviolet.svg)](https://github.com/gstdcoin/ai/releases/tag/v1.4.0)

## Run a Node (Earn GSTD) 🚀

### Linux / macOS / WSL
```bash
curl -fsSL https://raw.githubusercontent.com/gstdcoin/ai/main/scripts/node-runner.sh | bash
```

### Windows (PowerShell)
```powershell
irm https://raw.githubusercontent.com/gstdcoin/ai/main/scripts/node-runner.ps1 | iex
```

### Docker (any platform)
```bash
docker run -d --name gstd-node \
  -e GSTD_WALLET_ADDRESS=EQYour_Wallet_Here \
  -p 8090:8080 \
  ghcr.io/gstdcoin/gstd-node:latest
```

### Vercel (Dashboard only)
```bash
cd frontend && npx vercel
```

### OpenClaw (Agent skill)
Import `https://github.com/gstdcoin/ai` → uses `openclaw-manifest.json` and [SKILL.md](docs/skills/SKILL.md)

### Mobile (Telegram Web App)
Open [@GSTDBot](https://t.me/GSTDBot) → Launch App → Node auto-starts as Micro Worker

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    L6: Access Layer                  │
│          React (Vercel) + TWA (Telegram)             │
│   + STON.fi DEX Widget + AI Agent Marketplace        │
├──────────────────────────────────────────────────────┤
│                  L5: Sentinel Layer                  │
│            ML Classifier + Ethics Rules              │
├──────────────────────────────────────────────────────┤
│                L4: Inference Engine                  │
│      Go Router + Swarm/Ollama + Phantom Nodes        │
├──────────────────────────────────────────────────────┤
│                L3: Hive Memory                       │
│       Content-Addressed + Kademlia DHT + AES         │
├──────────────────────────────────────────────────────┤
│                 L2: A2A Protocol                     │
│         Go gRPC + Redis PubSub + Ed25519             │
├──────────────────────────────────────────────────────┤
│               L1: Blockchain & Swarm                 │
│         GSTD L1 Swarm + Smart Contracts              │
├──────────────────────────────────────────────────────┤
│                  L0: Hardware                        │
│       GPU Server / PC / Mobile / IoT / Edge          │
└──────────────────────────────────────────────────────┘
```

## Repository Structure

```
gstdcoin/ai/
├── contracts/                    # Tact smart contracts (TON)
│   ├── GSTDJetton.tact          # Core token (1B max, TEP-74)
│   ├── SettlementMaster.tact    # Payment splitting (85/10/5)
│   ├── TreasuryGold.tact        # Gold reserve (XAUt)
│   ├── AgentRegistry.tact       # Node identity & reputation
│   ├── DAOVoting.tact           # Governance
│   └── scripts/                 # Deployment & verification
├── backend/                      # Go backend
│   ├── internal/
│   │   ├── a2a/                 # A2A Protocol (broadcast/claim/result)
│   │   ├── hive/                # Hive Memory (DHT + semantic search)
│   │   ├── inference/           # LLM Router (5-tier priority)
│   │   ├── sentinel/            # Ethics filter (immune system)
│   │   ├── genesis/             # Genesis Lock (binary verification)
│   │   ├── node/                # Node manager (auto-enrollment)
│   │   ├── settlement/          # TON settlement client
│   │   ├── api/                 # REST API handlers
│   │   ├── services/            # Business logic
│   │   └── config/              # Configuration
│   ├── main.go
│   └── Dockerfile
├── frontend/                     # Next.js 16 + TypeScript
│   ├── vercel.json              # Vercel deployment config
│   └── Dockerfile               # Docker deployment
├── scripts/                      # Cross-platform node runners
│   ├── node-runner.sh           # Linux / macOS / WSL
│   └── node-runner.ps1          # Windows PowerShell
├── openclaw-manifest.json        # OpenClaw agent skill
├── docker-compose.prod.yml       # Production (blue-green)
├── docker-compose.dev.yml        # Development
└── .github/workflows/            # CI/CD
    ├── ci.yml                   # Tests + security scan
    └── deploy.yml               # Auto-deploy on merge
```

## Smart Contracts

| Contract | Purpose | Key Feature |
|----------|---------|-------------|
| **GSTDJetton** | Core token | 1B max supply, Settlement-only minting |
| **SettlementMaster** | Payment engine | 85% worker / 10% treasury / 5% buyback |
| **TreasuryGold** | Gold reserve | 70% auto-convert to XAUt |
| **AgentRegistry** | Node identity | Genesis Lock + reputation tracking |
| **DAOVoting** | Governance | Token-weighted, 48h timelock |

## Node Types (Auto-Detected)

| Hardware | Node Type | Earns |
|----------|-----------|-------|
| GPU ≥24GB VRAM | 🚀 GPU Worker | ~75 GSTD/day |
| GPU <24GB | ⚡ GPU Light | ~25 GSTD/day |
| 8+ cores, 16GB+ | 💻 Edge Node | ~2 GSTD/day |
| 4+ cores | 📱 Micro Node | ~0.5 GSTD/day |
| Minimal | 📡 Relay Node | ~0.1 GSTD/day |
| Mobile (TWA) | 📲 Mobile | ~0.1 GSTD/day |

## The Flywheel (Utility Phase)

1. **Supply:** Device (no GSTD) → Auto-start as Node via Telegram → Contribute CPU/GPU.
2. **Reward:** Network settles compute tasks → User earns GSTD.
3. **Utility:** Accumulated GSTD = Free AI access, or hire Custom AI Agents from the Marketplace.
4. **Monetization:** Build and list AI Agents → Earn 80% GSTD royalties from other users.
5. **Liquidity:** Swap GSTD ↔ TON instantly via STON.fi DEX widget right in Telegram.
6. **Growth:** Swarm grows → Power grows → Utility scales.

## Token Economics

## Token Economics

- **Total Supply:** 1,000,000,000 GSTD (absolute maximum)
- **Workers:** 40% (400M) — mined through task completion & uptime (Sovereign Protocol 85/15 allocation)
- **Ecosystem:** 20% (200M) — DAO grants & partnerships
- **Team:** 15% (150M) — 36mo vesting, 12mo cliff
- **Public Sale:** 10% (100M) — IDO
- **Reserve:** 15% (150M) — 24mo locked, then DAO

## 🛡️ Sovereign Reputation Protocol (New in 1.4.0)
The GSTD Network uses an autonomous and decentralized reputation system:
- **Node Tiers**: Automatic progression (`Bronze` -> `Silver` -> `Gold` -> `Platinum` -> `Diamond`) based on Uptime and Tasks served.
- **Streak Multipliers**: Daily check-ins via Heartbeat mechanism compound node earnings up to 300%.
- **Revenue Sharing**: 85% of execution fees go directly to the Node Operator, 15% is automatically split into Buyback/Burn and Treasury Gold.
- **Trust Score Verification**: Real-time evaluation of device fidelity via ML classifiers running on L5 Sentinel Layer.

## Development

```bash
# Backend
cd backend && go test ./... -race -v && cd ..

# Frontend  
cd frontend && npm run dev

# Full stack
docker compose -f docker-compose.dev.yml up -d
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

MIT — Free as air, free as knowledge.

---

*GSTD · Global Super Computer · For All Humanity*
