import type { NextApiRequest, NextApiResponse } from 'next';
import { describe, expect, it, vi } from 'vitest';
import handler from '../pages/api/v1/settlement/batch';

function call(method: string) {
    const req = { method } as NextApiRequest;
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    const res = { status, json } as unknown as NextApiResponse;

    handler(req, res);

    return { status, json };
}

describe('legacy settlement batch endpoint', () => {
    it('rejects caller-submitted reward events without processing them', () => {
        const { status, json } = call('POST');

        expect(status).toHaveBeenCalledWith(410);
        expect(json).toHaveBeenCalledWith({
            error: 'legacy_settlement_disabled',
            message: 'Caller-submitted reward events are not accepted. Rewards are accrued only from server-issued task assignments.',
        });
    });

    it('rejects unsupported methods', () => {
        const { status, json } = call('GET');

        expect(status).toHaveBeenCalledWith(405);
        expect(json).toHaveBeenCalledWith({ error: 'Method not allowed' });
    });
});
