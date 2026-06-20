# GSTD Ecosystem — Architecture & Integration Map

> **One-stop reference.** When you make a change, check this file to understand what it affects.  
> When you add a feature, update this file so the next developer doesn't rediscover it.

---

## What GSTD Is

A decentralized compute network where:
- **Nodes** (laptops, servers, Raspberry Pis) provide AI inference and compute
- **Tasks** are queued through a serverless platform and dispatched to the best available node
- **GSTD tokens** (on TON blockchain) are paid to node operators per completed task
- **The bridge** moves GSTD tokens across chains (TON ↔ Solana ↔ XRPL) without custodians
- **Smart contracts** on TON handle staking, governance, and settlement

No central servers. No data centers owned by GSTD. The network is the product.

---

## Repository Map

| Repo | Language | Deployed at | Purpose |
|------|----------|-------------|---------|
| [gstdcoin/ai](https://github.com/gstdcoin/ai) | TypeScript/Next.js | app.gstdtoken.com (Vercel) | Platform API + Dashboard |
| [gstdcoin/gstdbot](https://github.com/gstdcoin/gstdbot) | TypeScript/Node.js | Node operator machines | Node OS — runs on every compute node |
| [gstdcoin/gstd-bridge](https://github.com/gstdcoin/gstd-bridge) | Rust | Validator machines | Cross-chain bridge validator |
| [gstdcoin/A2A](https://github.com/gstdcoin/A2A) | Python | pip package | Agent SDK — connects any AI agent as a node |
| [gstdcoin/contracts](https://github.com/gstdcoin/contracts) | Tact (TON) | TON blockchain | Smart contracts: token, staking, governance |
| [gstdcoin/web](https://github.com/gstdcoin/web) | TypeScript/Next.js | gstdtoken.com (Vercel) | Public landing page |

---

## Integration Points (Critical)

All components talk to **one URL**: `https://app.gstdtoken.com/api/v1`

```
gstdbot (node OS)
  ├── POST /api/v1/nodes/register        ← on startup
  ├── POST /api/v1/nodes/heartbeat       ← every 8 min
  ├── GET  /api/v1/tasks/poll            ← every 5s (pick up work)
  ├── POST /api/v1/tasks/complete        ← report result + earnings
  └── POST /api/v1/tasks/fail            ← report failure

gstd-bridge (bridge validator)
  ├── GET  /api/v1/nodes/peers           ← bootstrap P2P on startup
  ├── POST /api/v1/nodes/register        ← register as validator node
  └── POST /api/v1/nodes/heartbeat       ← keepalive

gstda2a (Python agent SDK)
  ├── POST /api/v1/nodes/register        ← register AI agent
  ├── GET  /api/v1/tasks/worker/pending  ← poll for tasks (A2A alias)
  ├── POST /api/v1/tasks/worker/submit   ← submit result (A2A alias)
  └── GET  /api/v1/health                ← connectivity check

gstdweb (landing page)
  └── links to app.gstdtoken.com         ← no direct API calls
```

**Rule:** Never hardcode `api.gstdtoken.com` — that backend doesn't exist. All API is at `app.gstdtoken.com`.

---

## Platform API (gstdcoin/ai)

All routes are Next.js serverless functions in `frontend/src/pages/api/v1/`.  
State lives entirely in Upstash Redis (Vercel KV). No database. No Go backend.

```
/api/v1/nodes/
  register          POST  Node startup — stores record, TTL 10min
  heartbeat         POST  Refresh TTL — must call every <10min
  list              GET   All active nodes + capabilities
  peers             GET   P2P multiaddrs for bridge/bot bootstrap
  deregister        POST  Graceful shutdown
  rewards/my        GET   Per-node earnings history

/api/v1/tasks/
  poll              GET   Node picks up next task (priority queue)
  worker/pending    GET   A2A SDK alias for poll
  complete          POST  Report done + earnings
  worker/submit     POST  A2A SDK alias for complete
  result            GET/POST  Store/poll inference result (120s TTL)
  fail              POST  Report failure

/api/v1/chat/
  completions       POST  OpenAI-compatible inference → routes to best node

/api/v1/network/
  info              GET   Machine-readable manifest (version, endpoints, models)
  stats             GET   Live stats (nodes, tasks, GSTD paid)

/api/v1/agents/
  leaderboard       GET   Top agents by tasks completed
  marketplace       GET   Online agents accepting tasks
  stats/network     GET   Agent network summary

/api/v1/leaderboard  GET  Global node operator leaderboard
/api/v1/health       GET  KV liveness probe
/api/v1/stats/public GET  Full public stats (nodes, tasks, treasury)
/api/v1/treasury/status GET/POST  Treasury state + distribution
```

**Rate limiting:** Applied automatically by `frontend/src/proxy.ts` (Next.js 16 Edge proxy).

---

## Data Flow: AI Inference Request

```
Client (any OpenAI SDK)
  │
  ▼
POST /api/v1/chat/completions
  │
  ├─ Score all active nodes (model match, load, latency, uptime)
  ├─ Push task to best node's priority queue in Redis
  │    key: tasks:inference:{node_id}
  │
  ▼
Node (gstdbot, polling every 5s)
  │
  ├─ GET /api/v1/tasks/poll → receives task
  ├─ Runs inference locally (Ollama, llama.cpp, etc.)
  ├─ POST /api/v1/tasks/complete → stores result in Redis
  │    key: task:result:{task_id}  (TTL 120s)
  │
  ▼
Platform (short-polling, max 25s)
  │
  └─ Returns result to original client
```

---

## Data Flow: Bridge Transfer

```
User sends GSTD to source vault + memo: bridge:<chain>:<address>
  │
  ▼
Bridge validators watch chain (TON/SOL/XRPL via RPC)
  │
  ├─ Detect deposit → verify on-chain
  ├─ Broadcast ProposeTransfer via libp2p Gossipsub
  ├─ Each validator votes (requires verify_deposit() confirmation)
  │
  ▼
67% quorum reached
  │
  ├─ MPC threshold signing (Ed25519, t-of-n Shamir key shares)
  ├─ Aggregated signature → execute_withdrawal() on target chain
  │
  └─ GSTD released to recipient on destination chain (~2 min total)
```

**Vault addresses** (set via env vars — update after contract deploy):
| Chain | Env var | Current placeholder |
|-------|---------|---------------------|
| TON | `NEXT_PUBLIC_TON_VAULT` | `EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO` |
| Solana | `NEXT_PUBLIC_SOL_VAULT` | `AzN7uPhQZgThxsRvhNGHPUPRjdEjScTbqQdf5gt6Fqby` |
| XRPL | `NEXT_PUBLIC_XRP_VAULT` | `ryHSvxUqpcTjoESHbCkMJoqzenjFgPQSf` |

---

## Token Economics

| Flow | Amount |
|------|--------|
| Task reward (node operator) | 0.01–100 GSTD / task |
| Node operator share | 85% of task fee |
| Ecosystem Treasury | 10% |
| Value Fund (free-tier subsidy) | 5% |
| Burn (deflationary) | 3% |
| Bridge fee | 0.1% (min 1 GSTD), split among validators |
| Referral L1/L2/L3 | 5% / 3% / 1% of referred earnings |

---

## Redis Key Schema (Upstash KV)

```
node:{node_id}                    Hash  Node record (TTL 600s, refreshed by heartbeat)
tasks:inference:{node_id}         List  Priority task queue per node (LPUSH/RPOP)
task:result:{task_id}             String  Inference result (TTL 120s)
stats:tasks_completed             Counter  Global task count
stats:gstd_paid                   Counter  Total GSTD distributed
stats:nodes_peak                  Counter  Peak concurrent nodes
```

---

## Deployment Checklist (new environment)

### Platform (app.gstdtoken.com)
- [ ] Connect Vercel KV store (auto-adds `KV_REST_API_URL` + `KV_REST_API_TOKEN`)
- [ ] Set `TREASURY_SECRET` (any random string)
- [ ] After contract deploy: set `NEXT_PUBLIC_TON_VAULT`, `NEXT_PUBLIC_SOL_VAULT`, `NEXT_PUBLIC_XRP_VAULT`
- [ ] After contract deploy: set `GSTD_JETTON_ADDRESS`

### Node OS (gstdbot)
- [ ] `docker pull goldenbit/gstd-node:latest`
- [ ] Set `GSTD_WALLET_ADDRESS`, `GSTD_SWARM_URL=https://app.gstdtoken.com`
- [ ] `docker run -e GSTD_WALLET_ADDRESS=EQ... goldenbit/gstd-node`

### Bridge Validator
- [ ] `git clone https://github.com/gstdcoin/gstd-bridge && cd gstd-bridge`
- [ ] `cp .env.example .env` and fill in RPC URLs
- [ ] `docker-compose up -d`
- [ ] Requires 10,000+ GSTD staked to join validator set

### TON Contracts
- [ ] `cd contracts && npm install && npx blueprint build`
- [ ] Test on testnet: `npx blueprint run deploy --testnet`
- [ ] Deploy to mainnet: `npx blueprint run deploy --mainnet`
- [ ] Copy addresses to Vercel env vars

---

## What's NOT Yet Live (Pending Contract Deploy)

| Feature | Blocked by |
|---------|-----------|
| On-chain task settlement | `GSTD_JETTON_ADDRESS` not set |
| Staking / NaaS registry | `SettlementMaster.tact` not deployed |
| DAO governance | `DAOVoting.tact` not deployed |
| Bridge vault enforcement | TON vault contract not deployed |

Everything else is live and working at app.gstdtoken.com.

---

## AI Models Supported (via node network)

| Model | Default alias |
|-------|--------------|
| `llama-3.3-70b-versatile` | `gpt-4`, `gpt-4o`, `auto` |
| `llama-3.1-8b-instant` | `gpt-3.5-turbo` |
| `meta-llama/llama-4-scout-17b-16e-instruct` | — |
| `qwen/qwen3-32b` | — |
| `moonshotai/kimi-k2-instruct` | — |
| `openai/gpt-oss-120b` | — |
| `openai/gpt-oss-20b` | — |
| `mixtral-8x7b-32768` | — |

Model availability depends on which nodes are online and what they've loaded.
