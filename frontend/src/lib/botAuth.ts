/**
 * Shared-secret check for /api/v1/telegram/bot/* routes.
 * gstdbot's CommunityGuardian/TelegramChannel already send this header
 * (X-Bot-Token: process.env.TELEGRAM_BOT_TOKEN) on every call -- these
 * routes just never checked it, so anyone could call them directly
 * (link wallets, claim rewards, "top up" balance) without going through
 * a real Telegram interaction at all.
 */
import type { NextApiRequest } from 'next';

export function isValidBotToken(req: NextApiRequest): boolean {
    const expected = process.env.TELEGRAM_BOT_TOKEN;
    if (!expected) return false; // fail closed if unconfigured, not open
    const provided = (req.headers['x-bot-token'] as string) || '';
    return provided === expected;
}
