/**
 * GET /api/v1/telegram/bot/nodes?telegram_id=<id>
 * Nodes registered under the wallet linked to this Telegram user, plus pending rewards.
 * Bot-token protected: it is how the Telegram bot shows "my node" to its owner.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys, kvMGet } from '../../../../../lib/kv';
import { isValidBotToken } from '../../../../../lib/botAuth';
import { isNodeOnline } from '../../../../../lib/node-status';
import type { NodeRecord } from '../../nodes/register';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    if (!isValidBotToken(req)) return res.status(401).json({ error: 'Invalid bot token' });

    const telegramId = String(req.query.telegram_id || '');
    if (!/^\d{1,15}$/.test(telegramId)) return res.status(400).json({ error: 'telegram_id required' });

    const wallet = await kvGet(`tg_wallet:${telegramId}`).catch(() => null);
    if (!wallet) return res.status(200).json({ linked: false, nodes: [], pending_gstd: 0 });

    const walletKey = wallet.toLowerCase();
    const keys = (await kvKeys('node:')).filter(k => !k.slice(5).includes(':'));
    const values = keys.length ? await kvMGet(keys) : [];
    const nodes = values
        .map(v => { try { return v ? (JSON.parse(v) as NodeRecord) : null; } catch { return null; } })
        .filter((n): n is NodeRecord => !!n && (n.wallet_address || '').toLowerCase() === walletKey)
        .map(n => ({
            node_id: n.node_id,
            name: n.name,
            version: n.version,
            online: isNodeOnline(n),
            last_seen: n.last_seen,
            tasks_completed: n.tasks_completed,
            gstd_earned: n.gstd_earned,
            capabilities: n.capabilities,
        }));

    const pendRaw = await kvGet(`rewards:pending:${walletKey}`).catch(() => null);
    return res.status(200).json({
        linked: true,
        wallet,
        nodes,
        pending_gstd: pendRaw ? parseFloat(pendRaw) || 0 : 0,
    });
}
