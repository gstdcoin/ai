import type { NextApiRequest, NextApiResponse } from 'next';
import { describe, expect, it, vi } from 'vitest';
import confirmSettlement from '../pages/api/v1/nodes/rewards/confirm-settlement';
import clearSettlement from '../pages/api/v1/settlement/clear';

function call(handler: (req: NextApiRequest, res: NextApiResponse) => unknown, method: string) {
    const req = { method, body: { epoch: '2026-W01', wallets: ['wallet'] } } as NextApiRequest;
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    const res = { status, json } as unknown as NextApiResponse;

    handler(req, res);

    return { status, json };
}

describe('settlement confirmation routes', () => {
    it.each([
        ['confirm-settlement', confirmSettlement],
        ['legacy settlement clear', clearSettlement],
    ])('%s cannot clear pending balances', (_name, handler) => {
        const { status, json } = call(handler, 'POST');

        expect(status).toHaveBeenCalledWith(410);
        expect(json).toHaveBeenCalledWith({
            error: 'settlement_confirmation_disabled',
            message: 'Balances cannot be cleared until payout reservations and on-chain receipt verification are implemented.',
        });
    });

    it.each([
        ['confirm-settlement', confirmSettlement],
        ['legacy settlement clear', clearSettlement],
    ])('%s rejects unsupported methods', (_name, handler) => {
        const { status, json } = call(handler, 'GET');

        expect(status).toHaveBeenCalledWith(405);
        expect(json).toHaveBeenCalledWith({ error: 'Method not allowed' });
    });
});
