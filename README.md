# GSTD Platform

> Dashboard and serverless API for the GSTD decentralized compute network.  
> Deployed on Vercel. Zero server costs. Fully open-source.

Live: [app.gstdtoken.com](https://app.gstdtoken.com)

---

## What This Repo Is

This is the coordination layer of the GSTD network. It does four things:

1. **Node Registry** — nodes register here on startup, heartbeat every 8 minutes to stay visible
2. **Task Queue** — AI/compute tasks are submitted here and dispatched to available nodes via per-node priority queues
3. **AI Inference API** — OpenAI-compatible endpoint (`/api/v1/chat/completions`) that routes requests to the best available node in the network
4. **Dashboard UI** — wallet connection, AI chat, network stats, earnings tracker

There is no backend server. Everything runs as Vercel serverless functions. State is stored in Upstash Redis (Vercel KV). Cost at any scale within Vercel's free tier: **$0/month**.

---

## Architecture

```
app.gstdtoken.com  (Vercel — free)
├── /                          Dashboard UI (Next.js)
├── /api/v1/nodes/
│   ├── register               Node startup registration
│   ├── heartbeat              Keepalive (TTL refresh, 10-min TTL)
│   ├── list                   All active nodes + capabilities
│   └── peers                  P2P multiaddrs for bootstrap
├── /api/v1/tasks/
│   ├── poll                   Node picks up next task (priority queue first)
│   ├── complete               Report task done + earnings
│   ├── result                 Store/poll inference result (120s TTL)
│   └── fail                   Report task failed
├── /api/v1/chat/
│   └── completions            OpenAI-compatible inference (routes to GSTD nodes)
├── /api/v1/network/
│   └── info                   Machine-readable network manifest
├── /api/v1/treasury/
│   └── status                 Treasury state + distribution trigger
├── /api/v1/campaigns/
│   ├── create                 Company creates GSTD reward campaign
│   ├── list                   Active campaigns
│   └── join                   Node joins campaign
└── /api/v1/stats/
    └── public                 Public network stats
```

---

## How Inference Works

When a request hits `/api/v1/chat/completions`:

1. The platform scores all active nodes by model match, load, latency, and uptime
2. The task is pushed to the best node's priority queue (`tasks:inference:{node_id}`)
3. The node polls every 5 seconds, picks up the task, and processes it
4. The result is stored at `task:result:{task_id}` (120s TTL)
5. The platform short-polls for the result and returns it to the client (max 25s)

If no nodes are available for the requested model, the API returns a helpful 503 with a link to set up a node. No external AI provider fallback.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (Pages Router), TypeScript |
| Styling | Tailwind CSS, shadcn/ui, Framer Motion |
| State | Vercel KV (Upstash Redis) |
| AI Inference | GSTD node network (routed via task queue) |
| Hosting | Vercel (free tier) |
| Wallets | TON Connect, MetaMask, Phantom |

---

## Monorepo Structure

```
gstdai/
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── api/v1/         ← serverless API routes
    │   │   └── ...             ← dashboard UI pages
    │   ├── components/         ← React components
    │   └── lib/
    │       ├── kv.ts           ← Upstash Redis wrapper
    │       └── ratelimit.ts    ← sliding-window rate limiter
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
| `TREASURY_SECRET` | Any secure random string — protects the treasury POST endpoint |

### 3. Deploy

Vercel auto-deploys on every push to `main`.

---

## AI Models Supported

| Model ID | Alias / Notes |
|---|---|
| `llama-3.3-70b-versatile` | Default — also accepts `gpt-4`, `gpt-4o`, `auto` |
| `llama-3.1-8b-instant` | Fast — also accepts `gpt-3.5-turbo` |
| `meta-llama/llama-4-scout-17b-16e-instruct` | Latest Llama 4 |
| `qwen/qwen3-32b` | Reasoning |
| `moonshotai/kimi-k2-instruct` | Long context |
| `openai/gpt-oss-120b` | Large |
| `openai/gpt-oss-20b` | Balanced |
| `mixtral-8x7b-32768` | Fast, large context |

All inference routes to nodes in the GSTD network. Model availability depends on which nodes are online.

---

## Health Checks

```bash
# Network stats
curl https://app.gstdtoken.com/api/v1/stats/public

# Active nodes
curl https://app.gstdtoken.com/api/v1/nodes/list

# Network manifest (for AI agents)
curl https://app.gstdtoken.com/api/v1/network/info

# Inference test
curl -s -X POST https://app.gstdtoken.com/api/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"ping"}],"max_tokens":10}'
```

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
