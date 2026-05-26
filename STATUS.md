# GSTD Project Status

> **Keep this file up to date.** Every time you ship a significant change, update the relevant section.  
> This prevents "we already did that" and "why did we do it that way" conversations.

Last updated: 2026-05-26

---

## System Health

| Component | Status | Notes |
|-----------|--------|-------|
| app.gstdtoken.com | ✅ Live | Vercel, auto-deploys on push to main |
| gstdtoken.com | ✅ Live | Vercel, landing page |
| Upstash Redis (KV) | ✅ Connected | Vercel KV store |
| TON Contracts | ⏳ Pending deploy | Code complete, needs mainnet deploy |
| Bridge validators | ⏳ Needs operators | Code complete, needs 3+ validators with staked GSTD |
| Docker node image | ✅ Published | `goldenbit/gstd-node:latest` |

---

## gstdcoin/ai — Platform (app.gstdtoken.com)

**Branch:** `main` | **Deploy:** Vercel auto-deploy

### What's working
- [x] Node registry (register, heartbeat, list, peers, deregister)
- [x] Task queue (poll, complete, fail, result with 120s TTL)
- [x] OpenAI-compatible inference endpoint (`/api/v1/chat/completions`)
- [x] Agent leaderboard + marketplace + network stats
- [x] Global node operator leaderboard
- [x] Cross-chain bridge UI (vault + memo instructions)
- [x] Health check endpoint (`/api/v1/health`)
- [x] Edge rate limiting (proxy.ts — per-route limits)
- [x] Security headers (CSP, HSTS, X-Frame-Options)
- [x] Dashboard: Home, Tasks, Nodes tabs
- [x] Wallet connect: TON Connect, MetaMask, Phantom
- [x] i18n (multiple languages)
- [x] Import Skill page (GSTD A2A protocol)

### Pending
- [ ] Set `GSTD_JETTON_ADDRESS` after TON contract deploy
- [ ] Set `NEXT_PUBLIC_TON_VAULT` after vault contract deploy
- [ ] On-chain settlement (blocked by contracts)

### Known issues / Do not re-do
- `api.gstdtoken.com` does NOT exist — all API is at `app.gstdtoken.com/api/v1`
- No Go backend. No Docker in production. Vercel + Upstash Redis only.
- `proxy.ts` is the Next.js 16 name for what was `middleware.ts` in Next.js 13-15
- Dead pages `monitor/` and `predictions/` were removed — no API backend for them
- `backend/` folder in repo root is legacy Go code, not deployed

---

## gstdcoin/gstdbot — Node OS

**Docker:** `goldenbit/gstd-node:latest` | **Multi-arch:** amd64 + arm64

### What's working
- [x] Node registration on startup
- [x] Heartbeat every 8 min
- [x] Task polling every 5s
- [x] Local AI inference execution
- [x] Earnings reporting
- [x] Dashboard UI on port 8080
- [x] CI: TypeScript check + tests
- [x] CI: Docker multi-arch build + push on main/tags

### Pending
- [ ] P2P stub in `src/p2p/peers.ts` — needs real peer discovery implementation
- [ ] Structured logging (currently console.log only)

---

## gstdcoin/gstd-bridge — Cross-Chain Bridge

**Language:** Rust | **Deploy:** docker-compose on validator machines

### What's working
- [x] libp2p P2P network (Kademlia + Gossipsub)
- [x] Multi-chain monitoring: TON, Solana, XRPL
- [x] Consensus engine (67% quorum, 10min timeout)
- [x] MPC threshold signing (Ed25519 Shamir t-of-n)
- [x] Persistent key shares (`./data/key_share.bin`, chmod 600)
- [x] On-chain deposit verification before voting
- [x] Real withdrawal execution via chain monitors
- [x] Vault balance accounting (re-lock on failure)
- [x] GSTD platform heartbeat + peer bootstrap
- [x] docker-compose for production
- [x] CI: cargo fmt + clippy + test

### Pending
- [ ] 3+ validator operators needed to go live
- [ ] TON vault contract address (currently placeholder)
- [ ] Solana SPL token program address
- [ ] XRPL trust line setup

---

## gstdcoin/A2A — Python Agent SDK

**Package:** `pip install gstd-a2a` | **PyPI:** pending first publish

### What's working
- [x] `GSTDClient` — low-level HTTP client with auto-auth headers
- [x] `Agent.run()` — zero-config autonomous agent loop
- [x] Task polling + result submission
- [x] Ed25519 signatures for request signing
- [x] MCP server (`tools/main.py`)
- [x] Zero-dependency connectors (`connect.py`, `connect.js`)
- [x] Unit tests (`tests/test_client.py`)
- [x] CI: pytest (3.9/3.11/3.12) + mypy + bandit
- [x] CI: auto-publish to PyPI on `v*` tags
- [x] `setup.py` with proper extras (`dev`, `ton`, `mcp`, `full`)

### Pending
- [ ] First PyPI publish (push `git tag v2.0.0 && git push --tags`)
- [ ] Async client variant (`aiohttp` based)

---

## gstdcoin/contracts — TON Smart Contracts

**Language:** Tact | **Status:** Code complete, not yet deployed

### What's working
- [x] `GSTDJetton.tact` — GSTD token (Jetton standard)
- [x] `SettlementMaster.tact` — task payment settlement
- [x] `AgentRegistry.tact` — on-chain node/agent registry
- [x] `DAOVoting.tact` — governance voting
- [x] CI: syntax validation on push

### Pending (BLOCKERS for full decentralization)
- [ ] Compile all contracts: `npx blueprint build`
- [ ] Deploy to TON testnet and verify
- [ ] Deploy to TON mainnet
- [ ] Set contract addresses as Vercel env vars in gstdcoin/ai
- [ ] Bridge vault contract (`bridge/ton/GstdBridge.tact`) — missing build output

---

## gstdcoin/web — Landing Page (gstdtoken.com)

### What's working
- [x] Static Next.js site
- [x] CI: TypeScript check + build

### Pending
- [ ] Update contract addresses section once deployed
- [ ] Add real network stats widget (calls `/api/v1/stats/public`)

---

## What Blocks Full Decentralization

In priority order:

1. **Deploy TON contracts** → unlocks on-chain settlement, staking, governance
2. **Set Vercel env vars** → connects UI to real contracts  
3. **Recruit bridge validators** (3+ operators with 10K GSTD staked) → bridge goes live
4. **Grow node network** → more compute = more resilient, more models available

Once (1) and (2) are done, the system can replace centralized AI API providers.  
Once (3) is done, cross-chain value transfer without custodians works.  
Once (4) has 100+ nodes, no single data center failure can affect the network.

---

## Decision Log (Why We Did Things This Way)

| Decision | Why | Date |
|----------|-----|------|
| Vercel + Upstash Redis, no Go backend | Zero cost, zero ops, scales automatically | 2026-05 |
| Next.js 16 `proxy.ts` (not `middleware.ts`) | Next.js 16 renamed the convention | 2026-05 |
| `afterFiles` rewrites removed | All API routes exist as files; proxy caused confusion | 2026-05 |
| Bridge uses MPC Shamir t-of-n, not multisig | No single point of failure, threshold signing more flexible | 2026-05 |
| A2A SDK polls, doesn't use webhooks | Nodes may be behind NAT/firewall, polling is universally compatible | 2026-05 |
| Dead pages `/monitor` and `/predictions` removed | No API backend existed for them; they called non-existent endpoints | 2026-05 |
