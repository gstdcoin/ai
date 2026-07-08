/**
 * GET /api/cron/refresh-stats
 *
 * Vercel cron job — refreshes oracle stats cache and keeps
 * stats:total_tasks_completed in sync with gstdbot's oracle log.
 * Runs every 5 minutes via vercel.json crons config.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvKeys, kvMGet } from '../../../lib/kv';

async function findNodeUrl(): Promise<string> {
    if (process.env.GSTD_NODE_URL) return process.env.GSTD_NODE_URL;
    // KV registry (most reliable — updated by every heartbeat)
    try {
        const keys = (await kvKeys('node:')).filter((k: string) => !k.slice(5).includes(':'));
        if (keys.length > 0) {
            const vals = await kvMGet(keys);
            const now = Date.now();
            for (const raw of vals) {
                if (!raw) continue;
                const n: any = JSON.parse(raw as string);
                const url = (n.node_url || n.multiaddrs?.[0] || '').replace(/\/$/, '');
                if (!url.startsWith('http')) continue;
                if (now - new Date(n.last_seen || 0).getTime() > 600_000) continue;
                return url;
            }
        }
    } catch { /* ignore */ }
    // Fallback: GitHub-published file
    return fetch(`https://raw.githubusercontent.com/gstdcoin/ai/main/node-url.txt?t=${Math.floor(Date.now() / 30000)}`, {
        signal: AbortSignal.timeout(4000),
    }).then(r => r.ok ? r.text().then(t => t.trim()) : '').catch(() => '');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Only allow cron invocations (Vercel sets this header automatically)
    if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}` &&
        req.method !== 'GET') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const nodeUrl = await findNodeUrl();

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
            const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
            const records = values.filter((v): v is string => v !== null).map(v => { try { return JSON.parse(v); } catch { return null; } }).filter(Boolean) as any[];

            // Normalize stats:total_registered to deduplicated node count
            records.sort((a, b) => (UUID_RE.test(a.node_id) ? 1 : 0) - (UUID_RE.test(b.node_id) ? 1 : 0));
            const seen = new Set<string>();
            const deduped = records.filter(n => {
                const url = n.node_url || n.multiaddrs?.[0] || '';
                if (!url) return true;
                if (seen.has(url)) return false;
                seen.add(url); return true;
            });
            const stored = parseInt((await kvGet('stats:total_registered').catch(() => '0')) as string || '0', 10);
            if (stored !== deduped.length) {
                await kvSet('stats:total_registered', String(deduped.length)).catch(() => {});
            }

            for (const node of records) {
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

        return res.status(200).json({ ok: true, tasks: live?.total, nodes: nodeKeys.length, ts: Date.now() });
    } catch (err: any) {
        return res.status(200).json({ ok: false, error: err.message });
    }
}
