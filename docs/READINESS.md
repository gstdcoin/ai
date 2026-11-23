# GSTD release readiness — 2026-11-18

Start with the bilingual [user guide](START_HERE.md), [project map](INDEX.md) or [public start page](https://gstdtoken.xyz/docs#get-started). This page records dated evidence and remaining checks; it is not an independent security assurance.

<a id="current-status"></a>

## Operating model

The platform, public website and Telegram webhook are deployed. Use [live network stats](https://app.gstdtoken.xyz/api/v1/network/stats) for current node/workload counts. The platform registry, Redis, custody owner, DNS/hosting and bootstrap remain central dependencies. Independent multi-operator resilience is not established.

Two payment paths remain separate:

- **Platform ledger:** backed credits, atomic reservation/capture/refund and custody-owner-signed withdrawals at [Payments](https://app.gstdtoken.xyz/payments).
- **Per-job mainnet escrow beta:** payer-signed funding/acceptance and beneficiary-signed claims at [Mainnet escrow](https://app.gstdtoken.xyz/escrow-mainnet). These balances do not become platform credits. Production still exposes the v1 manifest; the public v2 Testnet result does not activate v2 on mainnet.

Accepted paid work uses **85% executor / 10% protocol / 5% reserve**. Free/local/promotional work creates no withdrawable GSTD. Heartbeat presence creates no reward; no income is guaranteed.

<a id="evidence-and-remaining-gates"></a>

## Verified evidence and remaining checks

| Scope | Verified evidence | Remaining boundary |
| --- | --- | --- |
| Platform release | [Deployment attempt 2](https://github.com/gstdcoin/ai/actions/runs/44257765512/attempts/2) passed. Live health returned status ok, KV ok, storage redis; catalog returned rpc_configured:true. Pages, discovery, manifests and Open Intelligence passed release checks. | Health does not prove completion of a paid task or mainnet payout. |
| Preview isolation | A fresh empty Upstash database, distinct production origin/token, private 30-minute CI capability, anonymous 403, no preview cron or production route. | Temporary preview storage expires after 72 hours; it must never hold customer backing. |
| Redis accounting | Actual SDK/production Lua: lease and reservation races, 85/10/5, refunds, failed pre-write connections and lost replies after commits. AOF SIGKILL/restart preserved balances, captured-job journal, grants and queue. | Synthetic fixtures stay in disposable databases; these do not establish production backing or storage-device disaster recovery. |
| Signed worker controls | Registration/heartbeats, wallet-bound authorization, capacity admission and funded task acceptance have CI coverage. [Node main CI](https://github.com/gstdcoin/gstdbot/actions/runs/44256785028) passed 382 tests plus installer/container smoke checks. | Adversarial multi-operator load and new hardware installations remain separate acceptance work. |
| Public v2 Testnet | Four independent signing keys under one operator completed 0.85/0.10/0.05 tGSTD payouts and 0.425 tGSTD expiry refund. Thirteen requests produced 80 account transactions; 17 active code hashes matched compiled code. [Receipts and fee scope](https://github.com/gstdcoin/contracts/blob/master/docs/ESCROW_V2_TESTNET.md). | This was a direct-contract lifecycle, not a v2 platform/node paid job, independent-custodian audit or mainnet cycle. Four one-nanoton wallet notifications skipped compute; token balances and acknowledgements were checked separately. |
| Contract regression | [Contracts CI](https://github.com/gstdcoin/contracts/actions/runs/44252837614): 75 tests without skips, including real-snapshot DEX and signed Wallet V5 tests; five matcher groups. | Source publication and tests do not deploy contracts or establish legacy deployed/source equivalence. |
| Node release channel | The public endpoint served signed manifest 3.7.2 for approved commit ccf459c; its signature matched the pinned public root on this date. | Newer main source is not automatically an approved release. Installer hardening PR 8 remains a candidate; an installed daemon and signed binary require their own operator-controlled promotion/update. |
| Actual inference | Historical node-backed Testnet work returned 391 for 17 × 23. An earlier production qwen2.5:0.5b request returned 331 and failed its answer check; it is not counted as success. | Current semantic acceptance rate, sustained throughput, larger models and independent executors require measured tasks. |
| Mainnet payments | The current owner-supplied Toncenter key passed a read-only global-ID -239 check and reached the production Worker. Canonical-token read-only verification exists. | A full funded deposit/job/acceptance/payout or owner-signed withdrawal with independent recipients and consumed-fee reconciliation remains unverified. |
| Telegram and recovery | Webhook/localization tests and offline identity/configuration restore checks exist. | Ordinary-question and Mini App delivery on the owner's device, encrypted off-machine backup and restoration on another machine remain acceptance work. |
| Free infrastructure and assurance | Cached reads, bounded polling/RPC, isolated preview and dependency/parser tests are in place. | Cloudflare account usage/headroom needs authenticated metrics. Prior 1102 observations remain historical evidence; no exhaustive security or multi-host guarantee is claimed. |

<a id="release-changes-and-verification"></a>

## Published changes and current proposals

The platform's [PR 18](https://github.com/gstdcoin/ai/pull/18), [PR 19](https://github.com/gstdcoin/ai/pull/19) and [PR 20](https://github.com/gstdcoin/ai/pull/20), [node PR 11](https://github.com/gstdcoin/gstdbot/pull/11), [contracts PR 7](https://github.com/gstdcoin/contracts/pull/7) and [website PR 11](https://github.com/gstdcoin/web/pull/11) are merged. Their CI/deployment evidence is linked above. Node-local benchmark tooling from PR 9 is separate from a matched-provider billing/performance comparison.

The verified-host-offers and mainnet-remediation topic branches, signed installer, host self-test/history/maintenance and website review proposals are tracked in [REPOSITORY_MAINTENANCE.md](REPOSITORY_MAINTENANCE.md). They must not be described as deployed merely because the main application is healthy. Source merges do not authorize key rotation, installed-daemon updates or contract activation.

## Repository roles

The [canonical repository table and review queue](REPOSITORY_MAINTENANCE.md#canonical-repositories) records each component's scope and default branch.

Further guides: [platform operations](PLATFORM_OPERATIONS.md), [preview/RPC setup](PREVIEW_REDIS.md), [local verification](LOCAL_VERIFICATION.md), [signed releases](SIGNED_NODE_RELEASES.md), [mainnet beta](MAINNET_ESCROW.md), [finance](FINANCE_V2.md), and [contract verification](CONTRACTS_VERIFICATION.md). Retired embedded deployment/MCP copies stay historical; use the dedicated contracts and A2A repositories. Bridge and distributed-training research are outside the current production compute profile.
