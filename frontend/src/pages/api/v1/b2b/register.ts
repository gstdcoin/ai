/**
 * POST /api/v1/b2b/register
 * Register a new B2B API client. Returns an API key.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet } from '../../../../lib/kv';
import { createHash, randomBytes } from 'crypto';

const CLIENT_TTL = 60 * 60 * 24 * 365; // 1 year

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { company_name, email, wallet_address } = req.body as any;
    // tier always starts at 'starter' — upgrades via admin endpoint only
    const tier = 'starter';

    if (!wallet_address) return res.status(400).json({ error: 'wallet_address required' });

    try {
        const existingKey = `b2b:wallet:${wallet_address}`;
        const existing = await kvGet(existingKey);
        if (existing) {
            // Never re-expose the key — user must have saved it at registration
            return res.status(200).json({ client_id: JSON.parse(existing).client_id, message: 'Already registered' });
        }

        const apiKey = `gstd_b2b_sk_${randomBytes(24).toString('hex')}`;
        const keyHash = createHash('sha256').update(apiKey).digest('hex');
        const clientId = Date.now();

        // Wallet KV: no api_key stored — key_hash only (audit trail without plaintext)
        const walletRecord = {
            client_id: clientId,
            wallet: wallet_address,
            key_hash: keyHash,
            profile: {
                company_name: company_name || 'Developer',
                email: email || '',
                tier,
                balance_usd: 0,
                balance_gstd: 0,
                balance_stars: 0,
                rate_limit_rps: 10,
                total_requests: 0,
                total_spent_usd: 0,
            },
            registered_at: new Date().toISOString(),
        };
        // Key KV: stores profile (no api_key — hash is the lookup key itself)
        const keyRecord = { ...walletRecord };

        await Promise.all([
            kvSet(existingKey, JSON.stringify(walletRecord), CLIENT_TTL),
            kvSet(`b2b:key:${keyHash}`, JSON.stringify(keyRecord), CLIENT_TTL),
        ]);

        // Return plaintext key once — never stored, never re-retrievable
        return res.status(200).json({ api_key: apiKey, client_id: clientId, tier });
    } catch (err: any) {
        console.error('[b2b/register]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
