# Canonical domain migration: gstdtoken.xyz

The owner selected `gstdtoken.xyz` on 2026-11-23. The public website belongs at `https://gstdtoken.xyz`, with `www.gstdtoken.xyz` as a website alias. The platform, API, Telegram Mini App and wallet manifests belong at `https://app.gstdtoken.xyz`. Do not create a replacement `platform` hostname for the retired test-data Worker.

## Cutover status

Cloudflare activated the zone on 2026-11-23 with authoritative nameservers `alaric.ns.cloudflare.com` and `harleigh.ns.cloudflare.com`. The root and `www` are bound to `gstd-web`; `app` is bound to `gstd-ai-platform`, on the existing Free account. HTTPS, website live statistics, platform Redis health and the new TonConnect manifest were verified after deployment. The `www` alias returns 308 to the root, preserving path/query.

Source migration is merged across all seven repositories. The approved 3.7.3 release is installed on the ARM `bot` node; live statistics confirm one online node on the new platform. See [signed release evidence](SIGNED_NODE_RELEASES.md). The former .com hostname can redirect only while its DNS/HTTPS routing is controlled; application redirects cannot repair an unresolved domain. The owner reported updating Telegram settings, but a fresh read-only probe at 2026-11-23 19:25 UTC still returned `webhook:false` and HTTP 503; token/API/identity checks passed and backlog was clear. BotFather changes alone do not update the webhook. Owner script completion and a matching new-domain webhook remain unverified. No Telegram message was sent during validation.

## Application changes

- Current site links, canonical metadata, CSP, discovery manifests, examples and API defaults use the new domain across the seven gstdcoin repositories. Archived designs and dated audit evidence are preserved rather than represented as new-domain test results.
- The website uses a read-only `GSTD_PLATFORM` Worker service binding for health, statistics and trusted-node discovery. Those public data calls no longer depend on external DNS. Calls reject redirects and malformed counters; a deployment smoke check exercises the actual website statistics route.
- TonConnect manifests refer to the new app. The default proof-domain allowlist contains only `app.gstdtoken.xyz`; no arbitrary hostname or wildcard is added. Existing wallet sessions are not transferred to another browser origin. New login requires a fresh challenge and wallet proof. Contracts, wallet keys, ledger balances and escrow commitments are unchanged.
- Updated node source maps only the exact former official default API endpoints to the new API. Explicit custom operator endpoints remain unchanged. Publishing this source does not promote a signed node release or restart an installed daemon. An existing node must be reconfigured/restarted by its operator to reach the new control plane. Preserve its identity and signing key.
- The bounded local A2A connector pins the new origin. Restart/reinstall that connector through its normal workflow after cutover; do not rewrite or expose stored bearer credentials. Grant budgets, expiry, request IDs and unknown-outcome receipt rules remain enforced.
- Public statistics/model discovery supports cross-origin GET/OPTIONS without cookies or credentials. This is public data only; private finance APIs are not opened.

## Remaining external settings

The owner updated the GitHub About Homepage fields, and API reads confirmed all seven repositories on 2026-11-24: `ai` and `A2A` point to `https://app.gstdtoken.xyz`; `web`, `gstdbot`, `contracts`, `gstd-bridge` and `gstdcoin` point to `https://gstdtoken.xyz`. Repository metadata is now consistent with the maintained files.

Public DNS returns NXDOMAIN for the former .com root and app. Code contains fixed canonical redirects, but a request must reach a valid DNS/HTTPS endpoint before an HTTP redirect can execute.

## Verification before announcing completion

Run each repository's normal CI, including unit tests, type checks and builds. Wait for authoritative DNS delegation and valid HTTPS on the three custom hostnames. Verify platform `/api/v1/health` reports Redis, website `/api/health` reports ready, and website `/api/network/stats` returns validated live counters. Test the visible homepage in a browser. The platform's three public TonConnect manifests must use the new app origin and valid icon/legal URLs.

The Telegram webhook and Mini App/menu URLs must be changed to the new app after HTTPS works. Token rotation, Worker-secret provisioning, `scripts/set-telegram-webhook.mjs` and BotFather operations remain owner actions under AGENTS.md. Do not rotate a working token for a domain change. The setup script's default now targets the new app; review its behavior before use because it also updates menus. Pending updates are preserved. Read-only `/api/v1/telegram/health` must then report the canonical new webhook and healthy identity/delivery metadata. A successful metadata check does not prove a newly delivered user reply.

Do not claim email delivery for a new-domain contact alias until its mailbox/routing has been configured and tested. Mainnet payment, GPU performance, release signing and research-bridge limitations remain independent of this domain migration.

## Owner-authorized Telegram repair

On 2026-11-24 the owner explicitly instructed the assistant to perform the cutover itself, overriding the owner-only restriction for this operation. A fixed production-only POST at `/api/v1/telegram/admin/canonical-domain` requires the existing operator cron secret, explicit maintenance intent and an empty non-browser request. It is disabled for previews. The bot token remains inside the Worker and is never exported. The handler verifies @gstdaibot identity, sets only the canonical webhook and global Mini App menu, preserves pending updates, and verifies the resulting settings. It sends no user messages, changes no wallet state and rotates no credential.

## Verified product rollout — 2026-11-24

The live [GSTD Compute Passport](https://gstdtoken.xyz/network) is deployed from website PR 16. Its public snapshot reports one online CPU node, the three advertised models, and cryptographically verified approved software 3.7.3. Hardware is labelled node-reported; per-model cost/TTFT/success-rate measurements remain unpublished. Website and platform production CI passed before the later account restriction.

Owner-authorized cutover run [45328945462](https://github.com/gstdcoin/ai/actions/runs/45328945462) did not start: GitHub reported `The job was not started because your account is locked due to a billing issue.` Runner id was zero and there were no execution steps. It did not call Telegram or mutate the webhook/menu. The deployed maintenance route returns 403 without operator authorization; public Telegram health still reports webhook mismatch, with valid API/identity and clear backlog. Restore the GitHub Actions account, then rerun this prepared job and verify `/api/v1/telegram/health` returns 200 with `webhook:true`. No new token or credential rotation is required. The assistant has no operator secret in its local or server project configurations and has not exported the Worker token.

Cloudflare dashboard inspection confirmed the production Worker ready, approximately 3,000 invocations over 24 hours and zero reported errors. These observations do not diagnose the separate GitHub billing restriction or prove new-message delivery. No payment or subscription action was performed.
