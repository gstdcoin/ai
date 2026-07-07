/**
 * GET /api/v1/rpc/chains
 * Supported blockchain networks for bridge/RPC.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');

    return res.status(200).json({
        chains: [
            { id: 'ton',      name: 'TON',      symbol: 'TON', status: 'live',    icon: '/icons/ton.svg'  },
            { id: 'ethereum', name: 'Ethereum', symbol: 'ETH', status: 'coming',  icon: '/icons/eth.svg'  },
            { id: 'solana',   name: 'Solana',   symbol: 'SOL', status: 'coming',  icon: '/icons/sol.svg'  },
            { id: 'xrpl',     name: 'XRPL',     symbol: 'XRP', status: 'coming',  icon: '/icons/xrp.svg'  },
        ],
        timestamp: Date.now(),
    });
}
