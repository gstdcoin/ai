/**
 * POST /api/v1/agents/register
 * Register an external AI agent to the GSTD task network.
 *
 * Body: {
 *   wallet?:      string   — if provided, must match the verified TON session
 *   capabilities: string[] — e.g. ["inference", "reasoning", "finetune"]
 *   agent_id?:    string   — custom ID; defaults to wallet prefix
 *   endpoint?:    string   — optional public HTTPS endpoint for push tasks
 * }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvIncr } from '../../../../lib/kv';
import { sessionWallet } from '../../../../lib/walletSession';

const VALID_CAPS = ['inference', 'reasoning', 'embedding', 'vision', 'audio', 'code'];
const AGENT_TTL  = 7 * 24 * 3600; // 7 days — must re-register to stay active

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { wallet: requestedWallet, capabilities, agent_id, endpoint } = req.body || {};
    const wallet = await sessionWallet(req.headers);
    if (!wallet) return res.status(401).json({ error: 'Verified wallet session required' });
    if (requestedWallet !== undefined) {
        if (typeof requestedWallet !== 'string' || requestedWallet.trim().toLowerCase() !== wallet) {
            return res.status(403).json({ error: 'Wallet does not match the authenticated session' });
        }
    }

    if (!Array.isArray(capabilities) || capabilities.length === 0) {
        return res.status(400).json({ error: 'capabilities must be a non-empty array', valid: VALID_CAPS });
    }
    const caps = capabilities.filter((c: string) => VALID_CAPS.includes(c));
    if (caps.length === 0) {
        return res.status(400).json({ error: 'No valid capabilities provided', valid: VALID_CAPS });
    }

    const walletKey = wallet.trim().toLowerCase();
    const id        = (agent_id || walletKey.slice(0, 12)).replace(/[^a-z0-9_-]/gi, '-').slice(0, 40);

    // Idempotent: if agent already registered, update it
    const existingRaw = await kvGet(`agent:${id}`);
    const existing    = existingRaw ? JSON.parse(existingRaw) : null;
    if (existing && existing.wallet !== walletKey) {
        return res.status(403).json({ error: 'Agent ID is already registered to another wallet' });
    }

    const agent = {
        agent_id:      id,
        wallet:        walletKey,
        capabilities:  caps,
        endpoint:      endpoint || null,
        registered_at: existing?.registered_at || new Date().toISOString(),
        updated_at:    new Date().toISOString(),
        tasks_done:    existing?.tasks_done || 0,
        gstd_earned:   existing?.gstd_earned || 0,
    };

    await kvSet(`agent:${id}`, JSON.stringify(agent), AGENT_TTL);
    await kvSet(`agent:wallet:${walletKey}`, id, AGENT_TTL);
    if (!existing) await kvIncr('stats:agents_registered');

    return res.status(200).json({
        ok:           true,
        agent_id:     id,
        capabilities: caps,
        wallet:       walletKey,
        poll_url:     '/api/v1/tasks/poll',
        result_url:   '/api/v1/tasks/result',
        message:      'Agent registered. Use poll_url to fetch tasks and result_url to submit completions.',
    });
}
