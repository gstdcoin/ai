/**
 * POST /api/v1/campaigns/create
 *
 * Companies create incentive campaigns to attract GSTD nodes.
 * Nodes that join earn GSTD tokens for contributing resources.
 *
 * Body:
 *   company            string   — project/company name
 *   title              string   — campaign title
 *   description        string   — what this campaign is for
 *   reward_per_task    number   — GSTD earned per completed task
 *   total_budget       number   — total GSTD allocated for this campaign
 *   required_type      string   — 'inference'|'storage'|'compute'|'relay'|'any'
 *   required_caps      string[] — node capability requirements (optional)
 *   min_storage_gb     number   — minimum free storage (optional)
 *   min_ram_mb         number   — minimum free RAM (optional)
 *   min_cpu_cores      number   — minimum CPU cores (optional)
 *   require_gpu        boolean  — require GPU (optional)
 *   duration_hours     number   — campaign lifetime (default 24h, max 720h)
 *   contact            string   — website/email for campaign owner
 *
 * Protocol fee: 10% of total_budget goes to protocol treasury.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvSet, kvIncr, kvIncrByFloat } from '../../../../lib/kv';
import { randomBytes } from 'crypto';

const PROTOCOL_FEE_PCT = 0.10;
const MAX_DURATION_H   = 720;   // 30 days
const MAX_BUDGET       = 1_000_000;
const MAX_REWARD       = 100;
const CAMPAIGN_TTL_BUF = 3600;  // keep 1h after expiry for reporting

export interface Campaign {
    id:              string;
    company:         string;
    title:           string;
    description:     string;
    reward_per_task: number;
    total_budget:    number;
    remaining_budget:number;
    protocol_fee:    number;
    required_type:   string;
    required_caps:   string[];
    min_resources: {
        storage_gb: number;
        ram_mb:     number;
        cpu_cores:  number;
        require_gpu:boolean;
    };
    tasks_completed: number;
    nodes_joined:    string[];
    contact:         string;
    created_at:      string;
    expires_at:      string;
    active:          boolean;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = req.body as any;

        if (!body.company || !body.title || !body.reward_per_task || !body.total_budget) {
            return res.status(400).json({ error: 'company, title, reward_per_task, total_budget required' });
        }

        const rewardPerTask = Number(body.reward_per_task);
        const totalBudget   = Number(body.total_budget);
        const durationH     = Math.min(Number(body.duration_hours) || 24, MAX_DURATION_H);

        if (rewardPerTask <= 0 || rewardPerTask > MAX_REWARD) {
            return res.status(400).json({ error: `reward_per_task must be 0–${MAX_REWARD}` });
        }
        if (totalBudget <= 0 || totalBudget > MAX_BUDGET) {
            return res.status(400).json({ error: `total_budget must be 0–${MAX_BUDGET}` });
        }
        if (rewardPerTask > totalBudget) {
            return res.status(400).json({ error: 'reward_per_task cannot exceed total_budget' });
        }

        const protocolFee = Math.round(totalBudget * PROTOCOL_FEE_PCT * 100) / 100;
        const netBudget   = Math.round((totalBudget - protocolFee) * 100) / 100;
        const expiresAt   = new Date(Date.now() + durationH * 3600_000).toISOString();
        const ttlSec      = durationH * 3600 + CAMPAIGN_TTL_BUF;

        const campaign: Campaign = {
            id:               randomBytes(8).toString('hex'),
            company:          String(body.company).slice(0, 128),
            title:            String(body.title).slice(0, 256),
            description:      String(body.description || '').slice(0, 1024),
            reward_per_task:  rewardPerTask,
            total_budget:     totalBudget,
            remaining_budget: netBudget,
            protocol_fee:     protocolFee,
            required_type:    ['inference','storage','compute','relay','any'].includes(body.required_type)
                               ? body.required_type : 'any',
            required_caps:    Array.isArray(body.required_caps)
                               ? body.required_caps.slice(0, 10).map(String) : [],
            min_resources: {
                storage_gb:  Number(body.min_storage_gb)  || 0,
                ram_mb:      Number(body.min_ram_mb)       || 0,
                cpu_cores:   Number(body.min_cpu_cores)    || 0,
                require_gpu: !!body.require_gpu,
            },
            tasks_completed:  0,
            nodes_joined:     [],
            contact:          String(body.contact || '').slice(0, 256),
            created_at:       new Date().toISOString(),
            expires_at:       expiresAt,
            active:           true,
        };

        // Store campaign + accumulate protocol treasury
        await Promise.all([
            kvSet(`campaign:${campaign.id}`, JSON.stringify(campaign), ttlSec),
            kvIncr('stats:total_campaigns'),
            kvIncrByFloat('stats:protocol_treasury_gstd', protocolFee),
        ]);

        return res.status(200).json({
            ok:               true,
            campaign_id:      campaign.id,
            net_budget:       netBudget,
            protocol_fee:     protocolFee,
            expires_at:       expiresAt,
            max_tasks:        Math.floor(netBudget / rewardPerTask),
        });
    } catch (err: any) {
        console.error('[campaigns/create]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
