# GSTD Project Status

> **Keep this file up to date.** Every time you ship a significant change, update the relevant section.  
> This prevents "we already did that" and "why did we do it that way" conversations.

Last updated: 2026-08-16

---

## System Health

| Component | Status | Notes |
|-----------|--------|-------|
| app.gstdtoken.com | ❌ DOWN since 2026-08-13 21:01 UTC | Vercel blocked the whole team: "exceeded our fair use limits" (http://vercel.link/fair-use), returns HTTP 402 DEPLOYMENT_DISABLED on every route. Not a code bug — needs a human to resolve in the Vercel dashboard (team `aidos-projects-1732011b`, project `prj_j2gQqRULHdMowbDHZt7wSqs2z3Bf`). Breaks node register/heartbeat, task poll/complete, settlement relay, and the Telegram bot (all call this host). |
| gstdtoken.com | ✅ Live | Cloudflare Workers, landing page — unaffected by the Vercel outage above |
| Upstash Redis (KV) | ✅ Connected | Vercel KV store (unreachable while the outage above lasts, since it's only ever accessed via app.gstdtoken.com's API routes) |
| TON Contracts | ✅ Deployed | GSTDJetton, SettlementMaster v2, AgentRegistry, DAOVoting, EcosystemTreasury, Escrow live on mainnet (re-verified on-chain 2026-08-13); GSTDJetton admin renounced (`addr_none`); SettlementMaster v2 adds quorum-attested P2P settlement, not externally audited. SettlementMaster/EcosystemTreasury owner deliberately NOT transferred to DAOVoting — see governance quorum bug below. |
| DAOVoting governance | ⚠️ Live but unusable as designed | `Proposal.quorumStake` is set from `minProposalStake` (a GSTD-denominated constant, 10,000 GSTD = `1e13`) but votes are counted in raw attached TON (`CastVote`'s weight = `context().value`), not GSTD — see `DAOVoting.tact:243,284`. Since both use 9-decimal nano units, the code compares a TON-vote-sum against a threshold meant for GSTD, i.e. ~10,000 TON of real voter stake is needed to ever reach quorum. No proposal can realistically pass. Do not transfer SettlementMaster/EcosystemTreasury ownership to this contract until a v2 fixes the quorum math — doing so now would permanently brick protocol admin actions (pause, key rotation, parameter changes) with no way to ever govern your way out. |
| gstd-a2a (PyPI) | ✅ Published | `pip install gstd-a2a` — v2.1.0, first publish 2026-07-19 |
| Bridge validators | ❌ Deferred, not deployed | No MPC key shares generated, no Solana/XRPL vault wallets exist, CI red since 2026-05-26. Not just "needs operators" — needs to actually be built out first. See gstd-bridge/README.md status banner. |
| Docker node image | ⚠️ Stale until next push | `ghcr.io/gstdcoin/gstd-node` — CI publish job existed but had `if: github.repository == 'gstdcoin/gstd-node'` (repo is actually `gstdcoin/gstdbot`), so it silently never ran; fixed 2026-08-13. `goldenbit/gstd-node:latest` on Docker Hub is a one-off manual push from 2026-03, not kept current — don't treat it as the maintained image. |
| Known vulnerabilities | ✅ Remediated 2026-07-19 | npm (frontend/web), Cargo (bridge, partial) — see Decision Log |

---

## gstdcoin/ai — Platform (app.gstdtoken.com)

**Branch:** `main` | **Deploy:** Vercel auto-deploy

### What's working
- [x] Node registry (register, heartbeat, list, peers, deregister)
- [x] Task queue (poll, complete, fail, result with 120s TTL)
- [x] OpenAI-compatible inference endpoint (`/api/v1/chat/completions`)
- [x] Agent leaderboard + marketplace + network stats
- [x] Global node operator leaderboard
- [x] Health check endpoint (`/api/v1/health`)
- [x] Edge rate limiting (proxy.ts — per-route limits)
- [x] Security headers (CSP, HSTS, X-Frame-Options)
- [x] Dashboard: Home, Tasks, Nodes tabs
- [x] Wallet connect: TON Connect, MetaMask, Phantom
- [x] i18n (multiple languages)
- [x] **Billing system** (`lib/billing.ts`) — chargeFee/refundFee, free tier 50 req/day
- [x] **Credits API** (`/api/v1/credits/balance`, `/api/v1/credits/deposit`, `/api/v1/credits/ton-webhook`)
- [x] **Model Marketplace** (`/models` page + `/api/v1/models/available`)
- [x] **Odysseus adapter** (`gstdbot/src/odysseus/`) — AGPL-compliant sidecar integration
- [x] **gstd-node lite** (`gstdbot/src/node-lite/`) — `npx gstd-node --wallet EQ...`
- [x] **TON Settlement script** (`scripts/settle.ts`) — weekly Jetton payouts
- [x] **Deposit monitor** (`scripts/deposit-monitor.ts`) — watches treasury wallet
- [x] **Treasury buyback** (`/api/v1/treasury/buyback`) — STON.fi price feed
- [x] **Network stats**: real KV data + live GSTD price from STON.fi (no synthetic data)
- [x] **Node onboarding**: step-by-step Ollama + gstdbot install visible to all visitors

### Pending
- [ ] Confirm deposit-monitor / settle.ts are actually running on schedule (not re-verified this pass)
- [ ] DAOVoting deploy status not independently re-verified 2026-07-19 (Jetton/SettlementMaster/AgentRegistry were)

### Known issues / Do not re-do
- `api.gstdtoken.com` does NOT exist — all API is at `app.gstdtoken.com/api/v1`
- No Go backend. No Docker in production. Vercel + Upstash Redis only.
- `proxy.ts` is the Next.js 16 name for what was `middleware.ts` in Next.js 13-15
- Dead pages `monitor/` and `predictions/` were removed — no API backend for them
- Legacy Go `backend/` folder (never deployed) removed 2026-08-13, along with its coupled `docker-compose*.yml`, `nginx/`, and Docker-only scripts — do not recreate it; Vercel + Upstash Redis remains the only production runtime

### Security audit note (2026-08-17) — node registration has no wallet-ownership proof
Traced the full mechanism behind the standing "reward-fraud risk" concern rather than
leaving it vague:
- `POST /api/v1/nodes/register` accepts any `wallet_address` with zero signature/proof
  of ownership. The only check (`nodes/register.ts`) is that *re*-registering an
  *existing* `node_id` must match the wallet already on file — a brand-new `node_id`
  can claim any wallet address on first registration, no proof required.
- `POST /api/v1/nodes/claim-rewards` takes `{ wallet }` from the request body with no
  auth at all and moves `rewards:pending:{wallet}` into that wallet's spendable GSTD
  credit balance. This doesn't let an attacker redirect funds to a *different* wallet
  (the balance stays keyed to the target wallet), but it is an unauthenticated action
  on someone else's account state.
- `POST /api/v1/tasks/complete` (`tasks/complete.ts`) is better than it looks at first
  read: it requires a real `task_assigned:{task_id}` record created by `tasks/poll.ts`
  and consumes it (no replay), and enforces the wallet-header match. But there is no
  check on the *quality* of `result` — a self-registered node can poll for a real,
  paying-user task and "complete" it with garbage, and still collect the reward as
  long as the assignment record is genuine.
- Net effect: the cheapest real attack isn't wallet hijacking (accrual stays keyed to
  the wallet on the node record, not stealable to a different address) -- it's Sybil
  farming: one wallet, many free self-registered `node_id`s, each polling for and
  fake-completing real tasks, multiplying reward accrual with no extra hardware.
- **Mitigated 2026-08-17** (does not close the gap, only bounds its cheapest form):
  `nodes/register.ts` now caps new `node_id` registrations at 10 per wallet
  (`wallet_node_count:{wallet}` in KV). Real fixes would need either (a) TonConnect
  signature-proof at registration (prove the caller controls the wallet's private
  key, standard "sign this challenge" pattern) or (b) redundant/quorum verification
  of task results before paying out, the same principle SettlementMaster's on-chain
  `SettleTaskWithProof` already uses for on-chain settlement -- this platform-level KV
  credit system has no equivalent. Neither implemented here: both are security-critical
  changes to a live payout path that need real review, not a rushed pass.

---

## gstdcoin/gstdbot — Node OS

**Docker:** `ghcr.io/gstdcoin/gstd-node:latest` (CI publish job fixed 2026-08-13 — see System Health above) | **Multi-arch:** amd64 + arm64

### What's working
- [x] Node registration on startup
- [x] Heartbeat every 8 min
- [x] Task polling every 5s
- [x] Local AI inference execution
- [x] Earnings reporting
- [x] Dashboard UI on port 8080
- [x] CI: TypeScript check + tests
- [x] CI: Docker multi-arch build + push on main/tags
- [x] Real fine-tuning: `finetune` capability gated on a verified Python/PEFT
      environment (`scripts/finetune.py --check`); produces genuine LoRA
      adapters (Qwen2.5 family, CPU or GPU) uploaded to the node's local
      IPFS daemon. Verified live 2026-07-19: a real task processed end-to-end
      on this Pi, `metacognitive_score: 0.44` (computed, not the old
      `Math.random()` placeholder), resulting adapter fetched back from IPFS
      and confirmed non-trivial (96 LoRA tensors, all with nonzero `lora_B`
      weights — proof gradient descent actually ran, since LoRA B matrices
      are zero-initialized by convention). See
      `gstdbot/docs/superpowers/plans/2026-07-19-real-finetuning.md`.
- [x] Real, non-stub P2P peer discovery: `src/p2p/peers.ts` is a genuine
      decentralized plain-HTTP gossip implementation (disk-persisted peer
      table, TTL, latency-based scoring, capability-match routing, gossip
      propagation), bootstrapping from `GSTD_SEED_PEERS` + a GitHub-raw seed
      list -- not app.gstdtoken.com. Corrected 2026-08-16: this file used to
      say "P2P stub ... needs real peer discovery implementation" here, which
      was wrong by the time it was checked (verified by reading the file in
      full, then by actually running a node live and watching it gossip with
      a real peer). Separate from this: `src/p2p/node.ts`'s libp2p mesh (used
      for quorum-attested settlement) is a second, disconnected P2P system --
      that redundancy is real and still unaddressed.

### Pending
- [ ] Structured logging (currently console.log only)
- [ ] Only `qwen2.5:0.5b` is wired into the platform's job-submission API so far
      (the only size this one CPU-only node can serve); larger Qwen2.5 sizes
      are already supported in `finetune.py`'s code but need a GPU node to
      actually claim them before adding to `gstdai`'s `SUPPORTED_MODELS`

---

## gstdcoin/gstd-bridge — Cross-Chain Bridge

**Language:** Rust | **Deploy:** docker-compose on validator machines
**Status (verified 2026-07-19): deferred.** The items below are *implemented in
code* but have never been run — no validator, no key shares, no vault wallets.
Treat as design docs, not a working system, until the Pending items are done.

### Implemented in code (not yet run in practice)
- [x] libp2p P2P network (Kademlia + Gossipsub)
- [x] Multi-chain monitoring: TON, Solana, XRPL
- [x] Consensus engine (67% quorum, 10min timeout)
- [x] MPC threshold signing (Ed25519 Shamir t-of-n)
- [x] GSTD platform heartbeat + peer bootstrap
- [x] docker-compose for production

### Pending (blockers — none of this has happened yet)
- [ ] CI red since 2026-05-26 — fix before anything else
- [ ] Generate real MPC key shares (`./data/key_share.bin` doesn't exist)
- [ ] Create actual Solana and XRPL vault wallets (`vault_address = ""` for all 3 chains in bridge.toml)
- [ ] Recruit 3+ validator operators with 10K+ GSTD staked
- [ ] First real end-to-end bridge transfer, on testnet before mainnet
- [ ] Cargo dependency vulnerabilities: `cargo update` applied 2026-07-19 (20→14 via OSV.dev), remaining 14 need a libp2p 0.52→newer major bump (gossipsub/yamux/quinn-proto/rustls-webpki all pinned by libp2p's own deps) — deferred until the bridge is actually being built out, since it's a breaking change with no way to test it against a real validator set yet

---

## gstdcoin/A2A — Python Agent SDK

**Package:** `pip install gstd-a2a` | **PyPI:** live, v2.1.0 (published 2026-07-19)

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
- [ ] Async client variant (`aiohttp` based)

### Notes
- CI's `on.push` trigger never included `tags:`, so the tag-triggered publish job
  was dead code until fixed 2026-07-19 — this is *why* it took until v2.1.0 to
  actually publish despite the publish step existing since the SDK's early days.
- Repo has two diverged, unrelated default-branch candidates: `master` (active,
  what CI/PyPI publish actually run from) and a stale `main` (last touched with
  an abandoned Vercel/OpenClaw/Groq direction, unrelated to the current
  architecture). Recommend deleting `main` unless someone has a reason to keep it.

---

## gstdcoin/contracts — TON Smart Contracts (lives in gstdai/contracts)

**Language:** Tact | **Status:** Deployed to TON mainnet, verified on-chain 2026-07-18

### What's working
- [x] `GSTDJetton.tact` — GSTD token (Jetton standard), live, admin renounced (`addr_none`)
- [x] `SettlementMaster.tact` — task payment settlement, live, owner set to a dedicated admin wallet, not paused
- [x] `AgentRegistry.tact` — on-chain node/agent registry, live
- [x] TON EcosystemTreasury vault — live, deployed 2026-07-08, correctly separate from the jetton master address
- [x] CI: syntax validation on push

### Pending
- [ ] `DAOVoting.tact` governance quorum is unreachable in practice (GSTD-denominated threshold compared against TON-denominated votes) — see System Health above. Needs a v2 redesign before any contract ownership is handed to it; not started, deliberately deferred rather than rushed.
- [ ] `bridge/ton/GstdBridge.tact` — bridge is deferred (see gstd-bridge section), no build output needed yet
- [ ] `contracts/deployer.json` mnemonic was leaked in git history — rotated to a new (currently unfunded) wallet 2026-07-18, purged from history + force-pushed. Fund the new deployer wallet before the next contract deploy.

---

## gstdcoin/web — Landing Page (gstdtoken.com)

### What's working
- [x] Static Next.js site (Cloudflare Workers, independent of app.gstdtoken.com's Vercel outage)
- [x] CI: TypeScript check + build
- [x] Real network stats widget: `LiveNetworkStatus.tsx` calls
      `/api/v1/stats/public` and is honest about failure -- shows an amber
      "API temporarily unreachable" banner and `—` instead of a fake `0` when
      the platform is down, never fabricates numbers. Corrected 2026-08-16:
      this was already built by the time it was checked, this file was stale.
- [x] Live chat that bypasses app.gstdtoken.com entirely (`/api/chat`,
      `/ai` page): tries real network nodes first via the same GitHub-raw
      seed list gstdbot's own peers.ts bootstraps from, falls back to
      Cloudflare Workers AI (same account, no new vendor) only if every node
      is unreachable, with real token streaming end-to-end. Also implements
      the network's own peer protocol (`/v1/ollama/completions`,
      `/api/peers/heartbeat`) so it's a real, always-on bootstrap peer, not
      just a proxy -- added to `gstd-seed-peers.txt`. Added 2026-08-16.

### Pending
- [ ] Update contract addresses section once deployed

---

## What Blocks Full Decentralization

In priority order:

1. **Actually build out gstd-bridge** (MPC keys, real vault wallets, 3+ validators) → cross-chain transfer without custodians works
2. **Grow node network** → more compute = more resilient, more models available; single node today (this Pi)

TON contracts (1 and 2 from the old list) are done — settlement/registry/token are live on mainnet.

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
| GSTD is utility-only, no APY/staking language | Token is for AI compute payment, not investment; legal and ethical clarity | 2026-06 |
| Odysseus via HTTP adapter, not code import | AGPL-3.0 compliance: separate process = no license propagation | 2026-06 |
| Deposit-monitor runs on Pi, not Vercel | Needs long-running polling process; Vercel functions are stateless/short-lived | 2026-06 |
| Removed stale `replace` pins on x/crypto, x/net, gin in backend/go.mod | They were added to "force secure versions" but never revisited; x/crypto v0.47.0 alone had 26 open advisories a year later. The pin was also silently reverting a gin 1.12.0 bump back to 1.11.0. | 2026-07-19 |
| Swapped `@solana/wallet-adapter-wallets` for individual `-phantom`/`-solflare` packages | The bundle pulls in every wallet adapter including an unused Particle Network chain, the source of most of frontend's 61 npm vulnerabilities | 2026-07-19 |
| Rotated `contracts/deployer.json`, purged old mnemonic from git history via filter-repo + force-push | Leaked plaintext mnemonic in a public repo; on-chain check confirmed it no longer had owner rights on live contracts, but future deploys must not reuse it | 2026-07-19 |
| Fixed `GSTD_P2P_PORT` collision with the local `ipfs` pm2 process (both defaulted to 4001) | libp2p mesh was silently falling back to platform-only mode on every restart; node network stats were observed flapping to zero live during audit | 2026-07-19 |
