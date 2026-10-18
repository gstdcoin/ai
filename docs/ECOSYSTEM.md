# GSTD Ecosystem Map

One page to understand how the pieces fit and where to start contributing.

> **Honest status:** the platform API is live, but the network is early. Check
> [live stats](https://app.gstdtoken.com/api/v1/stats/public) before relying on workers, tasks or payouts.
> Contracts are not externally audited. Nothing here is financial advice.

## How the pieces fit

```
 Node OS (gstdbot)  ──heartbeat / tasks / results──▶  Platform API (this repo, Cloudflare Workers + Upstash Redis)
        │                                                   │
        └──── wallet identity (TON) ◀── TonConnect proof ───┤
                                                            ▼
                                   Contracts (TON): GSTD Jetton, SettlementMaster, AgentRegistry
 Clients / agents (A2A SDKs) ──submit tasks──▶ Platform API        Lending platform ──uses GSTD as collateral
```

| Repository | Role | Start here |
|---|---|---|
| [ai](https://github.com/gstdcoin/ai) | Platform API + web app on Cloudflare (single source of truth for nodes, tasks, stats) | `docs/ARCHITECTURE.md` |
| [gstdbot](https://github.com/gstdcoin/gstdbot) | Node OS: turns a computer into a node | its README |
| [contracts](https://github.com/gstdcoin/contracts) | TON smart contracts (Tact) | `deployment-mainnet.json` |
| [A2A](https://github.com/gstdcoin/A2A) | Client libraries and examples for agents | its README |
| [web](https://github.com/gstdcoin/web) | Public website | its README |
| [gstd-lending-platform](https://github.com/gstdcoin/gstd-lending-platform) | Lending against GSTD (FastAPI + Next.js) | `backend/tests/README.md` |
| [gstd-bridge](https://github.com/gstdcoin/gstd-bridge) | Cross-chain bridge (deferred, not deployed) | its README |

Design rule: **one owner per concern.** Node and task state live only in the platform API; value movement only in
contracts; other repos call these, they do not re-implement them.

## Choose your path

1. **Run a node** — follow the gstdbot README, then confirm your node appears in
   `GET https://app.gstdtoken.com/api/v1/nodes/list`.
2. **Build an agent / client** — use the A2A libraries and `docs/A2A_CONNECTION.md`.
3. **Contribute code** — pick an issue, or a good first task below. Every repo has CI; keep it green.
4. **Review security** — read `docs/CONTRACTS_VERIFICATION.md`; report vulnerabilities privately via each repo's security policy.

## Good first contributions

- Restore a legacy backend test suite in the lending platform (see `backend/tests/README.md`).
- Replace remaining high-severity npm advisories that need major upgrades (Jest, Tailwind) in the lending frontend.
- Add end-to-end documentation for a node's first heartbeat and task result.
- Verify on-chain settlement against the deployed contracts and document the evidence.

## Ground rules

- Cloudflare only for hosting (no Vercel). Free-tier limits are a design constraint; avoid unbounded polling.
- Never commit secrets; use `.env.example` placeholders and GitHub/Cloudflare secrets.
- Do not claim features that are not verified in production.

## Phones and growth (honest status)

- **Today a phone can use the network** (free AI chat in the Telegram bot) and **show up as an online device** in the mini app. It does not earn GSTD for keeping the app open: presence-only payouts were unfunded emission and are disabled (`MOBILE_PRESENCE_REWARDS=enabled` re-enables them for a funded programme).
- **Earning is per completed, funded task.** Full nodes (`gstdbot`) do this today. A phone worker (WebGPU/WASM tiny models, signed with a device key) is the open roadmap item; see [good first contributions](#good-first-contributions).
- **Referrals** pay a one-time bonus per new wallet (inviter capped at 20 paid referrals; one bonus per wallet; 100 subsidised sign-ups per day). Self-referral and re-linking the same wallet pay nothing.
- **@gstdaibot runs as a platform webhook** (`/api/v1/telegram/webhook`, token only in Cloudflare). Six languages (en, ru, uk, es, tr, zh), button menu, wallet linking, `/network` live stats, `/invite`, AI chat with a daily quota (`TG_AI_DAILY_LIMIT`, default 30). Register with `scripts/set-telegram-webhook.mjs`.
- **Bot growth loop:** referral deep links, inline-mode share card (enable inline mode in @BotFather), and a daily post of real network numbers to the configured community chat (`communityChat`) only when the numbers changed.