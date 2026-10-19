/**
 * POST /api/v1/marketplace/request
 *
 * Submit a resource request tied to a campaign. Requires X-Session-Token of the campaign's funding wallet.
 * The task is queued with routing metadata so the best-fit node picks it up.
 *
 * Body:
 *   campaign_id     string   — which campaign funds this task
 *   requester       string   — wallet address or company ID of requester
 *   type            string   — 'inference'|'storage'|'compute'|'relay'
 *   payload         object   — task payload (model+prompt for inference, etc.)
 *   required_caps   string[] — capabilities the executing node must have
 *   min_resources   object   — { storage_gb?, ram_mb?, cpu_cores?, gpu_vram_mb? }
 *   priority        number   — 1–10 (default 1)
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvReserveCampaignTask } from '../../../../lib/kv';
import { sessionWallet } from '../../../../lib/walletSession';
import { randomBytes } from 'crypto';
import type { Campaign } from '../campaigns/create';

const CAMPAIGN_TTL_BUF = 3600;
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = req.body as any;

        if (!body.campaign_id || !body.type || !body.payload) {
            return res.status(400).json({ error: 'campaign_id, type, payload required' });
        }

        const raw = await kvGet(`campaign:${body.campaign_id}`);
        if (!raw) {
            return res.status(404).json({ error: 'Campaign not found or expired' });
        }

        const campaign: Campaign = JSON.parse(raw);
        // Tasks spend the funder's budget, so only the funding wallet may request them.
        if ((await sessionWallet(req.headers)) !== String(campaign.funder_wallet || '').toLowerCase()) {
            return res.status(403).json({ error: 'Only the campaign funder can request tasks' });
        }
        if (!campaign.active || new Date(campaign.expires_at).getTime() < Date.now()) {
            return res.status(410).json({ error: 'Campaign expired' });
        }
        if (campaign.remaining_budget < campaign.reward_per_task) {
            return res.status(409).json({ error: 'Campaign budget exhausted' });
        }

        const taskId = randomBytes(8).toString('hex');

        // Build routable task with resource requirements
        const task = {
            task_id:          taskId,
            type:             body.type,
            payload:          body.payload,
            priority:         Math.min(Math.max(parseInt(body.priority) || 1, 1), 10),
            required_caps:    body.required_caps || campaign.required_caps || [],
            min_resources:    body.min_resources || campaign.min_resources || {},
            requester:        String(body.requester || campaign.company).slice(0, 128),
            created_at:       new Date().toISOString(),
        };

        const remaining = Math.ceil((new Date(campaign.expires_at).getTime() - Date.now()) / 1000);
        const reservation = await kvReserveCampaignTask(
            `campaign:${campaign.id}`,
            'tasks:queue',
            JSON.stringify(task),
            remaining + CAMPAIGN_TTL_BUF,
            Date.now(),
            Date.parse(campaign.expires_at),
        );
        if (reservation.status !== 'reserved') {
            if (reservation.status === 'not_found') {
                return res.status(404).json({ error: 'Campaign not found or expired' });
            }
            if (reservation.status === 'inactive' || reservation.status === 'expired') {
                return res.status(410).json({ error: 'Campaign expired' });
            }
            if (reservation.status === 'exhausted') {
                return res.status(409).json({ error: 'Campaign budget exhausted' });
            }
            console.error('[marketplace/request] Campaign reservation rejected invalid stored state');
            return res.status(500).json({ error: 'Campaign reservation failed' });
        }

        return res.status(200).json({
            ok:           true,
            task_id:      taskId,
            reward_gstd:  reservation.nodeReward,
            protocol_fee: reservation.protocolFee,
            budget_left:  reservation.remainingBudget,
            tasks_left:   Math.floor(reservation.remainingBudget / campaign.reward_per_task),
        });
    } catch (err: any) {
        console.error('[marketplace/request]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
