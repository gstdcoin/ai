/**
 * GET /api/v1/settlement/quorum-proofs
 *
 * Admin-only (TREASURY_SECRET). Lists queued quorum proofs submitted by
 * nodes via POST /api/v1/settlement/quorum-proof, for the relay script
 * (contracts/scripts/settle-quorum-proof.ts) to submit on-chain.
 *
 * Read-only — does not consume the queue. After a proof is successfully
 * settled on-chain, the relay calls POST /api/v1/settlement/quorum-proof/clear
 * with its id to remove it. This two-step (peek, then clear-on-success)
 * avoids losing a proof if the relay crashes mid-run.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const secret = req.headers['x-admin-secret'] || req.query.secret;
    const expectedSecret = process.env.TREASURY_SECRET || '';
    if (!expectedSecret || secret !== expectedSecret) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const keys = await kvKeys('settlement:quorum_proof:');
        const raws = await Promise.all(keys.map((k) => kvGet(k)));
        const proofs = raws
            .map((r) => { try { return r ? JSON.parse(r) : null; } catch { return null; } })
            .filter(Boolean);

        return res.status(200).json({ proofs, count: proofs.length });
    } catch (err: any) {
        console.error('[settlement/quorum-proofs]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
