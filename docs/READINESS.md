# GSTD release readiness — 2026-10-28

Production entry points: [website](https://gstdtoken.com), [platform](https://app.gstdtoken.com), [payments](https://app.gstdtoken.com/payments), [Telegram](https://t.me/gstdaibot).

## Scope of the usable core

Local Ollama inference; opt-in requests to other nodes; signed node identities; funded-work reservation/capture/refund; 85% executor / 10% protocol / 5% reserve; owner-signed GSTD withdrawal requests. Free/promo requests create no withdrawable reward.

The system is an early single-node deployment. Green CI is necessary, but does not certify the entire ecosystem ready.

## Release gates

| Scenario | Evidence / remaining gate |
| --- | --- |
| Local inference | Physical node 3.7.0 and the public platform returned a basic arithmetic response using llama3.2:3b. This demonstrates routing, not general answer quality; a smaller model previously produced a wrong answer. |
| Node identity and registry | Ed25519 regression tests; one real node reported online. |
| Browser and Telegram delivery | Website/API are reachable. Actual end-user Telegram delivery must be rechecked after changes; HTTP health is not sufficient. |
| Paid accounting | Unit tests and real disposable Redis CAS tests cover reservation, split, replay, refund and withdrawal state transitions. |
| Positive on-chain withdrawal | NOT VERIFIED end to end: needs actual backed customer credit and custody-owner signature. No fabricated balances or self-awarded test rewards. |
| Fresh install | Fresh-source installer CI passed on Linux amd64 Node 22 and a Debian container without a preinstalled Node runtime, using a fixture inference service. Offline non-root startup, authentication and retired routes passed. Real clean ARM64/GPU/WSL installations remain unverified; native macOS installation is not claimed. |
| Multi-node routing and failure | Needs a second independently operated physical node. One process or one host cannot demonstrate decentralization. |
| Backups and disaster recovery | Isolated tests restore node identities and reject replacement of corrupt keys, saved wallets and saved configuration. A complete user backup workflow and a restore drill on another machine for balances, queue and configuration are still required. |
| Security | Runtime dependency checks and focused authorization regressions pass. A low-severity deepmerge advisory remains in the TON Connect dependency chain with no npm-provided fix at this check. A full independent security/contract audit remains outstanding. |
| Free infrastructure | Hidden-tab-aware polling and bounded finance cron are implemented. Validate actual Cloudflare/Redis daily usage under representative load before a public traffic campaign. |
| Token/contracts | Existing GSTD Jetton is used. Legacy Settlement contracts are not the new payment engine; source/bytecode verification and a separate deployment/audit are required before changing that. |

## Repositories

- `ai`: platform, billing, node registry and Telegram webhook. Source of truth for balances and paid work.
- `gstdbot`: compute node and canonical installer. Node processes must not hold a Telegram bot token or custody signing key. The current compute release line is 3.7; the minimal CLI and shared compute limiter are enabled.
- `web`: public website and separate free demo; does not maintain another billing ledger.
- `A2A`: experimental signed Python/JavaScript clients. Standalone monitors do not claim tasks without an executor.
- `contracts`: token and legacy/research contracts, with explicit deployment/audit status.
- `gstd-bridge`: deferred research, no production bridge or user deposits.
- `gstdcoin`: public profile and navigation.

The obsolete domain gstdcoin.com did not resolve during this audit. gstdtoken.com is the canonical domain. Temporary trycloudflare.com node URLs are discoverable, not permanent deployment addresses.

## What is deliberately excluded

Presence rewards, automatic buybacks, speculative bridges/DeFi, unrestricted host/SSH management, automatic publication of user prompts, and fabricated multiple validators. The full ecosystem must not be called unstoppably decentralized or unhackable.

## Registry recovery found during acceptance

The legacy per-wallet registration counter counted repeated registrations after node TTL expiry, eventually refusing the same real node with `too_many_nodes`. This was reproduced during the 3.6.1 restart. A signed heartbeat of the existing identity restored its record; no token balances or keys were changed.

The replacement is an atomic Redis lease set with at most ten live distinct identities per wallet. Existing identities renew without consuming another slot; expired leases free capacity. Heartbeats refresh leases. A disposable real-Redis test covers concurrent registrations, same-identity renewal and expiry. Both registration and heartbeat now require proof of a bound Ed25519 identity; anonymous heartbeat callers cannot manufacture online records. Use current signed node/SDK clients.

## Duplicate packages

Embedded `contracts/` deployment commands and `gstd-mcp-server/` launch commands are retired, with dependencies removed and fail-closed entry points. Use the dedicated `gstdcoin/contracts` and experimental signed `gstdcoin/A2A` repositories. This removes divergent launch/deployment paths; it does not assert that the canonical contracts are audited or their deployed bytecode matches all current sources.
