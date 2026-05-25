/**
 * POST /api/v1/campaigns/join
 *
 * Node registers itself as a participant in a campaign.
 * Returns the campaign details + confirmation.
 *
 * Body: { campaign_id, node_id, capabilities, resources }
 *   resources: { storage_free_gb, ram_free_mb, cpu_cores, gpu_vram_mb }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet } from '../../../../lib/kv';
import type { Campaign } from './create';

const CAMPAIGN_TTL_BUF = 3600;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = req.body as any;
        const { campaign_id, node_id } = body;

        if (!campaign_id || !node_id) {
            return res.status(400).json({ error: 'campaign_id and node_id required' });
        }

        const raw = await kvGet(`campaign:${campaign_id}`);
        if (!raw) {
            return res.status(404).json({ error: 'Campaign not found or expired' });
        }

        const campaign: Campaign = JSON.parse(raw);

        if (!campaign.active || new Date(campaign.expires_at).getTime() < Date.now()) {
            return res.status(410).json({ error: 'Campaign expired' });
        }
        if (campaign.remaining_budget < campaign.reward_per_task) {
            return res.status(409).json({ error: 'Campaign budget exhausted' });
        }

        // Check node meets resource requirements
        const resources = body.resources || {};
        const caps: string[] = body.capabilities || [];
        const { min_resources, required_caps } = campaign;

        if (min_resources.storage_gb > 0 && (resources.storage_free_gb || 0) < min_resources.storage_gb) {
            return res.status(422).json({ error: `Requires ${min_resources.storage_gb}GB free storage` });
        }
        if (min_resources.ram_mb > 0 && (resources.ram_free_mb || 0) < min_resources.ram_mb) {
            return res.status(422).json({ error: `Requires ${min_resources.ram_mb}MB free RAM` });
        }
        if (min_resources.cpu_cores > 0 && (resources.cpu_cores || 0) < min_resources.cpu_cores) {
            return res.status(422).json({ error: `Requires ${min_resources.cpu_cores} CPU cores` });
        }
        if (min_resources.require_gpu && !resources.gpu_vram_mb) {
            return res.status(422).json({ error: 'Requires GPU' });
        }
        for (const cap of required_caps) {
            if (!caps.includes(cap)) {
                return res.status(422).json({ error: `Missing capability: ${cap}` });
            }
        }

        // Register node in campaign (deduplicated)
        if (!campaign.nodes_joined.includes(node_id)) {
            campaign.nodes_joined.push(node_id);
        }

        const remaining = Math.ceil((new Date(campaign.expires_at).getTime() - Date.now()) / 1000);
        await kvSet(`campaign:${campaign_id}`, JSON.stringify(campaign), remaining + CAMPAIGN_TTL_BUF);

        return res.status(200).json({
            ok:              true,
            campaign_id:     campaign.id,
            title:           campaign.title,
            company:         campaign.company,
            reward_per_task: campaign.reward_per_task,
            required_type:   campaign.required_type,
            max_tasks_left:  Math.floor(campaign.remaining_budget / campaign.reward_per_task),
            expires_at:      campaign.expires_at,
        });
    } catch (err: any) {
        console.error('[campaigns/join]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
