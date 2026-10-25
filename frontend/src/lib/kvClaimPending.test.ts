import { beforeEach, describe, expect, it } from 'vitest';
import { kvClaimPending, kvGet, kvSet } from './kv';

const walletPrefix = 'kv-claim-pending-test';

beforeEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe('kvClaimPending', () => {
    it('does not clear pending rewards when the destination balance is invalid', async () => {
        const wallet = `${walletPrefix}-invalid-balance`;
        await kvSet(`rewards:pending:${wallet}`, '2');
        await kvSet(`balance:${wallet}`, 'not-a-number');

        const result = await kvClaimPending(wallet, 0.001);

        expect(result).toEqual({ status: 'invalid' });
        expect(await kvGet(`rewards:pending:${wallet}`)).toBe('2');
        expect(await kvGet(`balance:${wallet}`)).toBe('not-a-number');
    });

    it('validates every fee destination before changing any reward state', async () => {
        const wallet = `${walletPrefix}-invalid-fee`;
        const treasury = `${walletPrefix}:treasury`;
        const pool = `${walletPrefix}:pool`;
        await kvSet(`rewards:pending:${wallet}`, '2');
        await kvSet(treasury, '1');
        await kvSet(pool, 'NaN');

        const result = await kvClaimPending(wallet, 0.001, [
            { key: treasury, pct: 0.1 },
            { key: pool, pct: 0.05 },
        ]);

        expect(result).toEqual({ status: 'invalid' });
        expect(await kvGet(`rewards:pending:${wallet}`)).toBe('2');
        expect(await kvGet(treasury)).toBe('1');
        expect(await kvGet(pool)).toBe('NaN');
    });

    it('atomically moves valid pending rewards and fee shares', async () => {
        const wallet = `${walletPrefix}-valid`;
        const treasury = `${walletPrefix}:valid-treasury`;
        const pool = `${walletPrefix}:valid-pool`;
        await kvSet(`rewards:pending:${wallet}`, '1');
        await kvSet(`balance:${wallet}`, '0.5');
        await kvSet(treasury, '2');
        await kvSet(pool, '1');

        const result = await kvClaimPending(wallet, 0.001, [
            { key: treasury, pct: 0.1 },
            { key: pool, pct: 0.05 },
        ]);

        expect(result).toEqual({ status: 'claimed', gross: 1, net: 0.85, balance: 1.35 });
        expect(await kvGet(`rewards:pending:${wallet}`)).toBe('0');
        expect(await kvGet(treasury)).toBe('2.1');
        expect(await kvGet(pool)).toBe('1.05');
        expect(await kvGet(`balance:${wallet}`)).toBe('1.35');
    });

    it('rejects duplicate destination keys before claiming', async () => {
        const wallet = `${walletPrefix}-duplicate`;
        const balanceKey = `balance:${wallet}`;
        await kvSet(`rewards:pending:${wallet}`, '1');
        await kvSet(balanceKey, '0');

        const result = await kvClaimPending(wallet, 0.001, [{ key: balanceKey, pct: 0.1 }]);

        expect(result).toEqual({ status: 'invalid' });
        expect(await kvGet(`rewards:pending:${wallet}`)).toBe('1');
        expect(await kvGet(balanceKey)).toBe('0');
    });
});
