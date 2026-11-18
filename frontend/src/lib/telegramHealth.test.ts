import { describe, expect, it, vi } from 'vitest';
import { createTelegramHealthProbe } from '../../worker-telegram-health';

const webhook = { url: 'https://app.gstdtoken.com/api/v1/telegram/webhook', pending_update_count: 0,
    allowed_updates: ['message', 'callback_query', 'inline_query'] };
const transport = (details: any = webhook, bot: any = { is_bot: true, username: 'gstdaibot' }) =>
    vi.fn(async (url: any, options: any) => {
        expect(options.method).toBe('GET'); expect(options.redirect).toBe('error');
        expect(options.signal).toBeInstanceOf(AbortSignal);
        return Response.json({ ok: true, result: String(url).endsWith('/getMe') ? bot : details });
    });

describe('read-only Telegram diagnostics', () => {
    it('checks identity and webhook, shares concurrent requests and caches for one minute', async () => {
        let now = 1800000000000;
        const request = transport(); const probe = createTelegramHealthProbe(request, () => now);
        const results = await Promise.all(Array.from({ length: 8 }, () => probe('test-token')));
        expect(results.every(report => report.status === 'ok')).toBe(true);
        expect(request).toHaveBeenCalledTimes(2);
        await probe('test-token'); expect(request).toHaveBeenCalledTimes(2);
        now += 60_001; await probe('test-token'); expect(request).toHaveBeenCalledTimes(4);
        await probe('changed-token'); expect(request).toHaveBeenCalledTimes(6);
    });
    it('fails closed without a token and performs no external request', async () => {
        const request = transport(); const report = await createTelegramHealthProbe(request)('');
        expect(report.status).toBe('degraded'); expect(report.checks.configured).toBe(false);
        expect(request).not.toHaveBeenCalled();
    });
    it('rejects wrong bot identities, disabled webhooks and incomplete subscriptions', async () => {
        expect((await createTelegramHealthProbe(transport(webhook, { is_bot: true, username: 'another_bot' }))('test')).status).toBe('degraded');
        for (const details of [{ ...webhook, url: '' }, { ...webhook, url: 'https://unrelated.example/webhook' },
            { ...webhook, pending_update_count: -1 }, { ...webhook, pending_update_count: '0' },
            { ...webhook, allowed_updates: ['inline_query'] }]) {
            expect((await createTelegramHealthProbe(transport(details))('test')).status).toBe('degraded');
        }
    });
    it('flags pending delivery errors but does not treat a historical error as a current outage', async () => {
        const now = 1800000000000;
        const recent = { ...webhook, last_error_date: now / 1000 - 30 };
        expect((await createTelegramHealthProbe(transport({ ...recent, pending_update_count: 2 }), () => now)('test')).checks.delivery_backlog).toBe('error');
        expect((await createTelegramHealthProbe(transport(recent), () => now)('test')).status).toBe('ok');
        expect((await createTelegramHealthProbe(transport({ ...webhook, pending_update_count: 2 }), () => now)('test')).checks.delivery_backlog).toBe('pending');
        expect((await createTelegramHealthProbe(transport({ ...webhook, pending_update_count: 2, last_error_date: now / 1000 - 3600 }), () => now)('test')).status).toBe('ok');
    });
    it('sanitizes HTTP, API, timeout and malformed JSON failures without exposing credentials', async () => {
        for (const request of [async () => new Response(null, { status: 401 }),
            async () => Response.json({ ok: false, description: 'sensitive webhook metadata' }),
            async () => new Response('broken JSON'), async () => { throw new Error('https://api.telegram.org/botprivate-token/getMe'); }]) {
            const report = await createTelegramHealthProbe(request as any)('private-token');
            expect(report.status).toBe('degraded');
            expect(JSON.stringify(report)).not.toMatch(/private-token|sensitive|api\.telegram/);
        }
    });
});
