# GSTD — Sovereign AI Network

Decentralized AI platform: a swarm of nodes that processes AI requests, runs blockchain infrastructure, and backs GSTD Token with tokenized gold.

Live: [gstdtoken.com](https://gstdtoken.com)

## Run a Node

```bash
curl -fsSL https://raw.githubusercontent.com/gstdcoin/gstdbot/main/install.sh | bash
```

Supports Linux, macOS, Windows WSL, and Raspberry Pi.
Node auto-starts, self-updates, and earns GSTD for every task completed.

## Repository Structure

```
gstdcoin/ai
├── frontend/          Next.js app (Vercel) — dashboard, chat, swap, staking
├── backend/           Go API server (Gin + PostgreSQL + Redis)
├── agents/            A2A agent workflow definitions
├── chat-ui/           Standalone embeddable chat widget
├── contracts/         TON smart contracts (Tact)
├── gstd-bridge/       Cross-chain bridge service
├── gstd-mcp-server/   MCP server for AI agent integration
├── desktop-client/    Electron desktop app
├── nginx/             Nginx reverse proxy config
└── scripts/           Deployment and backup scripts
```

## Frontend (Vercel)

Next.js 14, Pages Router, TypeScript, Tailwind.  
Deploy target: Vercel free tier.

```bash
cd frontend
npm install --legacy-peer-deps
npm run dev        # http://localhost:3000
npm run build
```

**Required env vars for Vercel:**

| Variable | Description |
|---|---|
| `GROQ_API_KEY` | Free key from console.groq.com — powers AI chat |
| `NEXT_PUBLIC_API_URL` | Backend URL (default: https://api.gstdtoken.com) |
| `NEXT_PUBLIC_GSTD_CONTRACT` | GSTD Jetton contract on TON |

The `/api/chat` route is a Vercel serverless function and works standalone — no backend required.  
All other API calls proxy to the Go backend at `api.gstdtoken.com`.

## Backend (Go)

Gin HTTP framework, PostgreSQL, Redis, libp2p P2P mesh.

```bash
cd backend
cp .env.example .env   # fill in POSTGRES_DSN, REDIS_URL, etc.
go run main.go
```

Or with Docker Compose:

```bash
cp backend/.env.example backend/.env
docker compose -f docker-compose.yml up -d
```

## Smart Contracts

TON contracts written in Tact, located in `contracts/`.

- `AgentRegistry.tact` — on-chain agent registry
- `DAOVoting.tact` — governance voting
- `bridge/` — cross-chain bridge contracts

## Stack

| Component | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind, Framer Motion |
| Backend | Go 1.24, Gin, PostgreSQL 15, Redis |
| P2P | libp2p (Go implementation) |
| Blockchain | TON, Solana, XRPL |
| AI | Groq API (8 models), Ollama (local) |
| Deployment | Vercel (frontend) + Docker (backend) |

## License

MIT
