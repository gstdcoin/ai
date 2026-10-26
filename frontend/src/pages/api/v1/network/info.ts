/**
 * GET /api/v1/network/info
 *
 * Machine-readable network manifest — self-describing, no hardcoded external URLs.
 * All endpoints are relative to this deployment so the manifest is always accurate
 * regardless of where the frontend is hosted.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvKeys, kvMGet } from '../../../../lib/kv';
import { dedupeNodeRecords, parseNodeRecords, isNodeOnline } from '../../../../lib/node-status';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const origin = process.env.NEXT_PUBLIC_API_URL || 'https://app.gstdtoken.com';

    const [allNodeKeys, campaignKeys] = await Promise.all([
        kvKeys('node:'),
        kvKeys('campaign:'),
    ]);
    const nodeKeys = allNodeKeys.filter((k: string) => !k.slice(5).includes(':'));

    const records=dedupeNodeRecords(parseNodeRecords(await kvMGet(nodeKeys)));
    const activeNodes=records.filter(node=>isNodeOnline(node)).length;

    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');

    return res.status(200).json({
        network: 'GSTD Decentralized AI Network',
        version: '3.6',
        chain:   'TON',
        token: {
            symbol:   'GSTD',
            contract: process.env.GSTD_JETTON_ADDRESS || 'EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO',
            decimals: 9,
            use:      'Fine-tuning is paused pending worker sandboxing; eligible node task rewards are tracked by the platform',
        },
        nodes: {
            online:   activeNodes,
            endpoint: `${origin}/api/v1/nodes/list`,
            peers:    `${origin}/api/v1/nodes/peers`,
        },
        inference: {
            endpoint:      `${origin}/api/v1/chat/completions`,
            openai_compat:  true,
            cost_per_req:  'Model-specific; check /api/v1/models/available before a request',
            models_endpoint: `${origin}/api/v1/models/available`,
            note: 'OpenAI-compatible. Use an enterprise API key or a verified TON wallet session (X-Session-Token) for wallet billing.',
        },
        marketplace: {
            resources_endpoint: `${origin}/api/v1/marketplace/resources`,
            campaigns_endpoint: `${origin}/api/v1/campaigns/list`,
            active_campaigns:   campaignKeys.length,
            task_types:         ['inference'],
        },
        treasury: {
            endpoint:       `${origin}/api/v1/treasury/status`,
            protocol_fee:   '10% of accepted paid work',
            distribution:   '85% executor | 10% protocol | 5% reserve; no automatic buybacks',
            automatic_distribution_enabled: false,
        },
        install_node: 'curl -fsSL https://raw.githubusercontent.com/gstdcoin/gstdbot/main/install.sh | bash',
        docs:         origin,
        github:       'https://github.com/gstdcoin',
        timestamp:    Date.now(),
    });
}
