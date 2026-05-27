/**
 * GET /api/v1/ecosystem/features
 * Which optional subsystems are active in this deployment.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');

    const [nodeCountRaw, telegramRaw] = await Promise.all([
        kvGet('stats:online_nodes').catch(() => null),
        kvGet('stats:telegram_active').catch(() => null),
    ]);

    const onlineNodes = nodeCountRaw ? parseInt(nodeCountRaw as string) : 0;

    return res.status(200).json({
        telegram_bot:   telegramRaw === 'true' || !!process.env.TELEGRAM_BOT_TOKEN,
        redis:          true,
        node_network:   onlineNodes > 0,
        loans_active:   true,
        enterprise_api: !!process.env.ENTERPRISE_MASTER_KEY,
        timestamp:      Date.now(),
    });
}
