/**
 * POST /api/v1/mobile/node/claim
 *
 * Claims accumulated GSTD rewards for a mobile node session.
 * Requires wallet_address — credits GSTD to the wallet balance.
 * Resets accumulated_gstd to 0 after claim.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { Address } from '@ton/core';
import { kvClaimMobileRewards } from '../../../../../lib/kv';
import { validateTelegramInitData } from '../../../../../lib/telegramAuth';

const TON_ADDRESS_RE = /^(EQ[A-Za-z0-9_-]{46}|UQ[A-Za-z0-9_-]{46}|0:[a-fA-F0-9]{64})$/;
const MIN_CLAIM = 0.01; // minimum claimable amount
const MOBILE_NODE_TTL = 360;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (process.env.MOBILE_PRESENCE_REWARDS !== 'enabled') {
        return res.status(403).json({ error: 'presence_rewards_disabled', message: 'Phones earn GSTD for completed tasks, not for keeping the app open.' });
    }

    const { telegram_init_data, device_id, wallet_address } = req.body as any;

    // Require the same signed initData as register.ts — without this, anyone
    // who knows/guesses a tg_user_id + device_id (device_id has limited
    // entropy, see tma.tsx's getDeviceId()) could redirect someone else's
    // accumulated rewards to their own wallet_address.
    const tg_user_id = validateTelegramInitData(telegram_init_data);
    if (!tg_user_id) {
        return res.status(401).json({ error: 'Invalid Telegram auth' });
    }

    if (!device_id) {
        return res.status(400).json({ error: 'device_id required' });
    }

    if (typeof wallet_address !== 'string' || !TON_ADDRESS_RE.test(wallet_address)) {
        return res.status(400).json({ error: 'A valid TON wallet_address is required to claim rewards' });
    }

    const sessionKey = `mobile_node:${tg_user_id}:${device_id}`;
    let canonicalWallet: string;
    try {
        canonicalWallet = Address.parse(wallet_address).toRawString();
    } catch {
        return res.status(400).json({ error: 'Invalid TON wallet_address' });
    }
    const claim = await kvClaimMobileRewards(
        sessionKey,
        `balance:${wallet_address}`,
        wallet_address,
        Date.now(),
        MIN_CLAIM,
        MOBILE_NODE_TTL,
    );
    if (claim.status === 'not_found') {
        return res.status(404).json({ error: 'No active session found' });
    }
    if (claim.status === 'wallet_mismatch') {
        return res.status(403).json({ error: 'Wallet does not match the wallet linked to this mobile session' });
    }
    if (claim.status === 'invalid') {
        return res.status(500).json({ error: 'Mobile reward session data is invalid' });
    }
    if (claim.status === 'insufficient') {
        return res.status(400).json({
            error: 'insufficient_earnings',
            message: `Minimum claim is ${MIN_CLAIM} GSTD. You have ${claim.amount.toFixed(6)} GSTD accumulated.`,
            accumulated: Math.round(claim.amount * 10000) / 10000,
        });
    }
    const claimed = claim.amount;
    const newBal = claim.balance;
    console.log(`[mobile/claim] ${tg_user_id} claimed ${claimed.toFixed(6)} GSTD → ${canonicalWallet.slice(0, 12)}...`);

    return res.status(200).json({
        ok: true,
        claimed_gstd: Math.round(claimed * 10000) / 10000,
        new_balance: Math.round(newBal * 10000) / 10000,
        wallet_address: canonicalWallet,
        claimed_at: new Date().toISOString(),
    });
}
