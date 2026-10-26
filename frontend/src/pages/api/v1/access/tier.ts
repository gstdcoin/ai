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
import { moneyBalance, walletId } from '../../../../lib/money';

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

// Compatibility view only: access is determined by quota, model price and live capacity.
export const TIERS: AccessTier[] = [{
    tier:'basic',name:'Compute access',min_gstd:0,max_gstd:null,emoji:'🌱',
    ai_models:[],smartmix:'free',queries_per_day:50,cost_per_query_gstd:0,
    description:'Free quota is separate from paid credit. Model availability and price are checked per request.',
    how_to_reach:'Earn GSTD from accepted paid work or make a verified deposit. No hourly rewards.',
}];

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
            wallet = walletId(String(linkedWallet));
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
            const ledger = await moneyBalance(wallet);
            balance = ledger.balance_gstd;
            pending = ledger.pending_gstd;
            staked = 0;

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
        earning_paths: [{method:'Accepted funded work',executor_pct:85,rate_per_hour:null}],
        zero_balance_note:'A node can start without GSTD. Earnings require available funded accepted work; no guaranteed income.',
        ledger_version:2,
        pricing_endpoint:'/api/v1/models/available',
        payments_url:'/payments',
        timestamp: Date.now(),
    });
}
