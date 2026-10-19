/**
 * POST /api/v1/free-api/key
 *
 * Issue a persistent free-tier API key to a wallet with 10,000+ GSTD.
 * The key is stored by wallet address and reused across calls (idempotent).
 * Key grants access to the GSTD node network with rate-limited inference.
 *
 * Body: { telegram_id, wallet_address }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet } from '../../../../lib/kv';
import { randomBytes } from 'crypto';

const REQUIRED_BALANCE = 10_000;
const FREE_API_PREFIX  = 'gstdf_';

function makeKey(): string {
    return FREE_API_PREFIX + randomBytes(24).toString('base64url');
}

interface FreeApiRecord {
    api_key:        string;
    wallet_address: string;
    telegram_id:    string | number;
    created_at:     number;
    last_used:      number;
    active:         boolean;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { telegram_id, wallet_address } = req.body as {
        telegram_id?: string | number;
        wallet_address?: string;
    };

    if (!telegram_id || !wallet_address) {
        return res.status(400).json({ error: 'telegram_id and wallet_address are required' });
    }

    const walletKey = String(wallet_address).toLowerCase();

    const balRaw = await kvGet(`balance:${walletKey}`).catch(() => null);
    const balance = balRaw ? parseFloat(balRaw as string) : 0;

    if (balance < REQUIRED_BALANCE) {
        return res.status(402).json({
            error: `Insufficient GSTD balance. Need ${REQUIRED_BALANCE} GSTD, you have ${balance.toFixed(2)} GSTD.`,
            required: REQUIRED_BALANCE,
            available: balance,
        });
    }

    // Reuse existing key if one was already issued for this wallet
    const existingRaw = await kvGet(`free_api_key:${walletKey}`).catch(() => null);
    if (existingRaw) {
        const existing = JSON.parse(existingRaw as string) as FreeApiRecord;
        if (existing.active) {
            existing.last_used = Date.now();
            await kvSet(`free_api_key:${walletKey}`, JSON.stringify(existing));
            return res.status(200).json({
                api_key:          existing.api_key,
                wallet_address:    wallet_address,
                balance:           balance,
                required_balance:  REQUIRED_BALANCE,
                model:             'gstd-free-ultra-speed',
                endpoint:          'https://app.gstdtoken.com/api/v1/free-api/chat',
                already_issued:    true,
            });
        }
    }

    const apiKey = makeKey();
    const record: FreeApiRecord = {
        api_key:        apiKey,
        wallet_address: walletKey,
        telegram_id:    telegram_id,
        created_at:     Date.now(),
        last_used:      Date.now(),
        active:         true,
    };

    await kvSet(`free_api_key:${walletKey}`, JSON.stringify(record));

    return res.status(200).json({
        api_key:          apiKey,
        wallet_address:    wallet_address,
        balance:           balance,
        required_balance:  REQUIRED_BALANCE,
        model:             'gstd-free-ultra-speed',
        endpoint:          'https://app.gstdtoken.com/api/v1/free-api/chat',
        already_issued:    false,
    });
}
