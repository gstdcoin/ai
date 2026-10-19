# Implementation status

Scope: `ai`, `gstdbot`, `A2A`, `web`. Out of scope: `contracts`, `gstd-bridge` (do not touch).

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
1. Audit gstdbot node start on Linux/Raspberry Pi 4 (no root, resource limits, restart on connection loss).
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
