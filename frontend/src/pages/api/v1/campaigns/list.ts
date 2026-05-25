/**
 * GET /api/v1/campaigns/list
 *
 * Returns all active campaigns.
 * Nodes call this to discover reward opportunities.
 * Companies call this to monitor their campaigns.
 *
 * Query params:
 *   type        — filter by required_type
 *   min_reward  — filter by minimum reward_per_task
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvKeys, kvMGet } from '../../../../lib/kv';
import type { Campaign } from './create';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { type, min_reward } = req.query;
        const minReward = min_reward ? parseFloat(String(min_reward)) : 0;

        const keys = await kvKeys('campaign:');
        if (keys.length === 0) {
            return res.status(200).json({ campaigns: [], count: 0, timestamp: Date.now() });
        }

        const raws = await kvMGet(keys);
        const now  = Date.now();

        const campaigns: Campaign[] = [];
        for (const raw of raws) {
            if (!raw) continue;
            try {
                const c: Campaign = JSON.parse(raw);
                if (!c.active) continue;
                if (new Date(c.expires_at).getTime() < now) continue;
                if (c.remaining_budget < c.reward_per_task) continue;
                if (type && c.required_type !== 'any' && c.required_type !== type) continue;
                if (minReward && c.reward_per_task < minReward) continue;
                campaigns.push(c);
            } catch { /* skip malformed */ }
        }

        // Sort by reward desc
        campaigns.sort((a, b) => b.reward_per_task - a.reward_per_task);

        return res.status(200).json({
            campaigns,
            count:     campaigns.length,
            timestamp: Date.now(),
        });
    } catch (err: any) {
        console.error('[campaigns/list]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
