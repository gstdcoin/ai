/**
 * Server-side Telegram Mini App initData verification.
 * Missing configuration never authenticates a caller.
 */
import { createHmac, timingSafeEqual } from 'crypto';
const INIT_DATA_MAX_AGE_SEC = 86400;
export function validateTelegramInitData(initData: string): string | null {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken || typeof initData !== 'string' || !initData || initData.length > 16384) return null;
    try {
        const params = new URLSearchParams(initData);
        const keys = [...params.keys()];
        if (new Set(keys).size !== keys.length) return null;
        const hash = params.get('hash');
        if (!hash || !/^[a-fA-F0-9]{64}$/.test(hash)) return null;
        params.delete('hash');
        const checkString = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
            .map(([k,v]) => `${k}=${v}`).join('\n');
        const secret = createHmac('sha256','WebAppData').update(botToken).digest();
        const expected = createHmac('sha256',secret).update(checkString).digest();
        if (!timingSafeEqual(expected,Buffer.from(hash,'hex'))) return null;
        const authDate = Number(params.get('auth_date'));
        const now = Math.floor(Date.now()/1000);
        if (!Number.isSafeInteger(authDate) || authDate <= 0 || authDate > now + 60 || now-authDate > INIT_DATA_MAX_AGE_SEC) return null;
        // URLSearchParams has already decoded the JSON; a second decode corrupts literal percent signs.
        const user = JSON.parse(params.get('user') || 'null');
        if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return null;
        return String(user.id);
    } catch { return null; }
}
