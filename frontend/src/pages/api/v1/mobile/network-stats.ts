/**
 * GET /api/v1/mobile/network-stats
 * Returns aggregate stats for the GSTD mobile node network.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const [totalMobileRaw, totalClaimedRaw] = await Promise.all([
            kvGet('stats:mobile_nodes_total'),
            kvGet('stats:mobile_total_claimed'),
        ]);

        // Count currently active sessions
        const sessionKeys = await kvKeys('mobile_node:');
        const nowTs = Date.now();
        let activeCount = 0;
        let tierCounts = { bronze: 0, silver: 0, gold: 0, platinum: 0 };

        for (const key of sessionKeys.slice(0, 200)) {
            try {
                const raw = await kvGet(key);
                if (!raw) continue;
                const session = JSON.parse(raw);
                const age = (nowTs - (session.last_heartbeat_ts || 0)) / 1000;
                if (age <= 360) {
                    activeCount++;
                    const t = session.tier as keyof typeof tierCounts;
                    if (t in tierCounts) tierCounts[t]++;
                }
            } catch { continue; }
        }

        return res.status(200).json({
            active_mobile_nodes: activeCount,
            total_registered: parseInt(totalMobileRaw || '0'),
            total_gstd_claimed: parseFloat(totalClaimedRaw || '0'),
            tier_distribution: tierCounts,
            reward_rates: {
                bronze: 0.5,
                silver: 1.0,
                gold: 2.0,
                platinum: 5.0,
            },
            network_status: activeCount > 0 ? 'active' : 'initializing',
            updated_at: new Date().toISOString(),
        });
    } catch (err: any) {
        console.error('[mobile/network-stats]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
