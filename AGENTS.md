# GSTD engineering rules and decision log

Read this before changing anything. It applies to humans and AI agents. Rules are enforced where possible by `scripts/guard.mjs` (CI workflow `Guard`).

## Standing rules

1. **Cloudflare only, free limits.** No Vercel. Do not break `gstdtoken.com` or `app.gstdtoken.com`.
2. **No secrets in code, logs or git history.** Tokens live only in Cloudflare/GitHub secrets. Never create a committed `.env`.
3. **Honest numbers.** No fake nodes, tasks, stats, promos or guaranteed yields. Public numbers come from the platform registry (`app.gstdtoken.com/api/v1/network/stats`).
4. **Rewards only for completed, accepted tasks.** Presence-only payouts stay disabled.
5. **No automatic GHCR publishing, no SSH deploys.**
6. **Lock files:** never generate `package-lock.json` with `--legacy-peer-deps` where CI uses `npm ci`; verify with `npm ci --dry-run`.
7. **Bot lives on the platform** (webhook). Nodes never hold `TELEGRAM_BOT_TOKEN`.
8. **Every user-facing string in the bot goes through `lib/tgbot/i18n.ts`** and all six locales (a test enforces matching keys).

## Definition of done

`tsc --noEmit`, `npm test`, push to `main`, CI green, then check the live endpoint. `ai` and `web` deploy automatically on push.

## Decision log

| Decision | Reason |
|---|---|
| `app.gstdtoken.com` is the single source of truth for the registry | `platform.gstdtoken.com` is a legacy worker with test data and no sources |
| Node identity is Ed25519, trust on first use | Stops spoofing of node ids and wallets |
| Reward claim is atomic (`kvClaimPending`) | Closed a double-claim race |
| Telegram webhook secret = sha256 of the bot token | Rejects forged updates without extra secrets |
| Referral and welcome bonuses are capped per wallet and per day | Bounded, unfunded emission is not allowed |
| One canonical `install.sh` in `gstdbot` | Three diverging copies caused broken installs |
| Node self-update rolls back on failed build | A bad release must not brick nodes |

## Owner-only actions (agents cannot do these)

Rotate the bot token (`/revoke`), set `TELEGRAM_BOT_TOKEN` as a Worker secret and run `scripts/set-telegram-webhook.mjs`; reset the Upstash password and update GitHub Secrets; update node `gstd-desktop`; enable inline mode in @BotFather.

New accepted paid ledger work credits 10% automatically to MAINNET_ESCROW.protocol, atomically with 85% executor and 5% reserve. Do not double-count cumulative credited income as fund balance. The owner selected the GSTD/XAUt0 pool EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp; observation is read-only and execution is not deployed. Preserve old escrow commitments and never spend customer backing on liquidity. See docs/AUTONOMOUS_ECONOMY.md.

Operator USD offers are opt-in via verified payout ownership. New quoted work must enforce exact request/owner/executor binding, quote TTL, integer amount and buyer/grant caps; consume the quote atomically with reserveMoney. Never silently raise old grant budgets. No fabricated market fallback, no guaranteed profit or stablecoin payout, and no mainnet LP execution is claimed. See docs/MARKET_PRICING.md.

Paid HTTP inference requires a fresh server-verified endpoint attestation for the exact selected URL; no arbitrary legacy identity bypass. Preserve local chat and outbound worker registration. Every enterprise inference route uses atomic capacity admission; node usage is diagnostic, never authority to refund capacity. See docs/NODE_ENDPOINT_IDENTITY.md and docs/ENTERPRISE_CAPACITY.md.
