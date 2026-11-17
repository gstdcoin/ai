# GSTD release readiness — 2026-11-17

Start with the bilingual [user guide](START_HERE.md) or [public start page](https://gstdtoken.com/docs#get-started). This document records evidence and gaps; it is not a security guarantee.

## Current status

GSTD is an **open beta on one verified physical compute node**. Any supported wallet can prove ownership; any active registered node with an explicit payout address and available model can advertise work. Registration does not create income.

There are two distinct payment paths:

- **Platform ledger:** backed credits, reservation/capture/refund and custody-owner-signed withdrawal requests at [Payments](https://app.gstdtoken.com/payments).
- **Per-job mainnet escrow:** user-signed funding/acceptance and beneficiary-signed claims at [Mainnet escrow](https://app.gstdtoken.com/escrow-mainnet). These contract balances do not migrate to or appear as platform credits.

Both accepted paid-work paths use **85% executor / 10% protocol / 5% reserve**. Free/local/promotional requests do not create withdrawable GSTD. No presence rewards, automatic buybacks or guaranteed earnings.

## Evidence and remaining gates

| Scenario | Verified evidence | Still unverified |
| --- | --- | --- |
| Source and deployment | Public site, app health and Telegram landing page returned HTTP 200; the webhook rejected an unauthenticated request. | Production continues to serve escrow v1. The verified host catalog is not deployed. |
| Real inference | One physical node. The earlier testnet job returned 391 for 17 × 23. A fresh production request reached `qwen2.5:0.5b`, but returned 331 and failed the answer check. | Production task acceptance rate, larger models and multiple independent executors. |
| Identity and accounting | Signed registration/heartbeat, wallet-bound task authorization, idempotent completion, reservation/refund and Redis CAS tests. | Adversarial multi-operator production load. |
| Full testnet escrow | Funded 0.005 tGSTD, actual node result, explicit acceptance, 0.00425/0.0005/0.00025 payouts; separate expiry/refund; recovery after reload; 21 raw transactions of coordinator/shares reconciled. | All roles used one test wallet. This is not independent-beneficiary mainnet proof. |
| Mainnet RPC and canonical token | Production catalog returned HTTP 200, RPC configured and manifest v1. A separate public TON read matched the pinned wallet code and master-derived address. | An authenticated production preflight with the current binding and a real funded payment, acceptance, payout and fee reconciliation. |
| Wallet safety | Network-specific connections/storage, one-time text authorization, actor-bound sessions, pending-operation locks; no server treasury signer in escrow. | Cross-device/ambiguous-transaction reconciliation with independent wallets. A signature alone is not a receipt. |
| Fresh installation | Linux x86-64 clean-source and offline-container CI with fixture inference passed on the node release line 3.7. | Clean ARM64/GPU/WSL hardware installation and actual drivers; macOS is best-effort, native Windows/32-bit ARM are not promised by the Bash installer. |
| Node controls | Dashboard regression tests cover model catalogue, resource estimates, public-wallet linking and authenticated operator actions. | A new operator's complete authenticated production UI journey on separate hardware. |
| Telegram and Mini App | Webhook authorization, conversation failure handling and localization regression tests exist; /start was reported working by the owner. | Final English/Russian Mini App and ordinary-question delivery on the owner's Telegram device after the latest release. |
| Recovery | Offline identity/configuration restore tests and written recovery procedure. | Encrypted off-machine backup and full platform/node restore drill on another machine. |
| Free infrastructure | Manual/cached catalogue reads, visible-tab polling, serialized mainnet RPC, bounded finance cron. | Current Cloudflare usage and headroom require authenticated account metrics. Cloudflare 1102 was observed during the audit; a successful catalogue read only establishes reachability. |
| Security | Focused authorization/accounting tests and CI dependency checks. | Exhaustive source review, independent contract assurance and proof against every exploit are not established. |

Mainnet is not declared fully proven until a real funded cycle completes. The published mainnet page is explicitly beta and warns before real-fund signatures. Attached TON budgets are not consumed fees.

## Release changes and verification

Production reported escrow manifest v1 with its RPC configured. A live mainnet funding, acceptance and payout cycle still awaits verification. The node release endpoint served signed version 3.7.2 at commit `ccf459c`.

| Scope | GitHub status |
| --- | --- |
| Escrow v2 contracts | [contracts PR #6](https://github.com/gstdcoin/contracts/pull/6) awaits approval to run CI on the fork. |
| Mainnet safety and Telegram updates | [Platform remediation branch](https://github.com/gstdcoin/ai/tree/codex/mainnet-remediation) includes separate escrow diagnostic credentials, cache and lease. Automated tests and TypeScript passed; a local Next.js webpack build on Node 22 passed. GitHub Actions and the Cloudflare build have yet to verify the branch. |
| Verified host catalog | [Platform host offers branch](https://github.com/gstdcoin/ai/tree/codex/verified-host-offers) |
| Signed node installation and updates | [Node PR #8](https://github.com/gstdcoin/gstdbot/pull/8) |
| Paired managed-inference benchmark | [Node PR #9](https://github.com/gstdcoin/gstdbot/pull/9) merged to `main`. Matched deployments and actual provider billing are still needed for a real comparison. |
| Host checks, task history and maintenance | [Node PR #10](https://github.com/gstdcoin/gstdbot/pull/10) |
| Same-origin network statistics | [Website PR #10](https://github.com/gstdcoin/web/pull/10) awaits approval to run CI on the fork. |

Before enabling escrow diagnostics in production, configure `ESCROW_MAINNET_DIAGNOSTIC_TONCENTER_API_KEY` with a separate upstream TON Center quota. Verify deployment against the live endpoints and signed release manifest.

## Repository roles

| Repository | Role |
| --- | --- |
| [ai](https://github.com/gstdcoin/ai) | Platform, canonical registry, ledger, escrow orchestration and Telegram webhook |
| [gstdbot](https://github.com/gstdcoin/gstdbot) | Canonical node/installer and operator dashboard |
| [web](https://github.com/gstdcoin/web) | Public explanation, start guide, installation and optional free demo |
| [contracts](https://github.com/gstdcoin/contracts) | Contract sources, tests and deployment evidence; source publication does not deploy contracts |
| [A2A](https://github.com/gstdcoin/A2A) | Experimental signed SDK clients; monitors are not compute executors by default |
| [gstd-bridge](https://github.com/gstdcoin/gstd-bridge) | Deferred research; no production bridge or user deposits |
| [gstdcoin](https://github.com/gstdcoin/gstdcoin) | Public profile and navigation |

The canonical domain is gstdtoken.com. The platform, Redis, DNS/hosting and bootstrap remain central dependencies. Temporary tunnel URLs may change. Do not describe this deployment as unstoppable, unhackable or fully decentralized.

Embedded deployment/MCP copies are retired. Use the dedicated contract and A2A repositories. Cluster installation creates independent node identities, not pooled multi-machine model memory. Node software never needs a Telegram bot token, wallet seed or custody signing key.

Further details: [ecosystem](ECOSYSTEM.md), [mainnet escrow](MAINNET_ESCROW.md), [finance](FINANCE_V2.md), [operator guide](https://github.com/gstdcoin/gstdbot/blob/main/docs/OPERATOR_PANEL.md).
