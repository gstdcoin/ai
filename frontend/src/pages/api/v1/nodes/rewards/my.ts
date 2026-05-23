/**
 * GET /api/v1/nodes/rewards/my?wallet=...
 * Returns tier/streak/earnings info for a wallet.
 * Stub — rewards are tracked on-chain; this returns
 * data from the node's own heartbeat record.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvKeys, kvMGet } from '../../../../../lib/kv';
import type { NodeRecord } from '../register';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const wallet = req.query.wallet as string;

    // Find node record by wallet address
    let record: NodeRecord | null = null;
    if (wallet) {
        const keys = await kvKeys('node:');
        if (keys.length > 0) {
            const values = await kvMGet(keys);
            record = values
                .filter((v): v is string => v !== null)
                .map(v => JSON.parse(v) as NodeRecord)
                .find(n => n.wallet_address === wallet) || null;
        }
    }

    if (!record) {
        return res.status(200).json({ registered: false });
    }

    const uptimeHours = record.uptime_hours || 0;

    // Simple tier calculation based on uptime
    let tier = { name: 'bronze', icon: '🥉' };
    if (uptimeHours >= 720)      tier = { name: 'diamond',  icon: '👑' };
    else if (uptimeHours >= 336) tier = { name: 'platinum', icon: '💎' };
    else if (uptimeHours >= 168) tier = { name: 'gold',     icon: '🥇' };
    else if (uptimeHours >= 48)  tier = { name: 'silver',   icon: '🥈' };

    return res.status(200).json({
        registered: true,
        node_id:    record.node_id,
        tier,
        streak:  { days: Math.floor(uptimeHours / 24), best: Math.floor(uptimeHours / 24) },
        stats:   { effective_rate_per_h: 0.5, tasks_completed: record.tasks_completed },
        earnings: { total: record.gstd_earned || 0 },
        next_tier: tier.name === 'bronze' ? { name: 'silver', hours_needed: Math.max(0, 48 - uptimeHours) } : null,
    });
}
