/**
 * POST /api/v1/genesis/ignite
 *
 * Genesis Handshake — authenticates a gstd-a2a agent or node by wallet address.
 * Issues a session token (24h TTL) stored in KV.
 *
 * Body: { wallet_address: string }
 * Returns: { token: string, wallet_address: string, expires_at: string }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvSet } from '../../../../lib/kv';
import { randomBytes } from 'crypto';

const TON_ADDR_RE = /^(EQ[A-Za-z0-9_-]{46}|UQ[A-Za-z0-9_-]{46}|0:[a-fA-F0-9]{64})$/;
const TOKEN_TTL   = 24 * 3600;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body           = req.body as any;
        const walletAddress: string = (body.wallet_address || '').trim();

        if (!walletAddress) {
            return res.status(400).json({ error: 'wallet_address required' });
        }
        // Accept any non-empty address — TON format preferred but SDK may send any
        const isValidTon = TON_ADDR_RE.test(walletAddress);
        if (!isValidTon && walletAddress.length < 10) {
            return res.status(400).json({ error: 'Invalid wallet_address' });
        }

        const token      = randomBytes(32).toString('hex');
        const expiresAt  = new Date(Date.now() + TOKEN_TTL * 1000).toISOString();

        // Store token → wallet mapping for downstream route auth
        await kvSet(`session:${token}`, JSON.stringify({
            wallet_address: walletAddress,
            created_at:     new Date().toISOString(),
            expires_at:     expiresAt,
        }), TOKEN_TTL);

        return res.status(200).json({
            token,
            wallet_address: walletAddress,
            expires_at:     expiresAt,
        });
    } catch (err: any) {
        console.error('[genesis/ignite]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
