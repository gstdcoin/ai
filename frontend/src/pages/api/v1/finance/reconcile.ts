import type { NextApiRequest, NextApiResponse } from 'next';
import { matchesSecret } from '../../../../lib/secretAuth';
import { custodySnapshot, PLATFORM_CUSTODY_OWNER } from '../../../../lib/custody';
import { MoneyError, walletId, readMoneySystem, reconcileMoney } from '../../../../lib/money';
export default async function handler(req: NextApiRequest,res: NextApiResponse) {
    if (!matchesSecret(req.headers['x-treasury-secret'],process.env.TREASURY_SECRET || ''))
        return res.status(401).json({ error: 'Unauthorized' });
    if (req.method === 'GET') return res.status(200).json({ system: await readMoneySystem() });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        const { custody_owner, manifest, legacy_hold_nano, legacy_review_complete, allocations = [], preview = true } = req.body || {};
        if (typeof custody_owner !== 'string' || typeof manifest !== 'string' || typeof legacy_hold_nano !== 'string'
            || legacy_review_complete !== true || !Array.isArray(allocations) || allocations.length > 100)
            return res.status(400).json({ error: 'inventory_review_required' });
        if (walletId(custody_owner) !== PLATFORM_CUSTODY_OWNER) throw new MoneyError('custody_mismatch');
        const snapshot = await custodySnapshot(custody_owner);
        if (preview !== false) return res.status(200).json({ preview: true, snapshot,
            note: 'Review all existing obligations and custody control before committing allocations. No tokens are transferred.' });
        const system = await reconcileMoney(snapshot,{ manifest, legacyHold: legacy_hold_nano,
            migrationReviewed: true, allocations });
        return res.status(200).json({ ok: true, system });
    } catch (error) {
        return res.status(error instanceof MoneyError ? 409 : 503).json({
            error: error instanceof MoneyError ? error.code : 'reconciliation_failed' });
    }
}
