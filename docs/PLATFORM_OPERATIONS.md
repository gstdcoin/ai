# Platform operational contract

Updated 2026-10-25. The canonical platform is `https://app.gstdtoken.com`.
The marketing site is `https://gstdtoken.com`. The legacy `platform.gstdtoken.com` Worker has a separate registry and must not be used as evidence for this platform.

## Supported core

1. A real node registers with its persistent Ed25519 identity and operator wallet.
2. Signed heartbeats refresh its 10-minute liveness lease and current public URL.
3. Authenticated POST `/api/v1/tasks/poll` atomically assigns supported work.
4. The node computes locally and submits a successful non-empty result to `/api/v1/tasks/complete`.
5. Only accepted assignments change task counters and ledger rewards. Heartbeats cannot set those counters.
6. Public node/peer/reward APIs parse actual node records and exclude metadata, corrupt records and expired peers.

Node and TonConnect signature verification uses native Ed25519 rather than CPU-heavy JavaScript cryptography.
The Redis SDK may return decoded JSON objects; multi-get and queue pop preserve their JSON representation. Task results require a signed assigned worker; completion-only reporting also makes the result retrievable.

## Validation for this release

- Platform: 148 Vitest tests and 11 TonConnect tests pass; TypeScript, ESLint (warnings only) and Next.js production build pass.
- Node: version 3.5.3; 207 tests pass, including subprocess failure/recovery; TypeScript build passes on Linux ARM64.
- A2A: 24 Python tests and 2 Node tests pass.
- Contracts: 21 sandbox tests pass. These are not a production settlement transaction or independent audit.

The release must also pass the repository's Cloudflare preview/deploy workflow and live node/task checks. Local tests alone do not prove production health.

Production dependencies use patched Next.js 16.4.3 and Zod 4.6.7; the production dependency audit reports zero vulnerabilities. The TON SDK dependency override is covered by all 11 wallet-proof tests. CI deployment requires both frontend validation and the security audit.

## Accounting and deployment boundaries

- Unfunded public tasks have zero reward; no presence or hourly emissions are promised.
- No synthetic price or oracle-event total substitutes for live market data or accepted-task counters.
- Ledger credits and actual on-chain transfers are separate. A funded, authorized settlement needs its own test.
- The Telegram bot is a platform webhook. Do not run a second polling bot on a node or commit bot credentials.
- Quick tunnels rotate and have no availability guarantee. Use a stable named tunnel for sustained public operation.
- One physical node proves the single-node path, not an independent multi-host mesh. The bridge and distributed training are not part of the verified core.

## Operational checks

Check `/api/v1/health`, `/api/v1/nodes/list`, `/api/v1/nodes/peers`, `/api/v1/stats/public`, and `/api/v1/network/stats`.
A green health response does not substitute for a completed task and successful result acceptance.
Keep the node package version and the current public URL in the registry, and check error logs after a restart.

Preview and production must use separate Worker names. Preview cron is disabled, and production secrets/routes are changed only after preview health/page validation passes. A preview failure must never replace the running production Worker.
