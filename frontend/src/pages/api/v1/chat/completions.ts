/**
 * POST /api/v1/chat/completions
 *
 * OpenAI-compatible endpoint with SMART DISTRIBUTED ROUTING.
 *
 * Routing strategy (in priority order):
 *   1. Find best available GSTD node for the requested model
 *      - Score by: model match, low load, low latency, high uptime
 *      - Push to priority inference queue, short-poll for result (max 20s)
 *   2. Fall back to Groq API (fast, centralized)
 *   3. Fall back to degraded response if no key
 *
 * GSTD cost: 0.001 GSTD per inference request (tracked, burned)
 *
 * Body: { model?, messages, stream?, max_tokens?, temperature?, gstd_wallet? }
 * Response: OpenAI-compatible choices array + routing metadata
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvKeys, kvMGet, kvPush, kvGet, kvIncr } from '../../../../lib/kv';
import { rateLimit, getClientIp } from '../../../../lib/ratelimit';
import { randomBytes } from 'crypto';

// Model aliases — map OpenAI names to Groq equivalents
const MODEL_ALIASES: Record<string, string> = {
    'gpt-4':                              'llama-3.3-70b-versatile',
    'gpt-4o':                             'llama-3.3-70b-versatile',
    'gpt-4-turbo':                        'llama-3.3-70b-versatile',
    'gpt-3.5-turbo':                      'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile':            'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant':               'llama-3.1-8b-instant',
    'meta-llama/llama-4-scout-17b-16e-instruct': 'meta-llama/llama-4-scout-17b-16e-instruct',
    'qwen/qwen3-32b':                     'qwen/qwen3-32b',
    'moonshotai/kimi-k2-instruct':        'moonshotai/kimi-k2-instruct',
    'mixtral-8x7b-32768':                 'mixtral-8x7b-32768',
    'gemma2-9b-it':                       'gemma2-9b-it',
};
const DEFAULT_MODEL  = 'llama-3.3-70b-versatile';
const GSTD_COST      = 0.001;   // GSTD per inference
const ROUTE_TIMEOUT  = 20_000;  // ms to wait for node result
const POLL_INTERVAL  = 1_500;   // ms between result polls
const NODE_TTL_GRACE = 10 * 60_000; // 10 min

// ─── Node scoring for routing ─────────────────────────────────────────────
interface NodeScore { node_id: string; score: number; wallet: string; }

async function findBestNode(model: string): Promise<NodeScore | null> {
    const keys = await kvKeys('node:');
    if (!keys.length) return null;

    const raws  = await kvMGet(keys);
    const now   = Date.now();
    const nodes: NodeScore[] = [];

    for (const raw of raws) {
        if (!raw) continue;
        try {
            const node = JSON.parse(raw);
            if (new Date(node.last_seen).getTime() < now - NODE_TTL_GRACE) continue;

            const caps: string[] = node.capabilities || [];
            const hasModel = caps.includes(model) || caps.includes(model.split('/').pop() || model);
            if (!hasModel) continue;

            // Score: model match + low processing load + low latency + high tasks
            const loadPenalty  = (node.tasks_processing || 0) * 200;
            const latencyBonus = node.avg_latency_ms ? Math.max(0, 2000 - node.avg_latency_ms) : 500;
            const uptimeBonus  = Math.min((node.tasks_completed || 0) * 2, 200);
            const score = 1000 + latencyBonus + uptimeBonus - loadPenalty;

            nodes.push({ node_id: node.node_id, score, wallet: node.wallet_address || '' });
        } catch { /* skip */ }
    }

    if (!nodes.length) return null;
    nodes.sort((a, b) => b.score - a.score);
    return nodes[0];
}

// ─── Wait for distributed result ──────────────────────────────────────────
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

// ─── Groq fallback ─────────────────────────────────────────────────────────
async function groqInfer(model: string, messages: any[], maxTokens: number, temperature: number): Promise<any> {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) throw new Error('NO_KEY');

    const groqModel = MODEL_ALIASES[model] || DEFAULT_MODEL;
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({ model: groqModel, messages, stream: false, max_tokens: maxTokens, temperature }),
        signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) {
        const err: any = await resp.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Groq ${resp.status}`);
    }
    return resp.json();
}

// ─── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Rate limit: 30 req/min per IP
    const ip = getClientIp(req.headers as any);
    if (!rateLimit(`chat:${ip}`, 30, 60_000)) {
        return res.status(429).json({ error: 'Rate limit exceeded. 30 requests/minute per IP.' });
    }

    const { messages, model, max_tokens, temperature, gstd_wallet } = req.body || {};

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
    let   routedViaNode = false;
    let   nodeUsed      = '';

    // ── Try distributed routing first ─────────────────────────────────────
    const bestNode = await findBestNode(resolvedModel).catch(() => null);

    if (bestNode) {
        // Push to priority inference queue (nodes poll this every 5s)
        const task = {
            task_id:    taskId,
            type:       'inference',
            model:      resolvedModel,
            prompt:     messages[messages.length - 1]?.content || '',
            messages,
            max_tokens: maxTok,
            temperature: temp,
            reward_gstd: GSTD_COST * 0.9,
            // Direct routing hint — node checks this queue first
            node_hint:  bestNode.node_id,
            created_at: new Date().toISOString(),
        };
        await kvPush(`tasks:inference:${bestNode.node_id}`, JSON.stringify(task));

        // Short-poll for result
        const nodeResult = await waitForResult(taskId, ROUTE_TIMEOUT);

        if (nodeResult?.result) {
            routedViaNode = true;
            nodeUsed      = bestNode.node_id;
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
                usage:   nodeResult.result.tokens
                    ? { prompt_tokens: 0, completion_tokens: nodeResult.result.tokens, total_tokens: nodeResult.result.tokens }
                    : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
                // GSTD network metadata
                _gstd: {
                    routed_via_node: true,
                    node_id:         nodeUsed,
                    latency_ms:      nodeResult.latency_ms,
                    cost_gstd:       GSTD_COST,
                },
            });
        }
        // Node didn't respond in time — fall through to Groq
    }

    // ── Groq fallback ──────────────────────────────────────────────────────
    try {
        const data = await groqInfer(resolvedModel, messages, maxTok, temp);
        if (data.model) data.model = resolvedModel;
        data._gstd = {
            routed_via_node: false,
            cost_gstd:       GSTD_COST,
            fallback_reason: bestNode ? 'node_timeout' : 'no_node_available',
        };
        await kvIncr('stats:total_tasks_completed');
        return res.status(200).json(data);
    } catch (err: any) {
        if (err.message === 'NO_KEY') {
            return res.status(200).json({
                id: 'chatcmpl-nokey',
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: resolvedModel,
                choices: [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: 'GSTD Network: AI inference is available but no GROQ_API_KEY is configured on the platform. Add it in Vercel environment variables (free at console.groq.com). Alternatively, run a GSTD node with a key to serve requests from your hardware.',
                    },
                    finish_reason: 'stop',
                }],
                usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
                _gstd: { routed_via_node: false, error: 'no_api_key' },
            });
        }
        console.error('[chat/completions]', err.message);
        return res.status(500).json({ error: 'Inference error: ' + err.message });
    }
}
