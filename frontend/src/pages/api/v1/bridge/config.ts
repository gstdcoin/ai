/**
 * GET /api/v1/bridge/config
 *
 * Returns current P2P bridge configuration.
 * Bridge supports: TON ↔ Solana, TON ↔ XRPL, PAXG ↔ GSTD.
 * All transfers verified by GSTD node network.
 *
 * Phase 1: static config. Phase 3: dynamic fee from on-chain state.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    return res.status(200).json({
        fee_percent:  1.0,
        min_amount:   10,
        max_amount:   100_000,
        chains: [
            {
                id:       'ton',
                name:     'TON',
                symbol:   'TON',
                active:   true,
                decimals: 9,
            },
            {
                id:       'solana',
                name:     'Solana',
                symbol:   'SOL',
                active:   true,
                decimals: 9,
            },
            {
                id:       'xrpl',
                name:     'XRPL',
                symbol:   'XRP',
                active:   true,
                decimals: 6,
            },
        ],
        pairs: [
            { from: 'ton',    to: 'solana', fee_percent: 1.0 },
            { from: 'solana', to: 'ton',    fee_percent: 1.0 },
            { from: 'ton',    to: 'xrpl',   fee_percent: 1.0 },
            { from: 'xrpl',   to: 'ton',    fee_percent: 1.0 },
            { from: 'ton',    to: 'paxg',   fee_percent: 0.5 },
            { from: 'paxg',   to: 'ton',    fee_percent: 0.5 },
        ],
        bridge_url:  'https://gstdtoken.com/bridge',
        status:      'operational',
        timestamp:   Date.now(),
    });
}
