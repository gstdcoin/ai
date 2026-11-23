# Telegram service diagnostics

`GET https://app.gstdtoken.xyz/api/v1/telegram/health` performs read-only Telegram Bot API calls using the existing Worker secret. It checks `getMe` against `@gstdaibot`, checks the canonical webhook URL and message/callback subscriptions with `getWebhookInfo`, and reports whether delivery has pending updates and recent errors.

HTTP 200 and `status: ok` mean those checks passed. HTTP 503 and `status: degraded` identify a missing credential, unreachable/rejected Bot API, unexpected identity/webhook/subscription, malformed metadata or a pending queue with a recent delivery error. A historical Telegram delivery error with an empty queue does not make a recovered service unhealthy. `delivery_backlog: pending` is distinct from both a clear queue and a known error.

Results are cached for one minute per Worker isolate, concurrent checks share the same read, and HTTP responses carry a one-minute public cache policy. The endpoint returns fixed status fields only. It does not expose the bot token, Telegram's raw error descriptions, webhook/IP metadata, chat IDs or message contents. It does not send messages, consume updates, register/delete a webhook, change bot settings or spend GSTD. The private-preview access boundary still runs first.

This endpoint checks configuration and Telegram's delivery metadata. It does not prove delivery of a new message to a user or a successful new wallet/payment flow. The public webhook must continue to reject requests without the derived Telegram secret. Keep the secret in Cloudflare; do not copy it into diagnostics logs or worker nodes.

Relevant local checks: `npx vitest run src/lib/telegramHealth.test.ts src/lib/telegramAiFlow.test.ts src/lib/telegramWebhookAuth.test.ts src/lib/telegramAuth.test.ts src/lib/telegramWalletProof.test.ts src/lib/tgbot/i18n.test.ts` and `npx tsc --noEmit` from `frontend`. Full platform CI remains required before deployment.

Telegram method semantics: [getMe](https://core.telegram.org/bots/api#getme), [getWebhookInfo and WebhookInfo](https://core.telegram.org/bots/api#getwebhookinfo).
