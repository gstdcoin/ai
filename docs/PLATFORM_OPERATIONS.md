# Platform operational contract

Updated 2026-10-28. The canonical platform is `https://app.gstdtoken.com`.
The marketing site is `https://gstdtoken.com`. The legacy `platform.gstdtoken.com` Worker has a separate registry and must not be used as evidence for this platform.

## Supported core

1. A real node registers with its persistent Ed25519 identity and operator wallet.
2. Signed heartbeats refresh its 10-minute liveness lease and, when configured, its current public URL. Outbound assigned work does not require a public URL; direct network chat does.
3. Authenticated POST `/api/v1/tasks/poll` atomically assigns supported work.
4. The node computes locally and submits a successful non-empty result to `/api/v1/tasks/complete`.
5. Only accepted assignments change task counters; only accepted funded work creates ledger rewards. Heartbeats cannot set either counter.
6. Public node/peer/reward APIs parse actual node records and exclude metadata, corrupt records and expired peers.

Node and TonConnect signature verification uses native Ed25519 rather than CPU-heavy JavaScript cryptography.
The Redis SDK may return decoded JSON objects; multi-get and queue pop preserve their JSON representation. Task results require a signed assigned worker; completion-only reporting also makes the result retrievable.

## Validation and evidence

Current acceptance is tracked in [READINESS.md](READINESS.md), with [GitHub CI and deployment results](https://github.com/gstdcoin/ai/actions). Run the platform test suite, TypeScript checks and disposable Redis financial tests before publishing. The node repository separately checks fresh-source installation and offline non-root startup.

The real platform uses one physical 3.7 compute node. Local and public-platform inference have returned real model responses. Isolated accounting tests are not mainnet transactions or proof of multi-host resilience.

Dependency audits and wallet-proof regressions are required. At the October 28 check there are no moderate/high/critical npm advisories in the platform tree, but a low-severity deepmerge issue remains in the TON Connect dependency chain without an npm-provided fix. Do not describe this as a clean independent security audit.

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

## Live single-node acceptance, 2026-10-25

Cloudflare workflow 40221527621 passed frontend validation, security audit,
isolated preview health/pages and production health. OpenNext Cloudflare
1.20.13 is required with this Next.js release; the older adapter failed at runtime.

Public unpaid inference task `bba8a5c5b8de5971` was assigned to the existing
node `d8edbeee-909a-49e5-908d-922b9bf98c43`. Its local `llama3.2:3b`
returned `GSTD_E2E_OK`; the public result API returned ready=true with that
node identity. The accepted-task counter increased, the queue drained and
the reward remained zero. An unsigned completion attempt was rejected with HTTP 401.
This demonstrates the single-node execution path; it does not demonstrate settlement,
multi-host consensus, the bridge or distributed training.
