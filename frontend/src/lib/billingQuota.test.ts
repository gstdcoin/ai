import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('./kv', () => ({ kvGet: vi.fn(), kvConsumeQuota: vi.fn() }));
vi.mock('./money', () => ({ consumePromoRequest: vi.fn(async () => false) }));
import { kvConsumeQuota } from './kv';
import { chargeFee } from './billing';
const counts = new Map<string, number>();
beforeEach(() => {
    counts.clear();
    vi.mocked(kvConsumeQuota).mockImplementation(async (key, limit) => {
        const used = counts.get(key) || 0;
        if (used >= limit) return { allowed: false, remaining: 0 };
        counts.set(key, used + 1);
        return { allowed: true, remaining: limit - used - 1 };
    });
});
describe('shared free quota identity', () => {
    it('does not let one anonymous client exhaust another client quota', async () => {
        for (let n = 0; n < 50; n++) expect((await chargeFee(null, 'auto', null, 'ip:192.0.2.1')).ok).toBe(true);
        expect((await chargeFee(null, 'auto', null, 'ip:192.0.2.1')).ok).toBe(false);
        const other = await chargeFee(null, 'auto', null, 'ip:192.0.2.2');
        expect(other).toMatchObject({ ok: true, free: true, remaining: 49 });
    });
    it('uses the same authenticated wallet quota across different IPs', async () => {
        for (let n = 0; n < 50; n++) expect((await chargeFee('wallet-a', 'auto', null, 'ip:192.0.2.1')).ok).toBe(true);
        expect((await chargeFee('wallet-a', 'auto', null, 'ip:192.0.2.2')).ok).toBe(false);
        expect((await chargeFee('wallet-b', 'auto', null, 'ip:192.0.2.1')).ok).toBe(true);
    });
});
