/**
 * POST /api/v1/mobile/node/claim
 *
 * Claims accumulated GSTD rewards for a mobile node session.
 * Requires wallet_address — credits GSTD to the wallet balance.
 * Resets accumulated_gstd to 0 after claim.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvIncr } from '../../../../../lib/kv';

const MIN_CLAIM = 0.01; // minimum claimable amount
const MOBILE_NODE_TTL = 360;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { tg_user_id, device_id, wallet_address } = req.body as any;
    if (!tg_user_id || !device_id) {
        return res.status(400).json({ error: 'tg_user_id and device_id required' });
    }

    if (!wallet_address) {
        return res.status(400).json({ error: 'wallet_address required to claim rewards' });
    }

    const sessionKey = `mobile_node:${tg_user_id}:${device_id}`;
    const raw = await kvGet(sessionKey);
    if (!raw) {
        return res.status(404).json({ error: 'No active session found' });
    }

    const session = JSON.parse(raw);
    const nowTs = Date.now();

    // Add earnings since last heartbeat
    let accumulated = session.accumulated_gstd || 0;
    if (session.last_heartbeat_ts) {
        const elapsedHours = (nowTs - session.last_heartbeat_ts) / 3_600_000;
        accumulated += elapsedHours * (session.rate_per_hour || 0.5);
    }

    if (accumulated < MIN_CLAIM) {
        return res.status(400).json({
            error: 'insufficient_earnings',
            message: `Minimum claim is ${MIN_CLAIM} GSTD. You have ${accumulated.toFixed(6)} GSTD accumulated.`,
            accumulated: Math.round(accumulated * 10000) / 10000,
        });
    }

    // Credit GSTD to wallet balance
    const balanceKey = `balance:${wallet_address}`;
    const currentBalRaw = await kvGet(balanceKey);
    const currentBal = currentBalRaw ? parseFloat(currentBalRaw) : 0;
    const newBal = currentBal + accumulated;
    await kvSet(balanceKey, String(newBal));

    // Reset session earnings and save
    session.accumulated_gstd = 0;
    session.last_heartbeat_ts = nowTs;
    session.wallet_address = wallet_address;
    await kvSet(sessionKey, JSON.stringify(session), MOBILE_NODE_TTL);

    // Track total mobile earnings
    await kvIncr('stats:mobile_total_claimed');

    console.log(`[mobile/claim] ${tg_user_id} claimed ${accumulated.toFixed(6)} GSTD → ${wallet_address.substring(0, 12)}...`);

    return res.status(200).json({
        ok: true,
        claimed_gstd: Math.round(accumulated * 10000) / 10000,
        new_balance: Math.round(newBal * 10000) / 10000,
        wallet_address,
        claimed_at: new Date().toISOString(),
    });
}
