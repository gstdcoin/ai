/**
 * POST /api/v1/telegram/bot/claim_reward
 * Moves pending node rewards to user's spendable balance.
 * Applies 10% development fund + 5% sovereign AI pool deductions.
 *
 * Body: { telegram_id }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet } from '../../../../../lib/kv';
import { kvIncrByFloat } from '../../../../../lib/kv';
import { isValidBotToken } from '../../../../../lib/botAuth';

const DEV_FUND_PCT       = 0.10;  // 10% → development fund
const SOVEREIGN_POOL_PCT = 0.05;  // 5% → sovereign AI pool

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    // Without this, anyone could force-claim on another user's behalf,
    // involuntarily converting their pending rewards through the 10%+5%
    // fee deduction before they chose to.
    if (!isValidBotToken(req)) return res.status(401).json({ error: 'Invalid bot token' });

    const { telegram_id } = req.body as { telegram_id?: string | number };
    if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });

    const userId = String(telegram_id);
    const wallet = await kvGet(`tg_wallet:${userId}`).catch(() => null);
    if (!wallet) {
        return res.status(404).json({ error: 'No wallet linked', telegram_id: userId });
    }

    const key    = wallet.toLowerCase();
    const pendRaw = await kvGet(`rewards:pending:${key}`).catch(() => null);
    const pending = pendRaw ? parseFloat(pendRaw) : 0;

    if (pending < 0.0001) {
        return res.status(200).json({ success: false, pending_gstd: 0, message: 'Nothing to claim' });
    }

    const devFund     = Math.round(pending * DEV_FUND_PCT * 1e6)       / 1e6;
    const sovereignAi = Math.round(pending * SOVEREIGN_POOL_PCT * 1e6) / 1e6;
    const netClaim    = Math.round((pending - devFund - sovereignAi) * 1e6) / 1e6;

    await Promise.all([
        kvSet(`rewards:pending:${key}`, '0'),
        kvIncrByFloat(`balance:${key}`, netClaim),
        kvIncrByFloat('rewards:treasury', devFund),
        kvIncrByFloat('rewards:sovereign_pool', sovereignAi),
    ]);

    return res.status(200).json({
        success:       true,
        claimed_gross: pending,
        claimed_net:   netClaim,
        gold_reserve:  devFund,
        burned:        sovereignAi,
        wallet,
    });
}
