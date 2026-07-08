/**
 * POST /api/v1/oracle/evaluate
 *
 * GSTD AI Oracle — evaluate a trading signal through the distributed node network.
 * Returns ENTER / SKIP verdict + confidence + reason.
 *
 * Free tier:  10 requests/day per IP (no auth required)
 * Enterprise: Authorization: Bearer gstd_xxx  (unlimited within plan)
 *
 * Request body:
 *   { symbol, side, strength?, rsi?, btc_trend?, ml_score?, funding_rate?,
 *     atr_pct?, flow_confidence?, timeframe? }
 *
 * Response:
 *   { enter: bool, confidence: float, reason: string,
 *     source: string, model: string, latency_ms: int }
 */
export const config = { maxDuration: 115 };

import type { NextApiRequest, NextApiResponse } from 'next';
import { rateLimit, getClientIp } from '../../../../lib/ratelimit';
import { kvGet, kvSet, kvKeys, kvMGet, kvIncr, kvIncrByFloat } from '../../../../lib/kv';
import { validateEnterpriseKey } from '../enterprise/keys';
import { accrueReward, BASE_TASK_FEE } from '../../../../lib/rewards';

const NODE_MAX_AGE_MS = 600_000;

interface NodeRecord {
    node_url?: string;
    multiaddrs?: string[];
    last_seen?: string;
    tasks_completed?: number;
}

async function getNodeUrl(): Promise<string> {
    const envUrl = (process.env.GSTD_NODE_URL || '').replace(/\/$/, '');
    if (envUrl) return envUrl;

    try {
        const nodeKeys = (await kvKeys('node:')).filter((k: string) => !k.slice(5).includes(':'));
        if (nodeKeys.length > 0) {
            const values = await kvMGet(nodeKeys);
            const now = Date.now();
            const alive: Array<{ url: string; tasks: number }> = [];
            for (const raw of values) {
                if (!raw) continue;
                const node: NodeRecord = JSON.parse(raw as string);
                const url = (node.node_url || node.multiaddrs?.[0] || '').replace(/\/$/, '');
                if (!url.startsWith('http')) continue;
                const age = now - new Date(node.last_seen || 0).getTime();
                if (age > NODE_MAX_AGE_MS) continue;
                alive.push({ url, tasks: node.tasks_completed ?? 0 });
            }
            if (alive.length > 0) {
                alive.sort((a, b) => a.tasks - b.tasks);
                return alive[0].url;
            }
        }
    } catch { /* KV unavailable */ }

    // GitHub fallback (tunnel URL published by gstdbot)
    try {
        const r = await fetch(
            `https://raw.githubusercontent.com/gstdcoin/ai/main/node-url.txt?t=${Math.floor(Date.now() / 30000)}`,
            { signal: AbortSignal.timeout(4000) }
        );
        if (r.ok) {
            const url = (await r.text()).trim();
            if (url.startsWith('http')) return url.replace(/\/$/, '');
        }
    } catch { /* ignored */ }
    return '';
}

function buildPrompt(body: Record<string, unknown>) {
    const sym  = String(body.symbol  || '?');
    const side = String(body.side    || 'LONG').toUpperCase();
    const tf   = String(body.timeframe || '15m');
    const str_ = Number(body.strength       ?? 0);
    const atr  = Number(body.atr_pct        ?? 0);
    const rsi  = Number(body.rsi            ?? 50);
    const btc  = String(body.btc_trend      ?? 'N')[0].toUpperCase();
    const conf = Number(body.flow_confidence ?? 50);
    const ml   = Number(body.ml_score       ?? 0.5);
    const cvd  = Number(body.cvd_pct        ?? 0);
    const fund = Number(body.funding_rate   ?? 0);

    return [
        { role: 'system', content: 'You are a crypto trade filter. Reply ENTER or SKIP then one short reason.' },
        { role: 'user',   content:
            `Signal: ${sym} ${side} ${tf} str=${str_.toFixed(1)} ` +
            `ATR=${atr.toFixed(1)}% RSI=${rsi.toFixed(0)} BTC=${btc} ` +
            `flow=${conf} ML=${ml.toFixed(2)} CVD=${cvd > 0 ? '+' : ''}${cvd.toFixed(1)}% fund=${fund.toFixed(4)}. ` +
            `ENTER or SKIP?`
        },
    ];
}

function parseDecision(text: string): { enter: boolean; confidence: number; reason: string } {
    const up = text.toUpperCase();
    const firstLine = (text.split('\n')[0] || '').toUpperCase();
    let enter = firstLine.includes('ENTER');
    let skip  = firstLine.includes('SKIP');
    if (!enter && !skip) {
        enter = up.includes('ENTER') || up.includes('BUY') || up.includes('LONG');
        skip  = up.includes('SKIP')  || up.includes('AVOID');
    }
    const base = enter && !skip ? 0.70 : 0.25;
    const strongWords = (text.match(/\b(strong|clear|good|excellent|solid|perfect|ideal)\b/gi) || []).length;
    const weakWords   = (text.match(/\b(weak|poor|risky|uncertain|choppy|low|bad|marginal)\b/gi) || []).length;
    const confidence  = Math.max(0.1, Math.min(0.95, base + (strongWords - weakWords) * 0.04));

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let reason = '';
    for (const line of lines.slice(1)) {
        if (line.length > 10 && !line.toUpperCase().startsWith('ENTER') && !line.toUpperCase().startsWith('SKIP')) {
            reason = line.slice(0, 200);
            break;
        }
    }
    if (!reason && lines[0]) reason = lines[0].slice(0, 200);

    return { enter: !!(enter && !skip), confidence: Math.round(confidence * 1000) / 1000, reason };
}

const NODE_TTL = 600;

async function recordOracleTask(nodeUrl: string, taskId: string): Promise<void> {
    // Increment global task counter
    await kvIncr('stats:total_tasks_completed');
    // Find node by URL and credit it
    const nodeKeys = (await kvKeys('node:')).filter((k: string) => !k.slice(5).includes(':'));
    if (!nodeKeys.length) return;
    const values = await kvMGet(nodeKeys);
    for (let i = 0; i < values.length; i++) {
        const raw = values[i];
        if (!raw) continue;
        let node: any;
        try { node = JSON.parse(raw as string); } catch { continue; }
        const url = (node.node_url || node.multiaddrs?.[0] || '').replace(/\/$/, '');
        if (url !== nodeUrl) continue;
        node.tasks_completed = (node.tasks_completed || 0) + 1;
        node.last_seen = new Date().toISOString();
        await kvSet(nodeKeys[i], JSON.stringify(node), NODE_TTL);
        if (node.wallet_address) {
            accrueReward(node.node_id, node.wallet_address, BASE_TASK_FEE, taskId).catch(() => {});
        }
        break;
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const ip = getClientIp(req.headers as any);

    // Auth: enterprise key OR free tier (10/day per IP)
    const authHeader = String(req.headers['authorization'] || '');
    const bearerMatch = authHeader.match(/^Bearer (gstd_\S+)$/);

    if (bearerMatch) {
        const key = await validateEnterpriseKey(bearerMatch[1]);
        if (!key) return res.status(401).json({ error: 'Invalid or expired enterprise API key' });
        if (!rateLimit(`oracle_ent:${key.id}`, key.rpm_limit, 60_000))
            return res.status(429).json({ error: `Rate limit: ${key.rpm_limit} rpm` });
    } else {
        // Free tier: 10 requests per day per IP
        const dayKey = `oracle_free:${ip}:${new Date().toISOString().slice(0, 10)}`;
        const used = parseInt((await kvGet(dayKey)) || '0', 10);
        if (used >= 10) {
            return res.status(429).json({
                error: 'Free tier: 10 oracle requests/day per IP. Get an API key for unlimited access.',
                upgrade: 'POST /api/v1/enterprise/keys',
                used, limit: 10,
            });
        }
        await kvIncrByFloat(dayKey, 1);
    }

    const body: Record<string, unknown> = req.body || {};
    if (!body.symbol || !body.side) {
        return res.status(400).json({ error: 'Required: symbol, side' });
    }

    const nodeUrl = await getNodeUrl();
    if (!nodeUrl) {
        return res.status(503).json({
            error: 'No GSTD nodes online. Network is starting up — try again in 60s.',
            nodes_online: 0,
        });
    }

    const messages = buildPrompt(body);
    const t0 = Date.now();

    try {
        const nodeRes = await fetch(`${nodeUrl}/api/v1/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, model: 'llama3.2:3b' }),
            signal: AbortSignal.timeout(110_000),
        });

        if (!nodeRes.ok) {
            const txt = await nodeRes.text().catch(() => '');
            return res.status(502).json({ error: `Node error ${nodeRes.status}`, detail: txt.slice(0, 200) });
        }

        const data = await nodeRes.json();
        const latency_ms = Date.now() - t0;
        const text   = data?.choices?.[0]?.message?.content || '';
        const gstd   = data?._gstd || {};
        const { enter, confidence, reason } = parseDecision(text);
        const source = `gstd:${gstd.tier || 'node'}`;
        const model  = data?.model || 'llama3.2:3b';

        // Record task completion before returning (Vercel serverless kills context after send)
        const taskId = `oracle:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
        await recordOracleTask(nodeUrl, taskId).catch(() => {});

        return res.status(200).json({
            enter, confidence, reason,
            source, model, latency_ms,
            node: nodeUrl.replace(/https?:\/\//, '').split('.')[0] + '...',
            _raw: text.slice(0, 300),
        });

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('abort') || msg.includes('timeout')) {
            return res.status(504).json({ error: 'Node timeout (>110s). Network congested — try again.' });
        }
        return res.status(502).json({ error: 'Node unreachable', detail: msg.slice(0, 200) });
    }
}
