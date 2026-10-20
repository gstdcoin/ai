# Implementation status

Scope: `ai`, `gstdbot`, `A2A`, `web`. Out of scope: `contracts`, `gstd-bridge` (do not touch).

Open Intelligence MVP work-in-progress and verification status: [GSTD_OPEN_INTELLIGENCE_STATUS.md](./GSTD_OPEN_INTELLIGENCE_STATUS.md). It is local only, not deployed; do not infer completion from older stage notes below.

## Current stage
Stage 1 done locally (uncommitted, not pushed): in-browser worker for the phone, edge-AI budget guard, removal of unused wallet/TensorFlow dependencies.

## Verified
- `ai/frontend`: `tsc --noEmit` clean; `npm test` 26 vitest + 11 node tests pass; `next build` compiles.
- Live: `app.gstdtoken.com` health/network stats/`/tma` return 200; Telegram webhook returns 401 without the secret header; legacy `gstdbot.gstdtoken-site.workers.dev` redirects (301) to `app.gstdtoken.com`.
- `gstdbot`: tests 107/107 (after URL cleanup, pushed).

## Changed in this stage (uncommitted in `ai`)
- `frontend/src/lib/browserWorker.ts` (+ test), `components/tma/BrowserWorkerPanel.tsx`, `pages/tma.tsx`: phone/browser worker using the signed node protocol; runs `sha256_verify` tasks only.
- `frontend/src/lib/edgeAi.ts`: global daily cap (`EDGE_AI_DAILY_CAP`, default 400) and 1h cache for context-free questions.
- Removed unused `useMultiChainWallet`, `WalletProviders`, `BrowserNodePanel` and the MetaMask/Solana/TensorFlow/xumm packages; prod audit now 2 moderate (`@tailwindcss/typography` -> `postcss-selector-parser`).

## Fixed earlier (pushed)
Telegram bot (webhook, i18n, edge-AI fallback), Mini App framing/CSP, DEX iframe replaced by link, real network ticker, dead `platform.gstdtoken.com` URLs replaced.

## Known blockers
- No online nodes and no external task source: network is idle (0 nodes online, 0 tasks).
- Stage 2: `lib/verifyProbe.ts` — poll hands capable workers an unpaid `sha256_verify` self-check (server-known answer, max one per node per 5 min, answer hidden from the worker); `tasks/complete` counts `stats:probe_verified` / `stats:probe_failed`. Tests cover duplicate and unassigned completion.
- Presence rewards are off (`MOBILE_PRESENCE_REWARDS`), correctly: no work, no payout.
- Browser worker needs Ed25519 in WebCrypto (recent iOS/Android WebViews); unsupported browsers see a notice.
- Not tested end-to-end against production KV (needs a funded task and a wallet).
- Contract owner actions (deploy/sign) are outside this scope.

## Next three tasks
1. Check Docker image on arm64; require signed heartbeat for all nodes once old clients are updated (unbound nodes are still accepted); constant-time TREASURY_SECRET compare.
2. Check `A2A` SDK against current `/api/v1/tasks/*` (install, types, timeouts) with a compatibility test.
3. Audit `gstdbot` node start-up on Linux/Raspberry Pi 4 (non-root, resource limits, restart after connection loss).

## Commands
```
cd D:\gstd\upstream\ai\frontend
npx.cmd tsc --noEmit; npm.cmd test; npx.cmd next build
node ..\scripts\guard.mjs        # from ai\ root
```
Deploy of `ai` is automatic on push to `main` (needs your permission to push).

## Stage 3 - A2A compatibility
- A2A SDK/swarm use legacy unsigned endpoints (tasks/worker/pending, tasks/worker/submit, nodes/register, nodes/heartbeat, genesis/ignite, training/gradient, credits/balance, chat/completions): all exist in this repo; live probe of health, nodes/public, agents/stats/network = 200, unregistered pending = 403 (expected).
- Fixed: A2A swarm_client defaulted to POST /registry/join, which returns 404; now uses /nodes/register. Python tests not run locally (no Python); node tests 2/2.

## Stage 4 - gstdbot node start (Linux / Raspberry Pi 4)
- Fixed in install.sh: A && B || C precedence made the systemd branch run on any host with passwordless sudo; now requires systemctl. Non-root users get a per-user systemd unit plus linger (no root needed). Unit now has network-online ordering, MemoryMax=768M, CPUQuota=80%, Nice=10, and hardening in system mode. Bridge unit is created only if its binary exists (previously crash-looped every 5s). CLI wrapper uses journalctl --user in user mode. Added .gitattributes (LF for *.sh/*.service).
- Already fine: Restart=always, node-side backoff for platform/mesh failures, SIGTERM handler, Docker memory limit and healthcheck.
- Not verified: real Raspberry Pi run (bash -n syntax check only), arm64 Docker build.

## Stage 5 - funded task source
- Security fix: `campaigns/create` debited any wallet's balance given only its address, and `marketplace/request` let anyone spend any campaign's budget (a colluding node could then collect the reward). Both now require the X-Session-Token of the funding wallet (lib/walletSession.ts). Tests: lib/campaignAuth.test.ts (401/403 without matching session, success with it, balance untouched on rejection). No frontend caller used these routes; API clients must log in via /users/login first.
- Reviewed chat/deduct: already session-bound. Fixed a budget race: campaigns/join, tasks/complete and tasks/worker/submit rewrote the whole campaign blob (read-modify-write), so a stale write could restore already-reserved budget. They now only INCR a separate `cstats:<id>:tasks` counter (merged in campaigns/list); join is read-only. Test added.
- Reviewed nodes/* and credits/*: settle, confirm-settlement, ton-webhook need TREASURY_SECRET; deregister needs wallet match; claim-rewards only moves a wallet's own pending to its own balance. Gap: nodes/heartbeat was unauthenticated, so anyone could fake liveness/stats of any node. Now a node with a bound key must send a valid Ed25519 signature (gstdbot platform-link already does). Unbound legacy nodes still accepted for compatibility - remaining spoofing surface. Test: lib/heartbeatAuth.test.ts.
