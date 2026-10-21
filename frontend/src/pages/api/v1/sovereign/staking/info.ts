/**
 * GET /api/v1/sovereign/staking/info
 * Staking info — staking is discontinued (on-chain contract not deployed).
 * Returns current status so UI can show accurate state.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../../lib/kv';
import { sessionWallet } from '../../../../../lib/walletSession';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const requestedWallet = req.query.wallet;
    let wallet: string | null = null;
    if (requestedWallet === undefined) {
        res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    } else {
        if (typeof requestedWallet !== 'string' || !requestedWallet.trim()) {
            return res.status(400).json({ error: 'wallet query param must be a single address' });
        }
        const authenticatedWallet = await sessionWallet(req.headers);
        if (!authenticatedWallet) return res.status(401).json({ error: 'Verified wallet session required' });
        if (requestedWallet.trim().toLowerCase() !== authenticatedWallet) {
            return res.status(403).json({ error: 'Wallet does not match the authenticated session' });
        }
        wallet = authenticatedWallet;
        res.setHeader('Cache-Control', 'private, no-store');
    }

    const base = {
        status:           'discontinued',
        contracts_live:   false,
        apy:              0,
        apy_pct:          0,
        min_stake:        0,
        note:             'On-chain staking contract has not been deployed. Earn GSTD by running a node instead.',
        alternative:      'Run a node and earn GSTD from AI inference: app.gstdtoken.com/api/v1/nodes',
        timestamp:        Date.now(),
    };

    if (!wallet) return res.status(200).json(base);

    try {
        const stakedRaw = await kvGet(`staked:${wallet}`);
        const walletStaked = stakedRaw ? Number(stakedRaw) : 0;
        if (!Number.isFinite(walletStaked) || walletStaked < 0) throw new Error('Invalid stored stake balance');
        return res.status(200).json({
            ...base,
            wallet,
            wallet_staked:   walletStaked,
            pending_rewards: 0,
        });
    } catch (err: any) {
        console.error('[sovereign/staking/info]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
