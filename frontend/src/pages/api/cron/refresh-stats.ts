/**
 * GET /api/cron/refresh-stats
 *
 * Vercel cron job — refreshes oracle stats cache and keeps
 * stats:total_tasks_completed in sync with gstdbot's oracle log.
 * Runs every 5 minutes via vercel.json crons config.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvKeys, kvMGet } from '../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Only allow cron invocations (Vercel sets this header automatically)
    if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}` &&
        req.method !== 'GET') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const nodeUrl = process.env.GSTD_NODE_URL ||
            await fetch(`https://raw.githubusercontent.com/gstdcoin/ai/main/node-url.txt?t=${Math.floor(Date.now() / 30000)}`, {
                signal: AbortSignal.timeout(4000),
            }).then(r => r.ok ? r.text().then(t => t.trim()) : '').catch(() => '');

        if (!nodeUrl?.startsWith('http')) {
            return res.status(200).json({ ok: true, skipped: 'no node url', ts: Date.now() });
        }

        const statsRes = await fetch(`${nodeUrl}/api/oracle/stats`, {
            signal: AbortSignal.timeout(15000),
        });
        if (!statsRes.ok) {
            return res.status(200).json({ ok: true, skipped: `node returned ${statsRes.status}`, ts: Date.now() });
        }

        const live: any = await statsRes.json();

        await kvSet('oracle:stats:cache', JSON.stringify({ ...live, _cached_at: Date.now() }), 1800);

        if (live?.total > 0) {
            const stored = parseInt((await kvGet('stats:total_tasks_completed').catch(() => '0')) as string || '0', 10);
            if (stored < live.total) {
                await kvSet('stats:total_tasks_completed', String(live.total)).catch(() => {});
            }
        }

        // Backfill rewards:pending for nodes whose gstd_earned > 0 but pending balance is 0
        // (happens when tasks ran before wallet_address was set in the KV record)
        const nodeKeys = (await kvKeys('node:').catch(() => [] as string[])).filter((k: string) => !k.slice(5).includes(':'));
        if (nodeKeys.length > 0) {
            const values = await kvMGet(nodeKeys).catch(() => [] as (string | null)[]);
            for (const raw of values) {
                if (!raw) continue;
                let node: any;
                try { node = JSON.parse(raw as string); } catch { continue; }
                const wallet = node.wallet_address;
                const earned = parseFloat(node.gstd_earned || '0');
                if (!wallet || earned <= 0) continue;
                const walletKey = `rewards:pending:${wallet.toLowerCase()}`;
                const pending = parseFloat((await kvGet(walletKey).catch(() => null) as string | null) || '0');
                if (pending < earned * 0.9) {
                    await kvSet(walletKey, String(Math.round(earned * 1e6) / 1e6)).catch(() => {});
                }
            }
        }

        return res.status(200).json({ ok: true, tasks: live?.total, ts: Date.now() });
    } catch (err: any) {
        return res.status(200).json({ ok: false, error: err.message });
    }
}
