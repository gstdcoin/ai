/**
 * GET /api/v1/network/info
 *
 * Machine-readable network manifest for AI agents, wallets, and integrators.
 * Describes everything needed to interact with the GSTD network:
 * - Available AI models and pricing
 * - Active node count and total capacity
 * - GSTD token contract address
 * - API endpoints
 * - How to authenticate (wallet address)
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvKeys, kvGet } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const [nodeKeys, campaignKeys, queueDepthStr] = await Promise.all([
        kvKeys('node:'),
        kvKeys('campaign:'),
        kvGet('tasks:queue').then(() => '0').catch(() => '0'),
    ]);

    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');

    return res.status(200).json({
        network: 'GSTD Decentralized AI Network',
        version: '3.4',
        chain:   'TON',
        token: {
            symbol:   'GSTD',
            contract: process.env.GSTD_JETTON_ADDRESS || 'EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO',
            decimals: 9,
            use:      'Pay for inference, stake for rewards, vote in DAO',
        },
        nodes: {
            online:   nodeKeys.length,
            endpoint: 'https://app.gstdtoken.com/api/v1/nodes/list',
        },
        inference: {
            endpoint:      'https://app.gstdtoken.com/api/v1/chat/completions',
            openai_compat:  true,
            cost_per_req:  '0.001 GSTD',
            models: [
                'llama-3.3-70b-versatile',
                'llama-3.1-8b-instant',
                'meta-llama/llama-4-scout-17b-16e-instruct',
                'qwen/qwen3-32b',
                'moonshotai/kimi-k2-instruct',
                'mixtral-8x7b-32768',
                'gemma2-9b-it',
            ],
            note: 'OpenAI-compatible. Pass wallet address in X-Wallet-Address header to track GSTD usage.',
        },
        marketplace: {
            resources_endpoint: 'https://app.gstdtoken.com/api/v1/marketplace/resources',
            campaigns_endpoint: 'https://app.gstdtoken.com/api/v1/campaigns/list',
            active_campaigns:   campaignKeys.length,
            task_types:         ['inference', 'storage', 'compute', 'relay'],
        },
        treasury: {
            endpoint:       'https://app.gstdtoken.com/api/v1/treasury/status',
            protocol_fee:   '10% of all campaign tasks',
            distribution:   '50% → Ston.fi LP | 30% → Gold reserve | 20% → Node bonuses',
            threshold_gstd: 10,
        },
        install_node: 'curl -fsSL https://raw.githubusercontent.com/gstdcoin/gstdbot/main/install.sh | bash',
        docs:         'https://app.gstdtoken.com',
        github:       'https://github.com/gstdcoin',
        timestamp:    Date.now(),
    });
}
