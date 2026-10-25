/**
 * Telegram webhook authentication.
 * Telegram echoes the `secret_token` given to setWebhook in the
 * X-Telegram-Bot-Api-Secret-Token header. The secret is derived from the bot token,
 * so no extra configuration is needed and it rotates together with the token.
 */
import { createHash, timingSafeEqual } from 'crypto';
import type { NextApiRequest } from 'next';

export function webhookSecret(botToken: string): string {
    return createHash('sha256').update(`gstd-tg-webhook:${botToken}`).digest('hex');
}

export function isValidWebhookRequest(req: Pick<NextApiRequest, 'headers'>, botToken: string): boolean {
    if (!botToken) return false;
    const provided = String(req.headers['x-telegram-bot-api-secret-token'] || '');
    const expected = webhookSecret(botToken);
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
