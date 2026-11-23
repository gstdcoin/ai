const EXPECTED_WEBHOOK = 'https://app.gstdtoken.com/api/v1/telegram/webhook';

export interface TelegramHealth {
    status: 'ok' | 'degraded';
    checks: {
        configured: boolean;
        telegram_api: boolean;
        bot_identity: boolean;
        webhook: boolean;
        delivery_backlog: 'clear' | 'pending' | 'error' | 'unknown';
    };
    checked_at: string;
}

/** Read-only Bot API calls. Never returns credentials, URLs, user data or raw errors. */
export function createTelegramHealthProbe(transport: typeof fetch, now = Date.now) {
    let cached: { token: string; expires: number; report: TelegramHealth } | undefined;
    let inFlight: { token: string; promise: Promise<TelegramHealth> } | undefined;

    async function inspect(token: string): Promise<TelegramHealth> {
        const checks: TelegramHealth['checks'] = {
            configured: !!token, telegram_api: false, bot_identity: false,
            webhook: false, delivery_backlog: 'unknown',
        };
        if (token) {
            try {
                const call = async (method: 'getMe' | 'getWebhookInfo') => {
                    const response = await transport(`https://api.telegram.org/bot${token}/${method}`, {
                        method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5000),
                    });
                    if (!response.ok) throw new Error('telegram_unavailable');
                    const data = await response.json() as any;
                    if (data?.ok !== true || !data.result) throw new Error('telegram_unavailable');
                    return data.result;
                };
                const [bot, webhook] = await Promise.all([call('getMe'), call('getWebhookInfo')]);
                checks.telegram_api = true;
                checks.bot_identity = bot.is_bot === true && bot.username === 'gstdaibot';
                const pending = webhook.pending_update_count;
                const validPending = Number.isSafeInteger(pending) && pending >= 0;
                checks.webhook = webhook.url === EXPECTED_WEBHOOK && validPending &&
                    (webhook.allowed_updates === undefined || (Array.isArray(webhook.allowed_updates) &&
                        (!webhook.allowed_updates.length || ['message', 'callback_query'].every(kind => webhook.allowed_updates.includes(kind)))));
                // Historical Telegram errors can persist after successful recovery.
                const recentError = Number.isFinite(webhook.last_error_date) &&
                    webhook.last_error_date * 1000 > now() - 15 * 60_000;
                checks.delivery_backlog = !validPending ? 'unknown' : pending === 0 ? 'clear' : recentError ? 'error' : 'pending';
            } catch { /* No raw Telegram error or token-bearing request URL is logged or returned. */ }
        }
        const ready = checks.telegram_api && checks.bot_identity && checks.webhook &&
            checks.delivery_backlog !== 'error' && checks.delivery_backlog !== 'unknown';
        return { status: ready ? 'ok' : 'degraded', checks, checked_at: new Date(now()).toISOString() };
    }

    return async (token: string): Promise<TelegramHealth> => {
        if (cached?.token === token && cached.expires > now()) return cached.report;
        if (inFlight?.token === token) return inFlight.promise;
        const promise = inspect(token).then(report => {
            cached = { token, expires: now() + 60_000, report };
            return report;
        });
        inFlight = { token, promise };
        try { return await promise; }
        finally { if (inFlight?.promise === promise) inFlight = undefined; }
    };
}
