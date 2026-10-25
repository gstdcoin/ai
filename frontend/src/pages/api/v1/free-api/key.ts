/**
 * POST /api/v1/free-api/key
 *
 * Issue a persistent free-tier API key to a wallet with 10,000+ GSTD.
 * The key is stored by wallet address and reused across calls (idempotent).
 * Key grants access to the GSTD node network with rate-limited inference.
 *
 * Auth: Verified TON wallet session or bot token with a linked telegram_id.
 * Body: { wallet_address?, telegram_id? } — wallet_address must match the authenticated wallet.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet } from '../../../../lib/kv';
import { sessionWallet } from '../../../../lib/walletSession';
import { isValidBotToken } from '../../../../lib/botAuth';
import { randomBytes } from 'crypto';

const REQUIRED_BALANCE = 10_000;
const FREE_API_PREFIX  = 'gstdf_';

function makeKey(): string {
    return FREE_API_PREFIX + randomBytes(24).toString('base64url');
}

interface FreeApiRecord {
    api_key:        string;
    wallet_address: string;
    created_at:     number;
    last_used:      number;
    active:         boolean;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { wallet_address, telegram_id } = (req.body || {}) as {
        wallet_address?: string;
        telegram_id?: string | number;
    };

    let walletKey = await sessionWallet(req.headers);
    if (!walletKey) {
        if (!isValidBotToken(req)) return res.status(401).json({ error: 'Verified wallet session or bot token required' });
        const userId = String(telegram_id || '');
        if (!/^\d{1,15}$/.test(userId)) return res.status(400).json({ error: 'Valid telegram_id required for bot requests' });
        try {
            const linkedWallet = await kvGet(`tg_wallet:${userId}`);
            if (!linkedWallet) return res.status(404).json({ error: 'No wallet linked to this Telegram account' });
            walletKey = String(linkedWallet).toLowerCase();
        } catch (err: any) {
            console.error('[free-api/key telegram]', err?.message || err);
            return res.status(500).json({ error: 'Could not resolve linked Telegram wallet' });
        }
    }
    if (wallet_address !== undefined) {
        if (typeof wallet_address !== 'string' || wallet_address.trim().toLowerCase() !== walletKey) {
            return res.status(403).json({ error: 'Wallet does not match the authenticated identity' });
        }
    }

    try {
        const balRaw = await kvGet(`balance:${walletKey}`);
        const balance = balRaw ? Number(balRaw) : 0;
        if (!Number.isFinite(balance) || balance < 0) throw new Error('Invalid stored wallet balance');

        if (balance < REQUIRED_BALANCE) {
            return res.status(402).json({
                error: `Insufficient GSTD balance. Need ${REQUIRED_BALANCE} GSTD, you have ${balance.toFixed(2)} GSTD.`,
                required: REQUIRED_BALANCE,
                available: balance,
            });
        }

        // Reuse an existing key only when its stored owner matches the session wallet.
        const existingRaw = await kvGet(`free_api_key:${walletKey}`);
        if (existingRaw) {
            const existing = JSON.parse(existingRaw) as FreeApiRecord;
            if (existing.wallet_address !== walletKey || typeof existing.api_key !== 'string') {
                throw new Error('Invalid stored free API key record');
            }
            if (existing.active) {
                existing.last_used = Date.now();
                await kvSet(`free_api_key:${walletKey}`, JSON.stringify(existing));
                return res.status(200).json({
                    api_key:          existing.api_key,
                    wallet_address:    walletKey,
                    balance,
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
            created_at:     Date.now(),
            last_used:      Date.now(),
            active:         true,
        };

        await kvSet(`free_api_key:${walletKey}`, JSON.stringify(record));

        return res.status(200).json({
            api_key:          apiKey,
            wallet_address:    walletKey,
            balance,
            required_balance:  REQUIRED_BALANCE,
            model:             'gstd-free-ultra-speed',
            endpoint:          'https://app.gstdtoken.com/api/v1/free-api/chat',
            already_issued:    false,
        });
    } catch (err: any) {
        console.error('[free-api/key]', err?.message || err);
        return res.status(500).json({ error: 'Could not issue free API key' });
    }
}
