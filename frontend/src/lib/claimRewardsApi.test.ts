import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { kvGet, kvClaimPending, sessionWallet } = vi.hoisted(() => ({
    kvGet: vi.fn(),
    kvClaimPending: vi.fn(),
    sessionWallet: vi.fn(),
}));

vi.mock('./kv', () => ({ kvGet, kvClaimPending }));
vi.mock('./walletSession', () => ({ sessionWallet }));

import claimRewards from '../pages/api/v1/nodes/claim-rewards';
import pendingRewards from '../pages/api/v1/nodes/pending-rewards';

async function call(
    handler: (req: NextApiRequest, res: NextApiResponse) => unknown,
    method: string,
    options: { body?: Record<string, unknown>; session?: string } = {},
): Promise<{ status: number; body: unknown }> {
    let statusCode = 200;
    let responseBody: unknown;
    const req = {
        method,
        query: {},
        body: options.body,
        headers: options.session ? { 'x-session-token': options.session } : {},
    } as NextApiRequest;
    const res = {
        status(code: number) { statusCode = code; return this; },
        json(body: unknown) { responseBody = body; return this; },
    } as unknown as NextApiResponse;

    await handler(req, res);
    return { status: statusCode, body: responseBody };
}

describe('node reward API contract', () => {
    beforeEach(() => {
        kvGet.mockReset();
        kvClaimPending.mockReset();
        sessionWallet.mockReset();
    });

    it('requires an authenticated wallet session to read pending rewards', async () => {
        const response = await call(pendingRewards, 'GET');

        expect(response.status).toBe(401);
        expect(kvGet).not.toHaveBeenCalled();
    });

    it('returns pending_gstd for the wallet in the verified session', async () => {
        sessionWallet.mockResolvedValue('uqwallet');
        kvGet.mockResolvedValue('0.25');

        const response = await call(pendingRewards, 'GET', { session: 'valid-session' });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            wallet: 'uqwallet',
            pending_gstd: 0.25,
            claimable: true,
        });
        expect(kvGet).toHaveBeenCalledWith('rewards:pending:uqwallet');
    });

    it('requires an authenticated wallet session to claim rewards', async () => {
        const response = await call(claimRewards, 'POST');

        expect(response.status).toBe(401);
        expect(kvClaimPending).not.toHaveBeenCalled();
    });

    it('claims rewards for the wallet in the verified session', async () => {
        sessionWallet.mockResolvedValue('uqwallet');
        kvClaimPending.mockResolvedValue({
            status: 'claimed',
            gross: 0.25,
            net: 0.25,
            balance: 1.5,
        });

        const response = await call(claimRewards, 'POST', {
            session: 'valid-session',
            body: { wallet: 'attacker-selected-wallet' },
        });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            ok: true,
            claimed_gstd: 0.25,
            new_balance: 1.5,
        });
        expect(kvClaimPending).toHaveBeenCalledWith('uqwallet', 0.001);
    });
});
