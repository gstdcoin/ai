# GSTD Platform

> Dashboard and serverless API for the GSTD decentralized compute network.  
> Deployed on Vercel. Zero server costs. Fully open-source.

Live: [app.gstdtoken.com](https://app.gstdtoken.com)

---

## What This Repo Is

This is the coordination layer of the GSTD network. It does three things:

1. **Node Registry** — nodes register here on startup, heartbeat every 8 minutes to stay visible
2. **Task Queue** — AI/compute tasks are submitted here and dispatched to available nodes
3. **Dashboard UI** — wallet connection, AI chat, network stats, earnings tracker

There is no backend server. Everything runs as Vercel serverless functions. State is stored in Upstash Redis (Vercel KV). Cost at any scale within Vercel's free tier: **$0/month**.

---

## Architecture

```
app.gstdtoken.com  (Vercel — free)
├── /                      Dashboard UI (Next.js)
├── /api/v1/nodes/
│   ├── register           Node startup registration
│   ├── heartbeat          Keepalive (TTL refresh)
│   ├── list               All active nodes
│   ├── peers              P2P multiaddrs for bootstrap
│   ├── deregister         Graceful shutdown
│   └── rewards/my         Tier + earnings info
├── /api/v1/tasks/
│   ├── submit             Push task to queue
│   ├── poll               Node picks up next task
│   ├── complete           Report task done
│   └── fail               Report task failed
├── /api/v1/chat/
│   ├── completions        OpenAI-compatible AI chat (Groq backend)
│   └── ultra-status       Available models + swarm stats
└── /api/v1/stats          Network-wide stats
    └── /public            Alias (used by dashboard widgets)
```

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (Pages Router), TypeScript |
| Styling | Tailwind CSS, shadcn/ui, Framer Motion |
| State | Vercel KV (Upstash Redis) |
| AI | Groq API (free tier — 14,400 req/day) |
| Hosting | Vercel (free tier) |
| Wallets | TON Connect, MetaMask, Phantom |

---

## Monorepo Structure

```
gstdai/
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── api/v1/     ← serverless API routes
    │   │   └── ...         ← dashboard UI pages
    │   ├── components/     ← React components
    │   └── lib/
    │       ├── kv.ts       ← Vercel KV abstraction (in-memory fallback for dev)
    │       └── config.ts   ← API base URL configuration
    ├── package.json
    └── vercel.json
```

---

## Local Development

```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
# → http://localhost:3000
```

No KV credentials needed for local dev — `src/lib/kv.ts` automatically falls back to an in-memory store.

---

## Vercel Deployment

### 1. Connect the repo

In Vercel dashboard → New Project → Import `gstdcoin/ai` → Root directory: `frontend`

### 2. Add environment variables

| Variable | Where to get it |
|---|---|
| `KV_REST_API_URL` | Vercel → Storage → Create KV store → auto-added |
| `KV_REST_API_TOKEN` | Same — auto-added when KV store is connected |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) — free |

### 3. Deploy

Vercel auto-deploys on every push to `main`.

---

## Ecosystem

| Repo | Description |
|---|---|
| [gstdcoin/web](https://github.com/gstdcoin/web) | Landing page |
| **gstdcoin/ai** | **This repo — Dashboard + API** |
| [gstdcoin/gstdbot](https://github.com/gstdcoin/gstdbot) | Node OS software |
| [gstdcoin/contracts](https://github.com/gstdcoin/contracts) | TON smart contracts |
| [gstdcoin/gstd-bridge](https://github.com/gstdcoin/gstd-bridge) | Cross-chain bridge |

---

## License

MIT
