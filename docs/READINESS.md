# GSTD release readiness — 2026-11-05

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
| Source and deployment | Platform d29aedf2 passed CI and Cloudflare deployment; website/node/SDK/bridge default-branch checks were green at the audit start. | A green build does not certify every live interaction or all dependencies. |
| Real inference | One physical node; exact qwen2.5:0.5b returned 391 for 17 × 23 in the completed testnet job. | General answer quality, very large models and multiple independent executors. |
| Identity and accounting | Signed registration/heartbeat, wallet-bound task authorization, idempotent completion, reservation/refund and Redis CAS tests. | Adversarial multi-operator production load. |
| Full testnet escrow | Funded 0.005 tGSTD, actual node result, explicit acceptance, 0.00425/0.0005/0.00025 payouts; separate expiry/refund; recovery after reload; 21 raw transactions of coordinator/shares reconciled. | All roles used one test wallet. This is not independent-beneficiary mainnet proof. |
| Mainnet RPC and canonical token | Read-only preflight passed: network -239, canonical master, pinned wallet code and master-derived wallet address. No financial transaction sent. | Real mainnet payment, accepted work, payout and fee reconciliation. The node wallet had 0 GSTD and 0.157332829 TON at that check. |
| Wallet safety | Network-specific connections/storage, one-time text authorization, actor-bound sessions, pending-operation locks; no server treasury signer in escrow. | Cross-device/ambiguous-transaction reconciliation with independent wallets. A signature alone is not a receipt. |
| Fresh installation | Linux x86-64 clean-source and offline-container CI with fixture inference passed on the node release line 3.7. | Clean ARM64/GPU/WSL hardware installation and actual drivers; macOS is best-effort, native Windows/32-bit ARM are not promised by the Bash installer. |
| Node controls | Dashboard regression tests cover model catalogue, resource estimates, public-wallet linking and authenticated operator actions. | A new operator's complete authenticated production UI journey on separate hardware. |
| Telegram and Mini App | Webhook authorization, conversation failure handling and localization regression tests exist; /start was reported working by the owner. | Final English/Russian Mini App and ordinary-question delivery on the owner's Telegram device after the latest release. |
| Recovery | Offline identity/configuration restore tests and written recovery procedure. | Encrypted off-machine backup and full platform/node restore drill on another machine. |
| Free infrastructure | Manual/cached catalogue reads, visible-tab polling, serialized mainnet RPC, bounded finance cron. | Representative public load. Cloudflare 1102 was observed during audit; later catalogue/preflight reads succeeded. Intermittent resource failures are not declared resolved by one success. |
| Security | Focused authorization/accounting tests and CI dependency checks. | Exhaustive source review, independent contract assurance and proof against every exploit are not established. |

Mainnet is not declared fully proven until a real funded cycle completes. The published mainnet page is explicitly beta and warns before real-fund signatures. Attached TON budgets are not consumed fees.

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
