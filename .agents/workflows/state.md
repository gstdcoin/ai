---
description: Current ecosystem state — always read FIRST before any changes
---

# GSTD Ecosystem State (ALWAYS READ FIRST)

> ⚠️ **MANDATORY**: Before making ANY code changes, deployment, or fixes — 
> read this file to understand current versions, architecture, and active services.
> After ANY deployment — update this file.

## 🏗️ Architecture Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                    GSTD ECOSYSTEM                           │
│                 Server: 82.115.48.228                       │
│                 OS: Ubuntu 24.04                            │
│                 Last Update: 2026-04-01 — ecosystem-audit PASSED            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─── NGINX (gstd_nginx_lb) ─── Port 80/443 ─────────┐    │
│  │                                                     │    │
│  │  app.gstdtoken.com     → frontend:3000              │    │
│  │  api.gstdtoken.com     → backend:8080               │    │
│  │  chat.gstdtoken.com    → chat-ui (static)           │    │
│  │  gstdbot.gstdtoken.com → gstdbot (static)           │    │
│  │  monitor.gstdtoken.com → frontend:3000/monitor      │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─── BACKEND (Go) ─── 4 replicas ───────────────────┐     │
│  │  Containers: ubuntu-backend-blue-{1,2,3,4}         │     │
│  │  Image:      gstd-backend-blue:v198                 │     │
│  │  Port:       8080 (internal, via nginx)            │     │
│  │  DB:         distributed_computing                 │     │
│  │  Rollback:   gstd-backend-blue:v193                │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌─── FRONTEND (Next.js 16.1.6) ─────────────────────┐     │
│  │  Container: ubuntu-frontend-1 (Docker)             │     │
│  │  Image:     gstd-frontend:v28 (running)           │     │
│  │  Path:      /home/ubuntu/frontend                  │     │
│  │  Pages:     14 (SSG/SSR)                           │     │
│  │  Features:  Footer reads GET /api/v1/ecosystem/features (optional modules) │     │
│  │  Note:      Docker-only (systemd disabled)         │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌─── GSTD BRIDGE (Rust + Go P2P) ────────────────────┐     │
│  │  Rust Container: gstd-bridge-test                  │     │
│  │  Image:     gstd-bridge:latest                     │     │
│  │  Chains:    TON ↔ Solana ↔ XRPL ↔ Ethereum         │     │
│  │  Assets:    GSTD, PAXG (PAX Gold)                  │     │
│  │  P2P API:   /api/v1/bridge/p2p/* (Go backend)      │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌─── TELEGRAM BOT (TypeScript) ─────────────────────┐     │
│  │  Container: gstd-telegram-bot                      │     │
│  │  Image:     gstd-bot:v36 (running)                 │     │
│  │  Path:      /home/ubuntu/gstdbot                   │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌─── CHAT-UI (Static HTML) ─────────────────────────┐     │
│  │  Path:      /home/ubuntu/chat-ui                   │     │
│  │  Served by: Nginx (chat.gstdtoken.com)             │     │
│  │  Features:  Balance, faucet, TON validation, SSE   │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌─── DATA LAYER ────────────────────────────────────┐     │
│  │  PostgreSQL: gstd_postgres_prod (postgres:15)      │     │
│  │  Database:   distributed_computing                 │     │
│  │  Redis:      gstd_redis_prod (redis:7-alpine)      │     │
│  │  Redis Pass: ${REDIS_PASSWORD} (from .env)         │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 📋 Current Versions

| Component | Version/Image | Path | Container |
|-----------|---------------|------|-----------|
| **Backend** | `gstd-backend-blue:v198` ×4 | `/home/ubuntu/backend` | `ubuntu-backend-blue-{1,2,3,4}` |
| **Frontend** | `gstd-frontend:v28` (Docker) | `/home/ubuntu/frontend` | `ubuntu-frontend-1` |
| **Telegram Bot** | `gstd-bot:v36` | `/home/ubuntu/gstdbot` | `gstd-telegram-bot` |
| **GSTD Bridge** | `gstd-bridge:latest` | `/home/ubuntu/gstd-bridge` | `gstd-bridge-test` |
| **Chat UI** | Static HTML | `/home/ubuntu/chat-ui` | *served by nginx* |
| **PostgreSQL** | `postgres:15-alpine` | — | `gstd_postgres_prod` |
| **Redis** | `redis:7-alpine` | — | `gstd_redis_prod` |
| **Nginx** | `nginx:alpine` | `/home/ubuntu/nginx` | `gstd_nginx_lb` |
| **Docker Compose** | — | `/home/ubuntu/docker-compose.yml` | — |

## 📂 Key File Locations

```
/home/ubuntu/
├── docker-compose.yml          # Master orchestration
├── .env                        # Environment variables (all services)
├── backend/                    # Go backend source
│   ├── internal/api/routes.go  # API routes + CORS
│   ├── internal/api/handler_gateway.go  # Chat gateway
│   ├── internal/services/      # Business logic (40+ services)
│   ├── main.go                 # Entrypoint
│   ├── Dockerfile              # Multi-stage Go build
│   └── .env                    # Backend-specific config
├── frontend/                   # Next.js 16 frontend
│   ├── src/pages/              # Pages (chat.tsx, monitor/, etc.)
│   ├── src/pages/api/chat.ts   # Groq AI chat API route
│   ├── src/components/         # React components
│   └── .next/                  # Build output
├── gstdbot/                    # Telegram bot (TypeScript)
│   ├── src/                    # Source code
│   ├── dist/                   # Compiled JS
│   └── Dockerfile
├── chat-ui/                    # Standalone chat widget
│   └── index.html              # Single-file SPA
├── nginx/                      # Nginx configuration
│   ├── nginx.conf              # Main config
│   └── conf.d/                 # Virtual hosts
│       ├── gstd.conf           # app + api
│       ├── chat.conf           # chat.gstdtoken.com
│       ├── gstdbot.conf        # gstdbot.gstdtoken.com  
│       └── monitor.conf        # monitor.gstdtoken.com
├── ssl/                        # SSL certificates
├── agents/                     # → .agents (symlink) — workflows + ecosystem state
├── .cursorrules                # GSTD canonical rules for AI assistants (always wins)
├── SECURITY.md                 # Vulnerability reporting (private disclosure)
└── scripts/
    ├── ecosystem-audit.sh         # Full stack health (Docker, APIs, SSL, DB, Redis)
    ├── verify-all.sh              # go vet/test, Tact, lint+build, ecosystem-audit (local)
    ├── ecosystem-audit-alert.sh   # Same + optional Telegram on failure (TELEGRAM_* in .env)
    ├── backup_postgres.sh         # Daily pg_dump gzip; cron on prod host
    ├── crontab.prod.example           # Example crontab lines (backup + audit + alert)
    ├── backup-offsite-rsync.example.sh # Optional rsync of backups/postgres to remote host
    └── sync-agency-agents.sh          # Optional: refresh .cursor/rules from The Agency
```

## 🤖 AI tooling (Cursor / [The Agency](https://github.com/msitarzewski/agency-agents))

- **Canonical policy:** `.cursorrules` defines GSTD-first behavior (Sovereign Fund split, node verification, Docker, Tact). Never override it with generic agent prompts.
- **Optional specialists:** After running `./scripts/sync-agency-agents.sh`, Cursor loads `.cursor/rules/*.mdc` from upstream. Use `@rule-name` only when it helps the task; map layers loosely — backend `backend`/`backend-architect`, frontend `frontend-developer`/`ui-designer`, contracts `solidity-smart-contract-engineer` (adapt to Tact/TON), infra `devops-automator`/`sre-site-reliability-engineer`, security `security-engineer`, QA `reality-checker`/`evidence-collector`.
- **Override URL:** set `AGENCY_AGENTS_GIT` to a fork or mirror if you cannot use GitHub directly.

### Ecosystem health (automation)

Run `./scripts/ecosystem-audit.sh` from the repo root after deploys or on a schedule. It validates Docker, backend health JSON, public endpoints, Postgres/Redis, SSL, bridge/bot/frontend signals, and critical `/api/v1/nodes/...` routes. Exit code `1` means a critical check failed. Use `./scripts/ecosystem-audit-alert.sh` for the same checks plus optional Telegram notification when token/chat id are in `.env`.

**Last full audit (public URLs + local stack):** 2026-04-01 — `PASSED` (0 failures). Note: Lending Oracle may log TON lite-server `-701` until contract accepts inbound oracle message; monitored separately from audit pass/fail.

**Frontend API base:** all client calls should use `API_BASE_URL` / `apiClient` from `frontend/src/lib/config.ts` and `apiClient.ts` (canonical prod: `https://api.gstdtoken.com`). Legacy hostname `v2.gstdtoken.com` must not appear in code.

### Public URLs (canonical)

- **Web UI:** `https://app.gstdtoken.com` (Nginx → `frontend:3000`)
- **REST + WebSocket:** `https://api.gstdtoken.com` and `wss://api.gstdtoken.com/ws` (Nginx → `backend-blue:8080`). Production `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` / `frontend/src/lib/config.ts` defaults use this origin.
- **Vercel (optional):** set the same `NEXT_PUBLIC_*` in the dashboard; repo `next.config.js` rewrites `/api/*` to `https://api.gstdtoken.com` when building with `VERCEL` env.

### Rollback (Docker images)

Point `image:` tags in `docker-compose.prod.yml` to the last known-good tag (keep previous tags on the host), then:

```bash
cd /home/ubuntu && ln -sf docker-compose.prod.yml docker-compose.yml && docker compose up -d
```

## 🔄 Deployment Procedures

### Backend Deploy (zero-downtime)
```bash
# 1. Build new image
cd /home/ubuntu/backend
docker buildx build --load --progress=plain -t gstd-backend-blue:vNEW .

# 2. Update docker-compose.yml image tag
# 3. Restart container
docker compose up -d backend-blue

# 4. Verify health
curl -s http://localhost:8080/api/v1/health

# 5. Update this file with new version
```

### Frontend Deploy
```bash
# 1. Build
cd /home/ubuntu/frontend
NODE_OPTIONS="--max-old-space-size=512" npx next build

# 2. Kill old process and start new
kill $(pgrep -f "next-serve")
cd /home/ubuntu/frontend && nohup npx next start -p 3000 > /tmp/frontend.log 2>&1 &

# 3. Verify
sleep 5 && curl -s -o /dev/null -w '%{http_code}' http://localhost:3000
```

### Chat-UI Deploy
```bash
# Just edit /home/ubuntu/chat-ui/index.html
# Nginx serves it statically — changes are instant
```

### Telegram Bot Deploy
```bash
# 1. Build image
cd /home/ubuntu/gstdbot
docker build -t gstd-bot:vNEW .

# 2. Update docker-compose.yml
# 3. Restart
docker compose up -d telegram-bot
```

## ⚡ Quick Health Check

```bash
# Run this to verify everything is working:
# NOTE: Backend is inside Docker network, not exposed on localhost
echo "Backend:  $(docker exec ubuntu-backend-blue-1 wget -qO- http://localhost:8080/api/v1/health | head -c 50)"
echo "Frontend: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000)"
echo "App:      $(curl -s -o /dev/null -w '%{http_code}' https://app.gstdtoken.com)"
echo "API:      $(curl -s -o /dev/null -w '%{http_code}' https://api.gstdtoken.com/api/v1/health)"
echo "Chat:     $(curl -s -o /dev/null -w '%{http_code}' https://chat.gstdtoken.com)"
echo "Bot:      $(curl -s -o /dev/null -w '%{http_code}' https://gstdbot.gstdtoken.com)"
echo "Monitor:  $(curl -s -o /dev/null -w '%{http_code}' https://monitor.gstdtoken.com)"
docker ps --format "{{.Names}}: {{.Status}}" | sort
systemctl is-active gstd-frontend
```

## 🤖 AI Models (Groq — verified 2026-03-11)

| Model ID | Name | Status |
|----------|------|--------|
| `llama-3.3-70b-versatile` | Llama 3.3 70B | ✅ Active |
| `llama-3.1-8b-instant` | Llama 3.1 8B | ✅ Active |
| `qwen/qwen3-32b` | Qwen3 32B | ✅ Active |
| `meta-llama/llama-4-scout-17b-16e-instruct` | Llama 4 Scout | ✅ Active |
| `openai/gpt-oss-120b` | GPT-OSS 120B | ✅ Active |
| `openai/gpt-oss-20b` | GPT-OSS 20B | ✅ Active |
| `moonshotai/kimi-k2-instruct` | Kimi K2 | ✅ Active |
| `groq/compound` | Groq Compound | ✅ Active (**DEFAULT**) |

## 🛡️ CORS Allowed Origins (backend routes.go)

- `https://app.gstdtoken.com`
- `https://api.gstdtoken.com`
- `https://chat.gstdtoken.com`
- `https://gstdbot.gstdtoken.com`
- `https://monitor.gstdtoken.com`
- `http://localhost:3000`
- `http://127.0.0.1:3000`
- `https://web.telegram.org`
- `https://t.me`

## 📊 Database: `distributed_computing`

Top tables by row count (as of 2026-03-22):
- `token_burns`: 3 rows (reset after refactor)
- `bridge_orders`: 6 rows (3 matched, 3 completed)
- `nodes`: 87 registered (1 online)
- `users`: 202 registered
- `tasks`: 71 total
- `staking_positions`: 0 active stakers
- **Total tables:** 153 (**102 empty** — reserved for future features)

## 🌉 Bridge (P2P) — Status

| Chain | Asset | Status |
|-------|-------|--------|
| TON | GSTD | ✅ Active |
| Solana | GSTD | ✅ Active |
| XRPL | GSTD | ✅ Active |
| Ethereum | PAXG | ✅ Active (NEW) |

**Rate (live):** 1 PAXG = ~59,370,274 GSTD (gold $4,486/oz)
**PAXG contract:** `0x45804880De22913dAFE09f4980848ECE6EcbAf78`

## 🔗 Wallet SDKs (frontend)

| SDK | Version | Wallets |
|-----|---------|--------|
| `@metamask/sdk-react` | 0.33.1 | MetaMask, Trust Wallet (EIP-6963), Coinbase |
| `@solana/wallet-adapter-react` | 0.15.39 | Phantom, Solflare |
| `@tonconnect/ui-react` | 2.3.1 | Tonkeeper, MyTonWallet |
| `xumm` | 1.0.0 | Xaman (Xumm) |
| `ethers` | 6.16.0 | PAXG ERC-20 TX building |

## 🔐 SSL Certificate

- **Domains:** *.gstdtoken.com (wildcard)
- **Expires:** May 29, 2026
- **Days remaining:** ~67

## 🧹 Cleanup Policy

- Keep only **current** + **previous** backend image (for rollback)
- Keep only **current** + **previous** bot image (for rollback)
- Prune Docker build cache periodically: `docker buildx prune -f`
- Prune unused images: `docker image prune -f`
