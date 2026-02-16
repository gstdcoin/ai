# GSTD Platform — Project Structure

## Root Layout

```
/home/ubuntu/
├── backend/                 # Go API (Gin, PostgreSQL, Redis)
│   ├── cmd/                 # Entry points (nightly_audit, sync_gstd)
│   ├── internal/            # API, services, models
│   │   ├── api/             # Handlers, routes, middleware
│   │   ├── services/        # Business logic
│   │   ├── config/          # Configuration
│   │   └── models/          # Data models
│   ├── migrations/          # SQL migrations (v0..v53)
│   └── main.go
│
├── frontend/                # Next.js 16 + Tailwind
│   ├── src/
│   │   ├── pages/           # Routes: /, /dashboard, /tma, /agent
│   │   ├── components/      # React components
│   │   ├── lib/             # Config, telegram, utils
│   │   └── store/           # Zustand stores
│   └── public/              # Static assets, workers/
│
├── autonomy/                # Telegram bot, n8n, agent
│   ├── bot/                 # Go Telegram bot (main.go)
│   ├── docker-compose.autonomy.yml
│   └── ...
│
├── nginx/                   # Docker nginx config (load-balancer)
│   ├── nginx.conf
│   └── conf.d/
│
├── docs/                    # Documentation
│   ├── AUDIT_REPORT.md
│   ├── TELEGRAM_ASCENSION.md
│   └── PROJECT_STRUCTURE.md
│
├── docker-compose.prod.yml  # Main production stack
├── .env                     # Secrets (not in git)
└── scripts/                 # Deploy, maintenance
```

## Key Endpoints

| Path | Method | Description |
|------|--------|-------------|
| /api/v1/health | GET | Health check |
| /api/v1/stats/public | GET | Public stats |
| /api/v1/stats | GET | User stats (auth) |
| /api/v1/leviathan/stream | GET | SSE Leviathan ticker |
| /api/v1/leviathan/ws | GET | WebSocket Leviathan |
| /api/v1/telegram/bot/* | * | Bot API (X-Bot-Token) |
| /api/v1/marketplace/* | * | Tasks, marketplace |
| /ws | GET | WebSocket (tasks, gold multiplier) |

## Services

| Service | Port | Purpose |
|---------|------|---------|
| Host Nginx | 80, 443 | SSL, proxy to app |
| Backend | 8080 (internal) | API |
| Frontend | 3000 | Next.js |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache, pub/sub |
| Bot | — | Telegram bot |
