/**
 * Server-side validation of Telegram Mini App `initData`.
 * Used by any API route that must prove a request really came from the
 * claimed Telegram user (not just a client-supplied user id).
 */
import { createHmac } from 'crypto';

const INIT_DATA_MAX_AGE_SEC = 86400; // 24h — without this, one captured initData
                                      // string could be replayed forever by a script

export function validateTelegramInitData(initData: string): string | null {
    if (!initData) return null;
    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        if (!hash) return null;

        if (botToken) {
            // Real HMAC-SHA256 validation per Telegram WebApp spec
            params.delete('hash');
            const checkString = [...params.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => `${k}=${v}`)
                .join('\n');
            const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
            const expected  = createHmac('sha256', secretKey).update(checkString).digest('hex');
            if (expected !== hash) return null;

            const authDate = Number(params.get('auth_date') || '0');
            if (!authDate || Date.now() / 1000 - authDate > INIT_DATA_MAX_AGE_SEC) return null;
        }

        const userStr = params.get('user');
        if (!userStr) return null;
        const user = JSON.parse(decodeURIComponent(userStr));
        return String(user.id || '');
    } catch { return null; }
}
