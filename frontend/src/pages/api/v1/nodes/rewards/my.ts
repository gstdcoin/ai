/**
 * GET /api/v1/nodes/rewards/my?wallet=...
 * Requires a verified TON wallet session; an optional wallet query must match it.
 * Returns tier/streak/earnings info for a wallet.
 * Stub — rewards are tracked on-chain; this returns
 * data from the node's own heartbeat record.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvKeys, kvMGet } from '../../../../../lib/kv';
import { sessionWallet } from '../../../../../lib/walletSession';
import type { NodeRecord } from '../register';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const wallet = await sessionWallet(req.headers);
    if (!wallet) return res.status(401).json({ error: 'Verified wallet session required' });

    const requestedWallet = req.query.wallet;
    if (requestedWallet !== undefined) {
        if (typeof requestedWallet !== 'string' || !requestedWallet.trim()) {
            return res.status(400).json({ error: 'wallet query param must be a single address' });
        }
        if (requestedWallet.trim().toLowerCase() !== wallet) {
            return res.status(403).json({ error: 'Wallet does not match the authenticated session' });
        }
    }

    // Find node record by wallet address (root keys only; prefer named over UUID)
    let record: NodeRecord | null = null;
    if (wallet) {
        const keys = (await kvKeys('node:')).filter(k => !k.slice(5).includes(':'));
        if (keys.length > 0) {
            const values = await kvMGet(keys);
            const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
            const matches = values
                .filter((v): v is string => v !== null)
                .map(v => JSON.parse(v) as NodeRecord)
                .filter(n => n.wallet_address.toLowerCase() === wallet);
            // Prefer named node over UUID-generated IDs
            record = matches.find(n => !UUID_RE.test(n.node_id)) || matches[0] || null;
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
