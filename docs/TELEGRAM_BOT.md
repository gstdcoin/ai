# GSTD Telegram bot

The bot is @gstdaibot: https://t.me/gstdaibot. It is a Cloudflare platform webhook at https://app.gstdtoken.com/api/v1/telegram/webhook. TELEGRAM_BOT_TOKEN is a Worker secret; nodes never run a second polling bot or hold that token.

## First use

Open the bot, send /start, then type a question. A wallet is optional for the AI chat. /wallet links a TON address for node/accounting features. /earn provides the canonical computer-node installer; a phone opening the mini-app is not proof that it executes AI tasks.

The interface supports English, Russian, Ukrainian, Spanish, Turkish and Chinese. Text comes from frontend/src/lib/tgbot/i18n.ts; the locale tests enforce matching keys and placeholders.

| Command | Action |
|---|---|
| /start, /menu | Welcome and main menu |
| /new | Clear AI conversation history |
| /earn | Computer node setup |
| /node, /nodes | Your registered nodes |
| /wallet | Link a TON address |
| /balance, /claim | Accounting and accepted-work claim |
| /network | Canonical network statistics |
| /invite | Referral link |
| /lang | Choose language |
| /help | Help |
| Other private text | AI chat, subject to a bounded daily quota |

The AI route uses a live node through the shared platform node helpers and has a Cloudflare fallback. Source code and a configured secret do not prove Telegram is delivering updates: acceptance requires an actual private /start and question from a human account.

## Security and setup

The webhook verifies X-Telegram-Bot-Api-Secret-Token derived from the bot token and deduplicates update_id. A POST with no secret must return HTTP 401; it must not send a message. Do not use fabricated Telegram chat/user IDs as a production test.

Per AGENTS.md, token rotation, setting the Worker token and running frontend/scripts/set-telegram-webhook.mjs are owner-only. The script configures the webhook and localized menus. Never print the token, commit an env file, or duplicate this bot on a node.

See [ECOSYSTEM.md](ECOSYSTEM.md) for website, node and developer entry points. Paid settlement, reward amounts and independent multi-host operation require their own acceptance evidence.

The node call has a 45-second total timeout and a concise 192-token response budget. A failed node call can use the explicitly labeled Cloudflare fallback within its daily cap. A quota-storage failure stops compute rather than allowing unbounded fallback usage.
