# Canonical domain migration: gstdtoken.xyz

The owner selected `gstdtoken.xyz` on 2026-11-23. The public website belongs at `https://gstdtoken.xyz`, with `www.gstdtoken.xyz` as a website alias. The platform, API, Telegram Mini App and wallet manifests belong at `https://app.gstdtoken.xyz`. Do not create a replacement `platform` hostname for the retired test-data Worker.

## Cutover status

The domain is registered in the .xyz registry. During preparation, public resolvers returned NXDOMAIN and registry nameservers were still `ns1.dyna-ns.net` and `ns2.dyna-ns.net`. The existing GitHub Cloudflare credential returned HTTP 403 when inspecting the new zone; no zone or nameservers were changed by that attempt. Repository changes alone do not establish DNS or HTTPS availability.

Add this domain to the existing Cloudflare account on the Free plan, then set exactly the two nameservers assigned to this zone at Dynadot. Keep registrar DNSSEC settings consistent with the new authoritative provider; an obsolete DS record must not be left behind. The configured Worker custom domains then bind `gstdtoken.xyz` and `www.gstdtoken.xyz` to `gstd-web`, and `app.gstdtoken.xyz` to `gstd-ai-platform`. Do not substitute an IP address or a workers.dev CNAME for the required Cloudflare zone activation.

## Application changes

- Current site links, canonical metadata, CSP, discovery manifests, examples and API defaults use the new domain across the seven gstdcoin repositories. Archived designs and dated audit evidence are preserved rather than represented as new-domain test results.
- The website uses a read-only `GSTD_PLATFORM` Worker service binding for health, statistics and trusted-node discovery. Those public data calls no longer depend on external DNS. Calls reject redirects and malformed counters; a deployment smoke check exercises the actual website statistics route.
- TonConnect manifests refer to the new app. The default proof-domain allowlist contains only `app.gstdtoken.xyz`; no arbitrary hostname or wildcard is added. Existing wallet sessions are not transferred to another browser origin. New login requires a fresh challenge and wallet proof. Contracts, wallet keys, ledger balances and escrow commitments are unchanged.
- Updated node source maps only the exact former official default API endpoints to the new API. Explicit custom operator endpoints remain unchanged. Publishing this source does not promote a signed node release or restart an installed daemon. An existing node must be reconfigured/restarted by its operator to reach the new control plane. Preserve its identity and signing key.
- The bounded local A2A connector pins the new origin. Restart/reinstall that connector through its normal workflow after cutover; do not rewrite or expose stored bearer credentials. Grant budgets, expiry, request IDs and unknown-outcome receipt rules remain enforced.
- Public statistics/model discovery supports cross-origin GET/OPTIONS without cookies or credentials. This is public data only; private finance APIs are not opened.

## Verification before announcing completion

Run each repository's normal CI, including unit tests, type checks and builds. Wait for authoritative DNS delegation and valid HTTPS on the three custom hostnames. Verify platform `/api/v1/health` reports Redis, website `/api/health` reports ready, and website `/api/network/stats` returns validated live counters. Test the visible homepage in a browser. The platform's three public TonConnect manifests must use the new app origin and valid icon/legal URLs.

The Telegram webhook and Mini App/menu URLs must be changed to the new app after HTTPS works. Token rotation, Worker-secret provisioning, `scripts/set-telegram-webhook.mjs` and BotFather operations remain owner actions under AGENTS.md. Do not rotate a working token for a domain change. The setup script's default now targets the new app; review its behavior before use because it also updates menus and drops pending updates. Read-only `/api/v1/telegram/health` must then report the canonical new webhook and healthy identity/delivery metadata. A successful metadata check does not prove a newly delivered user reply.

Do not claim email delivery for a new-domain contact alias until its mailbox/routing has been configured and tested. Mainnet payment, GPU performance, release signing and research-bridge limitations remain independent of this domain migration.
