import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, string>();
const quotas = new Map<string, number>();
const balances = new Map<string, number>();

vi.mock('./kv', () => ({
    kvGet: vi.fn(async (k: string) => store.get(k) ?? null),
    kvSet: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
    kvSetNX: vi.fn(async (k: string, v: string) => {
        if (store.has(k)) return false;
        store.set(k, v);
        return true;
    }),
    kvConsumeQuota: vi.fn(async (k: string, limit: number) => {
        const used = quotas.get(k) ?? 0;
        if (used >= limit) return { allowed: false, remaining: 0 };
        quotas.set(k, used + 1);
        return { allowed: true, remaining: limit - used - 1 };
    }),
    kvIncr: vi.fn(async () => 1),
    kvIncrByFloat: vi.fn(async (k: string, d: number) => {
        balances.set(k, (balances.get(k) ?? 0) + d);
        return balances.get(k)!;
    }),
}));
vi.mock('./money', () => ({
    walletId: (wallet: string) => wallet,
    nano: (value: number) => BigInt(Math.round(value*1e9)),
    grantPromo: async (wallet: string, value: bigint, reference: string) => {
        const key = 'promo:' + reference;
        if (store.has(key)) return false;
        store.set(key,'1'); balances.set('promo:' + wallet,(balances.get('promo:' + wallet)||0)+Number(value)/1e9); return true;
    },
}));
vi.mock('./botAuth', () => ({ isValidBotToken: () => true }));

import link from '../pages/api/v1/telegram/bot/link';
import claim from '../pages/api/v1/mobile/node/claim';

const W = (n: number) => 'EQ' + String(n).padStart(46, 'a');

function call(handler: any, body: any) {
    const res: any = { statusCode: 0, body: null };
    res.status = (c: number) => { res.statusCode = c; return res; };
    res.json = (b: any) => { res.body = b; return res; };
    return handler({ method: 'POST', body, headers: {} } as any, res).then(() => res);
}

beforeEach(() => { store.clear(); quotas.clear(); balances.clear(); });

describe('telegram wallet-link bonuses', () => {
    it('grants service-only promo once as the welcome bonus once per wallet, even from many Telegram accounts', async () => {
        await call(link, { telegram_id: 1, wallet_address: W(1) });
        await call(link, { telegram_id: 2, wallet_address: W(1) });
        expect(balances.get(`promo:${W(1)}`)).toBe(5);
    });

    it('ignores self-referral through the same wallet', async () => {
        await call(link, { telegram_id: 1, wallet_address: W(1) });
        await call(link, { telegram_id: 2, wallet_address: W(1), referrer_id: 1 });
        expect(balances.get(`promo:${W(1)}`)).toBe(5);
    });

    it('credits a legitimate referral and caps referrals per inviter', async () => {
        await call(link, { telegram_id: 1, wallet_address: W(1) });
        await call(link, { telegram_id: 2, wallet_address: W(2), referrer_id: 1 });
        expect(balances.get(`promo:${W(1)}`)).toBe(15);
        for (let i = 3; i < 40; i++) await call(link, { telegram_id: i, wallet_address: W(i), referrer_id: 1 });
        expect(balances.get(`promo:${W(1)}`)).toBe(5 + 20*10);
    });

    it('stops subsidising sign-ups after the daily budget', async () => {
        for (let i = 100; i < 230; i++) await call(link, { telegram_id: i, wallet_address: W(i) });
        const paid = [...balances.values()].filter(v => v > 0).length;
        expect(paid).toBe(100);
    });
});

describe('mobile presence rewards', () => {
    it('are disabled by default', async () => {
        delete process.env.MOBILE_PRESENCE_REWARDS;
        const res = await call(claim, { telegram_init_data: 'x', device_id: 'd', wallet_address: W(1) });
        expect(res.statusCode).toBe(403);
        expect(res.body.error).toBe('presence_rewards_disabled');
    });
});
