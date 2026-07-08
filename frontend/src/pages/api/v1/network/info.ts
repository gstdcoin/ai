/**
 * GET /api/v1/network/info
 *
 * Machine-readable network manifest — self-describing, no hardcoded external URLs.
 * All endpoints are relative to this deployment so the manifest is always accurate
 * regardless of where the frontend is hosted.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvKeys } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const proto  = req.headers['x-forwarded-proto'] || 'https';
    const host   = req.headers.host || 'app.gstdtoken.com';
    const origin = process.env.NEXT_PUBLIC_API_URL || `${proto}://${host}`;

    const [allNodeKeys, campaignKeys] = await Promise.all([
        kvKeys('node:'),
        kvKeys('campaign:'),
    ]);
    const nodeKeys = allNodeKeys.filter((k: string) => !k.slice(5).includes(':'));

    // Fallback node count from GitHub registry when KV is empty (no Redis configured)
    let activeNodes = nodeKeys.length;
    if (activeNodes === 0) {
        try {
            const ghResp = await fetch(
                'https://raw.githubusercontent.com/gstdcoin/ai/main/nodes-registry.json',
                { signal: AbortSignal.timeout(3000), cache: 'no-store' }
            );
            if (ghResp.ok) {
                const registry: any[] = await ghResp.json();
                activeNodes = registry.length;
            }
        } catch { /* GitHub unavailable */ }
    }

    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');

    return res.status(200).json({
        network: 'GSTD Decentralized AI Network',
        version: '3.4',
        chain:   'TON',
        token: {
            symbol:   'GSTD',
            contract: process.env.GSTD_JETTON_ADDRESS || 'EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO',
            decimals: 9,
            use:      'Pay for AI inference and fine-tuning; node operators earn 90% of every fee',
        },
        nodes: {
            online:   activeNodes,
            endpoint: `${origin}/api/v1/nodes/list`,
            peers:    `${origin}/api/v1/nodes/peers`,
        },
        inference: {
            endpoint:      `${origin}/api/v1/chat/completions`,
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
            resources_endpoint: `${origin}/api/v1/marketplace/resources`,
            campaigns_endpoint: `${origin}/api/v1/campaigns/list`,
            active_campaigns:   campaignKeys.length,
            task_types:         ['inference', 'storage', 'compute', 'relay'],
        },
        treasury: {
            endpoint:       `${origin}/api/v1/treasury/status`,
            protocol_fee:   '10% of all campaign tasks',
            distribution:   '90% → Node Operators | 10% → Protocol Treasury (buybacks + liquidity)',
            threshold_gstd: 10,
        },
        install_node: 'curl -fsSL https://raw.githubusercontent.com/gstdcoin/gstdbot/main/install.sh | bash',
        docs:         origin,
        github:       'https://github.com/gstdcoin',
        timestamp:    Date.now(),
    });
}
