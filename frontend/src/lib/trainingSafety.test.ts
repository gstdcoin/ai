import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { kvGet, kvSet, kvCreateFundedTrainingJob, sessionWallet } = vi.hoisted(() => ({
    kvGet: vi.fn(),
    kvSet: vi.fn(),
    kvCreateFundedTrainingJob: vi.fn(),
    sessionWallet: vi.fn(),
}));

vi.mock('./kv', () => ({ kvGet, kvSet, kvCreateFundedTrainingJob }));
vi.mock('./walletSession', () => ({ sessionWallet }));

import trainingJobs from '../pages/api/v1/training/jobs';
import trainingJob from '../pages/api/v1/training/jobs/[id]';
import trainingGradient from '../pages/api/v1/training/gradient';

async function call(
    handler: (req: NextApiRequest, res: NextApiResponse) => unknown,
    method: string,
    options: {
        body?: Record<string, unknown>;
        id?: string;
        session?: string;
    } = {},
): Promise<{ status: number; body: unknown }> {
    let statusCode = 200;
    let responseBody: unknown;
    const req = {
        method,
        query: options.id ? { id: options.id } : {},
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

describe('training API safety', () => {
    beforeEach(() => {
        kvGet.mockReset();
        kvSet.mockReset();
        kvCreateFundedTrainingJob.mockReset();
        sessionWallet.mockReset();
    });

    it('rejects new funded training jobs without touching the ledger or queue', async () => {
        const response = await call(trainingJobs, 'POST', {
            body: { wallet: 'attacker-wallet', dataset_url: 'https://example.com/data.jsonl' },
        });

        expect(response.status).toBe(410);
        expect(response.body).toMatchObject({ error: 'training_disabled' });
        expect(kvCreateFundedTrainingJob).not.toHaveBeenCalled();
    });

    it('rejects all gradient updates without changing stored jobs', async () => {
        const response = await call(trainingGradient, 'POST', {
            body: { job_id: '0123456789abcdefabcd', node_id: 'untrusted-node' },
        });

        expect(response.status).toBe(410);
        expect(response.body).toMatchObject({ error: 'training_disabled' });
        expect(kvGet).not.toHaveBeenCalled();
        expect(kvSet).not.toHaveBeenCalled();
    });

    it('requires a wallet session to list historical jobs', async () => {
        const response = await call(trainingJobs, 'GET');

        expect(response.status).toBe(401);
        expect(kvGet).not.toHaveBeenCalled();
    });

    it('does not expose a historical job to another wallet session', async () => {
        sessionWallet.mockResolvedValue('owner-wallet');
        kvGet.mockResolvedValue(JSON.stringify({
            job_id: '0123456789abcdefabcd',
            wallet: 'other-wallet',
            gradients: [],
            shards_total: 1,
            shards_done: 0,
        }));

        const response = await call(trainingJob, 'GET', {
            id: '0123456789abcdefabcd',
            session: 'valid-session',
        });

        expect(response.status).toBe(404);
        expect(kvGet).toHaveBeenCalledWith('training:job:0123456789abcdefabcd');
    });
});
