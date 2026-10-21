/**
 * GET /api/v1/access/tier?wallet=<address>
 * Wallet-scoped data requires a verified TON session matching the query address,
 * or a valid internal bot token with a linked Telegram user ID.
 *
 * Returns the user's AI access tier based on their GSTD balance.
 * Zero GSTD = Basic (free models always available).
 * Users earn GSTD by running nodes — no purchase required.
 * Fees are paid by the user when they USE the network, not when they JOIN.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys, kvMGet } from '../../../../lib/kv';
import { sessionWallet } from '../../../../lib/walletSession';
import { isValidBotToken } from '../../../../lib/botAuth';

export interface AccessTier {
    tier:        'basic' | 'contributor' | 'standard' | 'pro' | 'ultra';
    name:        string;
    min_gstd:    number;
    max_gstd:    number | null;
    emoji:       string;
    ai_models:   string[];   // available model IDs
    smartmix:    string;     // free | standard | pro | ultra
    queries_per_day: number | null;  // null = unlimited
    cost_per_query_gstd: number;
    description: string;
    how_to_reach: string;
}

export const TIERS: AccessTier[] = [
    {
        tier:        'basic',
        name:        'Basic',
        min_gstd:    0,
        max_gstd:    9.99,
        emoji:       '🌱',
        ai_models:   ['llama3.2:3b', 'llama3.2:1b', 'phi3:mini', 'gemma2:2b'],
        smartmix:    'free',
        queries_per_day: 50,
        cost_per_query_gstd: 0,
        description: 'Free forever. Connect wallet + run a node to start earning.',
        how_to_reach: 'You are here. Link your wallet and run a node to earn GSTD.',
    },
    {
        tier:        'contributor',
        name:        'Contributor',
        min_gstd:    10,
        max_gstd:    99.99,
        emoji:       '🐝',
        ai_models:   ['llama3.2:3b', 'llama3.1:8b', 'qwen2.5:7b', 'mistral:7b', 'phi3:mini'],
        smartmix:    'free',
        queries_per_day: 200,
        cost_per_query_gstd: 0,
        description: 'Earned by running a node for a few hours. More models, higher query limit.',
        how_to_reach: 'Run a node for ~20 hours (Bronze tier earns 0.5 GSTD/h).',
    },
    {
        tier:        'standard',
        name:        'Standard',
        min_gstd:    100,
        max_gstd:    999.99,
        emoji:       '⚡',
        ai_models:   ['llama3.1:8b', 'qwen2.5:7b', 'qwen2.5:14b', 'mistral:7b', 'phi3:medium', 'deepseek-r1:14b'],
        smartmix:    'standard',
        queries_per_day: null,
        cost_per_query_gstd: 0.5,
        description: 'Council of 3 experts. Paid per query from your GSTD balance.',
        how_to_reach: 'Earned by running a node for ~200 hours, or 8 days at Gold tier.',
    },
    {
        tier:        'pro',
        name:        'Pro',
        min_gstd:    1000,
        max_gstd:    9999.99,
        emoji:       '🔥',
        ai_models:   ['llama3.1:8b', 'llama3.1:70b', 'qwen2.5:32b', 'deepseek-r1:14b', 'deepseek-r1:70b', 'codellama:70b'],
        smartmix:    'pro',
        queries_per_day: null,
        cost_per_query_gstd: 2.0,
        description: 'Panel of 5 experts. All 16GB+ models available.',
        how_to_reach: 'Earned by running a 8GB node for ~1000 hours.',
    },
    {
        tier:        'ultra',
        name:        'Ultra',
        min_gstd:    10000,
        max_gstd:    null,
        emoji:       '🧠',
        ai_models:   ['*'],  // all models
        smartmix:    'ultra',
        queries_per_day: null,
        cost_per_query_gstd: 5.0,
        description: 'Full swarm of 7 experts. Every model in the network. Enterprise quality.',
        how_to_reach: 'Earned by running a flagship 32GB node for ~2000 hours.',
    },
];

function getTier(balance: number): AccessTier {
    for (let i = TIERS.length - 1; i >= 0; i--) {
        if (balance >= TIERS[i].min_gstd) return TIERS[i];
    }
    return TIERS[0];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const requestedWallet = req.query.wallet;
    const requestedTelegramId = req.query.telegram_id;
    if (requestedWallet !== undefined && (typeof requestedWallet !== 'string' || !requestedWallet.trim())) {
        return res.status(400).json({ error: 'wallet query param must be a single address' });
    }
    if (requestedTelegramId !== undefined && (
        typeof requestedTelegramId !== 'string' || !/^\d{1,15}$/.test(requestedTelegramId)
    )) {
        return res.status(400).json({ error: 'telegram_id must be a numeric Telegram user ID' });
    }
    if (requestedWallet !== undefined && requestedTelegramId !== undefined) {
        return res.status(400).json({ error: 'Use either wallet or telegram_id, not both' });
    }

    let balance   = 0;
    let pending   = 0;
    let staked    = 0;
    let nodeCount = 0;
    let wallet: string | null = null;

    if (typeof requestedTelegramId === 'string') {
        if (!isValidBotToken(req)) return res.status(401).json({ error: 'Invalid bot token' });
        try {
            const linkedWallet = await kvGet(`tg_wallet:${requestedTelegramId}`);
            if (!linkedWallet) return res.status(404).json({ error: 'No wallet linked to this Telegram account' });
            wallet = String(linkedWallet).toLowerCase();
        } catch (err: any) {
            console.error('[access/tier telegram]', err?.message || err);
            return res.status(500).json({ error: 'Could not resolve linked Telegram wallet' });
        }
    } else if (typeof requestedWallet === 'string') {
        const authenticatedWallet = await sessionWallet(req.headers);
        if (!authenticatedWallet) return res.status(401).json({ error: 'Verified wallet session required' });
        if (requestedWallet.trim().toLowerCase() !== authenticatedWallet) {
            return res.status(403).json({ error: 'Wallet does not match the authenticated session' });
        }
        wallet = authenticatedWallet;
    }

    if (wallet) {
        res.setHeader('Cache-Control', 'private, no-store');
        try {
            const [balRaw, pendRaw, stakRaw] = await Promise.all([
                kvGet(`balance:${wallet}`),
                kvGet(`rewards:pending:${wallet}`),
                kvGet(`staked:${wallet}`),
            ]);
            balance = balRaw ? Number(balRaw) : 0;
            pending = pendRaw ? Number(pendRaw) : 0;
            staked = stakRaw ? Number(stakRaw) : 0;
            if (![balance, pending, staked].every(Number.isFinite) || balance < 0 || pending < 0 || staked < 0) {
                throw new Error('Invalid stored wallet tier data');
            }

            const nodeKeys = await kvKeys('node:*');
            const nodeValues = await kvMGet(nodeKeys);
            for (const raw of nodeValues) {
                if (!raw) continue;
                try {
                    const node = JSON.parse(raw);
                    if ((node.wallet_address || '').toLowerCase() === wallet) nodeCount++;
                } catch {
                    // Ignore malformed, unrelated node records.
                }
            }
        } catch (err: any) {
            console.error('[access/tier]', err?.message || err);
            return res.status(500).json({ error: 'Could not load wallet access tier' });
        }
    }

    const currentTier = getTier(balance);
    const nextTier    = TIERS[TIERS.indexOf(currentTier) + 1] || null;
    const toNextTier  = nextTier ? Math.max(0, nextTier.min_gstd - balance) : 0;

    return res.status(200).json({
        wallet:          wallet || null,
        balance_gstd:    balance,
        pending_gstd:    pending,
        staked_gstd:     staked,
        active_nodes:    nodeCount,
        current_tier:    currentTier,
        next_tier:       nextTier,
        gstd_to_next:    toNextTier,
        all_tiers:       TIERS,
        earning_paths: [
            { method: 'Mobile node (Bronze)',   rate_per_hour: 0.5,  note: 'Run via Telegram TMA — zero setup' },
            { method: 'Mobile node (Silver)',   rate_per_hour: 1.0,  note: 'Mid-range device' },
            { method: 'Mobile node (Gold)',     rate_per_hour: 2.0,  note: 'Flagship device' },
            { method: 'Desktop node (8GB)',     rate_per_hour: 1.5,  note: 'Earns for AI inference tasks' },
            { method: 'Desktop node (32GB)',    rate_per_hour: 5.0,  note: 'Handles flagship model requests' },
        ],
        zero_balance_note: 'You do NOT need GSTD to start. Link your wallet → run a node → earn GSTD automatically.',
        timestamp: Date.now(),
    });
}
