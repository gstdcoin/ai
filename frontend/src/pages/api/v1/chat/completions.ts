/**
 * POST /api/v1/chat/completions
 *
 * OpenAI-compatible inference endpoint backed by the GSTD node network.
 *
 * Routing:
 *   1. Find best available GSTD node for the requested model
 *      - Score by: model match, low load, low latency, high uptime
 *      - Push task to node-specific priority queue
 *      - Short-poll for result (max 55s — Vercel Pro allows 60s max)
 *   2. If no node available or timeout: return informative error
 *      (grow the network at github.com/gstdcoin/gstdbot)
 *
 * Cost: 0.001 GSTD per inference (tracked, burned)
 *
 * Body: { model?, messages, stream?, max_tokens?, temperature?, gstd_wallet? }
 * Response: OpenAI-compatible choices array + _gstd routing metadata
 */
export const config = { maxDuration: 60 };  // Vercel: allow up to 60s for this route

import type { NextApiRequest, NextApiResponse } from 'next';
import { kvKeys, kvMGet, kvPush, kvGet, kvIncr } from '../../../../lib/kv';
import { rateLimit, getClientIp } from '../../../../lib/ratelimit';
import { randomBytes } from 'crypto';

// Model aliases — map common names to canonical IDs
const MODEL_ALIASES: Record<string, string> = {
    'gpt-4':                                       'llama-3.3-70b-versatile',
    'gpt-4o':                                      'llama-3.3-70b-versatile',
    'gpt-4-turbo':                                 'llama-3.3-70b-versatile',
    'gpt-3.5-turbo':                               'llama-3.1-8b-instant',
    'auto':                                        'llama-3.3-70b-versatile',
    'llama-3.3-70b-versatile':                     'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant':                        'llama-3.1-8b-instant',
    'meta-llama/llama-4-scout-17b-16e-instruct':   'meta-llama/llama-4-scout-17b-16e-instruct',
    'qwen/qwen3-32b':                              'qwen/qwen3-32b',
    'moonshotai/kimi-k2-instruct':                 'moonshotai/kimi-k2-instruct',
    'openai/gpt-oss-120b':                         'openai/gpt-oss-120b',
    'openai/gpt-oss-20b':                          'openai/gpt-oss-20b',
    'mixtral-8x7b-32768':                          'mixtral-8x7b-32768',
    'gemma2-9b-it':                                'gemma2-9b-it',
    // Ollama model IDs (pass through unchanged)
    'llama3.2:3b':                                 'llama3.2:3b',
    'llama3.2:1b':                                 'llama3.2:1b',
    'llama3.1:8b':                                 'llama3.1:8b',
    'mistral:7b':                                  'mistral:7b',
    'phi3:mini':                                   'phi3:mini',
    'gemma2:2b':                                   'gemma2:2b',
};
const DEFAULT_MODEL  = 'llama-3.3-70b-versatile';
const GSTD_COST      = 0.001;
const ROUTE_TIMEOUT  = 55_000;  // Pi 4 cold-start can take ~16s; 55s gives comfortable margin
const POLL_INTERVAL  = 1_500;
const NODE_TTL_GRACE = 10 * 60_000;

// ─── Node scoring ─────────────────────────────────────────────────────────
interface NodeScore { node_id: string; score: number; }

function scoreNode(node: any, loadPenalty: number, exactMatch: boolean, now: number): number {
    const latencyBonus = node.avg_latency_ms ? Math.max(0, 2000 - node.avg_latency_ms) : 500;
    const uptimeBonus  = Math.min((node.tasks_completed || 0) * 2, 200);
    const matchBonus   = exactMatch ? 2000 : 0;
    // Prefer freshest heartbeat — nodes seen within 30s score +500, within 2min +200
    const ageSec = (now - new Date(node.last_seen).getTime()) / 1000;
    const freshnessBonus = ageSec < 30 ? 500 : ageSec < 120 ? 200 : 0;
    return 1000 + matchBonus + latencyBonus + uptimeBonus + freshnessBonus - loadPenalty;
}

async function findBestNode(model: string): Promise<NodeScore | null> {
    const keys = await kvKeys('node:');
    if (!keys.length) return null;

    const raws = await kvMGet(keys);
    const now  = Date.now();
    const nodes: NodeScore[] = [];

    for (const raw of raws) {
        if (!raw) continue;
        try {
            const node = JSON.parse(raw);
            if (new Date(node.last_seen).getTime() < now - NODE_TTL_GRACE) continue;

            const caps: string[] = node.capabilities || [];
            if (!caps.length) continue;

            const loadPenalty = (node.tasks_processing || 0) * 200;

            // Exact model match (also accepts short name like 'llama3.2:3b' for 'llama-3.2-3b')
            const exactMatch =
                caps.includes(model) ||
                caps.includes(model.split('/').pop() || model) ||
                caps.some(c => c.replace(/[^a-z0-9]/gi, '').toLowerCase()
                    === model.replace(/[^a-z0-9]/gi, '').toLowerCase());

            // Fallback: any node with AI inference capability (has at least 1 model)
            const hasAI = caps.length > 0;
            if (!exactMatch && !hasAI) continue;

            nodes.push({ node_id: node.node_id, score: scoreNode(node, loadPenalty, exactMatch, now) });
        } catch { /* skip malformed */ }
    }

    if (!nodes.length) return null;
    nodes.sort((a, b) => b.score - a.score);
    return nodes[0];
}

// ─── Wait for node result ─────────────────────────────────────────────────
async function waitForResult(taskId: string, timeoutMs: number): Promise<any | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const raw = await kvGet(`task:result:${taskId}`);
        if (raw) {
            const r = JSON.parse(raw);
            if (r.ready) return r;
        }
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
    }
    return null;
}

// ─── Handler ──────────────────────────────────────────────────────────────
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Rate limit: 30 req/min per IP
    const ip = getClientIp(req.headers as any);
    if (!rateLimit(`chat:${ip}`, 30, 60_000)) {
        return res.status(429).json({ error: 'Rate limit exceeded. 30 requests/minute per IP.' });
    }

    const { messages, model, max_tokens, temperature } = req.body || {};

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages array required' });
    }
    if (messages.length > 100) {
        return res.status(400).json({ error: 'Too many messages (max 100)' });
    }

    const resolvedModel = MODEL_ALIASES[model] || DEFAULT_MODEL;
    const maxTok        = Math.min(parseInt(max_tokens) || 2048, 8192);
    const temp          = Math.min(Math.max(parseFloat(temperature) ?? 0.7, 0), 2);
    const taskId        = randomBytes(8).toString('hex');

    // ── Find best node ────────────────────────────────────────────
    const bestNode = await findBestNode(resolvedModel).catch(() => null);

    if (!bestNode) {
        return res.status(503).json({
            id: `chatcmpl-${taskId}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: resolvedModel,
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: '🐝 GSTD Network: No nodes available for this model yet. The network is growing — run a node to serve inference: https://github.com/gstdcoin/gstdbot',
                },
                finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            _gstd: { routed_via_node: false, error: 'no_nodes_available', model: resolvedModel },
        });
    }

    // ── Push to node priority queue ───────────────────────────────
    const task = {
        task_id:     taskId,
        type:        'inference',
        model:       resolvedModel,
        prompt:      messages[messages.length - 1]?.content || '',
        messages,
        max_tokens:  maxTok,
        temperature: temp,
        reward_gstd: GSTD_COST * 0.9,
        node_hint:   bestNode.node_id,
        created_at:  new Date().toISOString(),
    };
    await kvPush(`tasks:inference:${bestNode.node_id}`, JSON.stringify(task));

    // ── Short-poll for result ─────────────────────────────────────
    const nodeResult = await waitForResult(taskId, ROUTE_TIMEOUT);

    if (nodeResult?.result) {
        const content = nodeResult.result.response || nodeResult.result.choices?.[0]?.message?.content || '';
        await kvIncr('stats:total_tasks_completed');

        return res.status(200).json({
            id:      `chatcmpl-${taskId}`,
            object:  'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model:   resolvedModel,
            choices: [{
                index:   0,
                message: { role: 'assistant', content },
                finish_reason: 'stop',
            }],
            usage: nodeResult.result.tokens
                ? { prompt_tokens: 0, completion_tokens: nodeResult.result.tokens, total_tokens: nodeResult.result.tokens }
                : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            _gstd: {
                routed_via_node: true,
                node_id:         bestNode.node_id,
                latency_ms:      nodeResult.latency_ms,
                cost_gstd:       GSTD_COST,
            },
        });
    }

    // ── Node timeout ──────────────────────────────────────────────
    return res.status(503).json({
        id: `chatcmpl-${taskId}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: resolvedModel,
        choices: [{
            index: 0,
            message: {
                role: 'assistant',
                content: '⏱️ GSTD Network: The assigned node did not respond in time. Please retry — another node will be selected automatically.',
            },
            finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        _gstd: {
            routed_via_node: false,
            node_id:         bestNode.node_id,
            error:           'node_timeout',
            cost_gstd:       0,
        },
    });
}
