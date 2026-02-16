# GSTD Platform — Capital Audit Report
**Date:** 2026-02-15

## Executive Summary

| Component | Status | Notes |
|-----------|--------|------|
| Backend | ✅ OK | Builds, API healthy |
| Frontend | ✅ OK | Builds; TMA /tma deployed |
| Database | ✅ OK | Connected, migrations applied |
| Host Nginx | ✅ OK | Serving app.gstdtoken.com |
| Docker nginx-lb | ⚠️ Disabled | Port conflict with host; stopped |
| Bot | ✅ OK | Running |
| Leviathan WS | ⚠️ Verify | Route exists; restart backend to apply |

---

## 1. Backend

- **Build:** `go build .` — OK
- **Health:** `GET /api/v1/health` — 200
- **Stats:** `GET /api/v1/stats/public` — 200
- **Gold Multiplier:** `GET /api/v1/cosmic/gold-multiplier` — 200

## 2. Frontend

- **Build:** `npm run build` — OK (fixed import paths in tma.tsx)
- **Pages:** /, /dashboard, /tma, /agent, etc.
- **TMA:** Page exists; running container may have old build → **rebuild frontend image**

## 3. Database

- **Status:** Connected
- **Migrations:** 69 files
- **Tables:** tasks, users, devices, nodes, platform_funds, telegram_users, etc.

## 4. Docker Architecture

**Current setup:**
- **Host Nginx** (port 80/443) — primary; proxies to 127.0.0.1:8080 (backend) and 127.0.0.1:3000 (frontend)
- **Backend** — blue/green replicas, internal 8080 (no host mapping; something else serves 8080?)
- **Frontend** — 127.0.0.1:3000:3000 exposed
- **gstd_nginx_lb** — Stopped (was restart loop: "host not found backend-blue")

## 5. Fixes Applied

1. **tma.tsx** — Fixed imports: `../../lib/` → `../lib/`
2. **docker-compose.prod.yml** — Removed frontend `depends_on: nginx-lb`
3. **gstd_nginx_lb** — Stopped, `--restart=no` to prevent loop

## 6. Recommended Actions

```bash
# Deploy script
./scripts/deploy-platform.sh [frontend|backend|all]

# Verify
curl -sk https://app.gstdtoken.com/api/v1/health
curl -sk https://app.gstdtoken.com/tma
```

## 7. Project Structure

```
/home/ubuntu/
├── backend/          # Go API
├── frontend/         # Next.js
├── autonomy/         # Bot, agent, n8n
├── nginx/            # Docker nginx config (load-balancer.conf)
├── docs/             # Documentation
└── docker-compose.prod.yml
```

## 8. Environment

- `.env` — DB, Redis, TON, Telegram, Ollama
- `BOT_API_KEY` / `TELEGRAM_BOT_TOKEN` — for bot API auth
- `NEXT_PUBLIC_API_URL` — https://app.gstdtoken.com
