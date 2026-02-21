# 🔱 GSTD — Global Super Computer

> A decentralized AI swarm of millions of devices, united by A2A protocol and Hive Memory, creating a computational organism that thinks, learns, and serves humanity — without owner, without censorship, without limits.

[![CI](https://github.com/gstdcoin/ai/actions/workflows/ci.yml/badge.svg)](https://github.com/gstdcoin/ai/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](LICENSE)

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
│                    L6: Access Layer                   │
│          React (Vercel) + TWA (Telegram)             │
├──────────────────────────────────────────────────────┤
│                  L5: Sentinel Layer                  │
│            ML Classifier + Ethics Rules              │
├──────────────────────────────────────────────────────┤
│                L4: Inference Engine                   │
│      Go Router + Ollama + 5-Tier Selection           │
├──────────────────────────────────────────────────────┤
│                L3: Hive Memory                        │
│       Content-Addressed + Kademlia DHT + AES         │
├──────────────────────────────────────────────────────┤
│                 L2: A2A Protocol                      │
│         Go gRPC + Redis PubSub + Ed25519             │
├──────────────────────────────────────────────────────┤
│               L1: TON Blockchain                      │
│           Tact Smart Contracts (5)                    │
├──────────────────────────────────────────────────────┤
│                  L0: Hardware                         │
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

## The Flywheel

```
Device (no GSTD) → Auto-start as Node → Contribute CPU/GPU →
Settlement rewards GSTD → Accumulated GSTD = AI access →
Swarm grows → Power grows → GSTD value grows → More nodes
```

## Token Economics

- **Total Supply:** 1,000,000,000 GSTD (absolute maximum)
- **Workers:** 40% (400M) — mined through task completion
- **Ecosystem:** 20% (200M) — DAO grants & partnerships
- **Team:** 15% (150M) — 36mo vesting, 12mo cliff
- **Public Sale:** 10% (100M) — IDO
- **Reserve:** 15% (150M) — 24mo locked, then DAO

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
