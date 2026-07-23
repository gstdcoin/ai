/**
 * POST /api/v1/users/login
 *
 * Minimal wallet login for the web dashboard's TonConnect flow.
 * The frontend intentionally sends a "simple_connect" payload instead of a
 * real TonConnect proof (see the comment in WalletListener.tsx) -- this
 * endpoint matches that: it trusts the wallet_address the client reports
 * rather than verifying an Ed25519 signature. Same trust model as the
 * Telegram bot's wallet-link flow, which also takes the address at face
 * value.
 *
 * Body: { connect_payload: { wallet_address, public_key?, payload?, signature? } }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { randomBytes } from 'crypto';
import { kvGet, kvSet } from '../../../../lib/kv';

const TON_ADDRESS_RE = /^(EQ[A-Za-z0-9_-]{46}|UQ[A-Za-z0-9_-]{46}|0:[a-fA-F0-9]{64})$/;
const SESSION_TTL_SEC = 30 * 24 * 3600; // 30 days

interface UserRecord {
    wallet_address: string;
    created_at: string;
    updated_at: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const walletAddress = req.body?.connect_payload?.wallet_address;
    if (!walletAddress || typeof walletAddress !== 'string' || !TON_ADDRESS_RE.test(walletAddress)) {
        return res.status(400).json({ error: 'Valid connect_payload.wallet_address required' });
    }

    const walletKey = walletAddress.toLowerCase();
    const userKey = `user:${walletKey}`;

    const existingRaw = await kvGet(userKey).catch(() => null);
    const now = new Date().toISOString();
    const user: UserRecord = existingRaw
        ? { ...(JSON.parse(existingRaw as string) as UserRecord), updated_at: now }
        : { wallet_address: walletAddress, created_at: now, updated_at: now };

    const sessionToken = randomBytes(32).toString('hex');

    await Promise.all([
        kvSet(userKey, JSON.stringify(user)),
        kvSet(`session:${sessionToken}`, walletKey, SESSION_TTL_SEC),
    ]);

    return res.status(200).json({
        user: { wallet_address: user.wallet_address, address: user.wallet_address, created_at: user.created_at, updated_at: user.updated_at },
        session_token: sessionToken,
    });
}
