/**
 * Registers the Telegram webhook for the platform with the derived secret token.
 * Usage (token is read from the environment, never from a file):
 *   $env:TELEGRAM_BOT_TOKEN='<new token>'; node scripts/set-telegram-webhook.mjs
 */
import { createHash } from 'node:crypto';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) { console.error('Set TELEGRAM_BOT_TOKEN in the environment'); process.exit(1); }
const url = process.env.WEBHOOK_URL || 'https://app.gstdtoken.com/api/v1/telegram/webhook';
const secret = createHash('sha256').update(`gstd-tg-webhook:${token}`).digest('hex');

const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true }),
});
console.log(await r.json());
