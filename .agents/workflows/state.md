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
│                 Last Update: 2026-03-22 (Production v186/v25)       │
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
│  │  Containers: ubuntu-backend-blue-{1,2,5,6}        │     │
│  │  Image:      gstd-backend-blue:v186                │     │
│  │  Port:       8080 (internal, via nginx)            │     │
│  │  DB:         distributed_computing                 │     │
│  │  Rollback:   gstd-backend-blue:v185                │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌─── FRONTEND (Next.js 16.1.6) ─────────────────────┐     │
│  │  Container: ubuntu-frontend-1 (Docker)             │     │
│  │  Image:     gstd-frontend:v26                     │     │
│  │  Path:      /home/ubuntu/frontend                  │     │
│  │  Pages:     14 (SSG/SSR)                           │     │
│  │  Note:      Docker-only (systemd disabled)         │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌─── GSTD BRIDGE (Rust) ────────────────────────────┐     │
│  │  Container: gstd-bridge-test                       │     │
│  │  Image:     gstd-bridge:latest                     │     │
│  │  Chains:    TON ↔ Solana ↔ XRPL                    │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌─── TELEGRAM BOT (TypeScript) ─────────────────────┐     │
│  │  Container: gstd-telegram-bot                      │     │
│  │  Image:     gstd-bot:v39                           │     │
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
| **Backend** | `gstd-backend-blue:v186` ×4 | `/home/ubuntu/backend` | `ubuntu-backend-blue-{1,2,5,6}` |
| **Frontend** | `gstd-frontend:v25` (Docker) | `/home/ubuntu/frontend` | `ubuntu-frontend-1` |
| **Telegram Bot** | `gstd-bot:v31` | `/home/ubuntu/gstdbot` | `gstd-telegram-bot` |
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
└── ssl/                        # SSL certificates
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

Top tables by row count (as of 2026-03-13):
- `token_burns`: 43,698 rows
- `agent_knowledge`: 10,658 rows
- `pow_pattern_snapshots`: 2,418 rows
- `golden_reserve_log`: 593 rows
- `agent_registry`: 285 rows
- `users`: 177 rows
- `tasks`: 81 rows
- **Total tables:** 153 (**102 empty** — reserved for future features)

## 🔐 SSL Certificate

- **Domains:** *.gstdtoken.com (wildcard)
- **Expires:** May 29, 2026
- **Days remaining:** ~79

## 🧹 Cleanup Policy

- Keep only **current** + **previous** backend image (for rollback)
- Keep only **current** + **previous** bot image (for rollback)
- Prune Docker build cache periodically: `docker buildx prune -f`
- Prune unused images: `docker image prune -f`
