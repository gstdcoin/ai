/**
 * POST /api/v1/settlement/quorum-proof/clear
 *
 * Admin-only (TREASURY_SECRET). Called by the relay script after a queued
 * quorum proof has been successfully submitted on-chain as
 * SettlementMaster.SettleTaskWithProof — removes it from the queue so it
 * isn't relayed twice (the contract itself also rejects a re-settle of the
 * same taskId, but there's no reason to keep retrying a done proof).
 *
 * Body: { ids: string[] }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvDel } from '../../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const secret = req.headers['x-admin-secret'] || req.query.secret;
    const expectedSecret = process.env.TREASURY_SECRET || '';
    if (!expectedSecret || secret !== expectedSecret) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const body: any = req.body || {};
        const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
        if (!ids.length) {
            return res.status(400).json({ error: 'ids array required' });
        }

        await Promise.all(ids.map((id) => kvDel(`settlement:quorum_proof:${id}`)));

        return res.status(200).json({ ok: true, cleared: ids.length });
    } catch (err: any) {
        console.error('[settlement/quorum-proof/clear]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
