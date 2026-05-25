/**
 * POST /api/v1/chat/completions
 *
 * OpenAI-compatible inference endpoint.
 * Routes directly to the GSTD node network via GSTD_NODE_URL.
 * The node handles all peer routing internally — no Redis, no central coordinator.
 *
 * Set GSTD_NODE_URL in Vercel env vars to point to your bootstrap node.
 * The bootstrap node gossips with other nodes and routes to the best one.
 */
export const config = { maxDuration: 60 };

import type { NextApiRequest, NextApiResponse } from 'next';
import { rateLimit, getClientIp } from '../../../../lib/ratelimit';
import { kvGet, kvKeys, kvMGet } from '../../../../lib/kv';
import { randomBytes } from 'crypto';

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
    'llama3.2:3b':                                 'llama3.2:3b',
    'llama3.2:1b':                                 'llama3.2:1b',
    'llama3.1:8b':                                 'llama3.1:8b',
    'mistral:7b':                                  'mistral:7b',
    'phi3:mini':                                   'phi3:mini',
    'gemma2:2b':                                   'gemma2:2b',
};

const DEFAULT_MODEL = 'llama-3.1-8b-instant';
const ROUTE_TIMEOUT = 55_000;

// Cloud models served directly via Groq — no GSTD node needed
const GROQ_MODELS = new Set([
    'llama-3.3-70b-versatile', 'llama-3.1-8b-instant',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'qwen/qwen3-32b', 'moonshotai/kimi-k2-instruct',
    'mixtral-8x7b-32768', 'gemma2-9b-it',
    'openai/gpt-oss-120b', 'openai/gpt-oss-20b',
]);
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

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

    // Cloud models: route directly to Groq — no GSTD node needed
    const groqKey = process.env.GROQ_API_KEY || '';
    if (GROQ_MODELS.has(resolvedModel) && groqKey) {
        try {
            const groqResp = await fetch(GROQ_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
                body: JSON.stringify({ model: resolvedModel, messages, max_tokens: maxTok, temperature: temp }),
                signal: AbortSignal.timeout(ROUTE_TIMEOUT),
            });
            const groqData: any = await groqResp.json();
            const content = groqData.choices?.[0]?.message?.content || groqData.error?.message || '';
            return res.status(groqResp.ok ? 200 : 502).json({
                id:      `chatcmpl-${taskId}`,
                object:  'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model:   resolvedModel,
                choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
                usage:   groqData.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
                _gstd:   { routed_via: 'groq', model: resolvedModel },
            });
        } catch (e: any) {
            return res.status(503).json({ error: `Groq error: ${e.message}` });
        }
    }

    // Local models: resolve via GSTD node
    // Priority order:
    //   1. GSTD_NODE_URL env var (static override, set in Vercel dashboard)
    //   2. GitHub registry file (always current — updated by tunnel.sh on every URL change)
    //   3. KV cache (fast but may have stale data from dead tunnel instances)
    let nodeUrl = (process.env.GSTD_NODE_URL || '').replace(/\/$/, '');

    // GitHub file first — updated by tunnel.sh on every restart, cache-busted by timestamp
    if (!nodeUrl) {
        try {
            const ghResp = await fetch(
                `https://raw.githubusercontent.com/gstdcoin/ai/main/node-url.txt?t=${Math.floor(Date.now() / 30000)}`,
                { signal: AbortSignal.timeout(4000) }
            );
            if (ghResp.ok) {
                const url = (await ghResp.text()).trim();
                if (url.startsWith('http')) nodeUrl = url;
            }
        } catch { /* GitHub unavailable */ }
    }

    // KV fallback — reliable when Redis is configured, may be stale without Redis
    if (!nodeUrl) {
        try {
            const nodeUrlKeys = await kvKeys('node_url:');
            if (nodeUrlKeys.length > 0) {
                const firstUrl = await kvGet(nodeUrlKeys[0]);
                if (firstUrl?.startsWith('http')) nodeUrl = firstUrl;
            }
            if (!nodeUrl) {
                const nodeKeys = await kvKeys('node:');
                if (nodeKeys.length > 0) {
                    const values = await kvMGet(nodeKeys);
                    for (const raw of values) {
                        if (!raw) continue;
                        const node: any = JSON.parse(raw);
                        const url = node.node_url || node.multiaddrs?.[0];
                        if (url?.startsWith('http')) { nodeUrl = url; break; }
                    }
                }
            }
        } catch { /* KV unavailable */ }
    }

    if (!nodeUrl) {
        return res.status(503).json({
            id: `chatcmpl-${taskId}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: resolvedModel,
            choices: [{
                index: 0,
                message: { role: 'assistant', content: '🐝 GSTD Network: No active nodes found. Set GSTD_NODE_URL in Vercel env vars or wait for a node to register.' },
                finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            _gstd: { error: 'no_node_available' },
        });
    }

    try {
        const resp = await fetch(`${nodeUrl}/v1/ollama/completions`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ model: resolvedModel, messages, stream: false, max_tokens: maxTok, temperature: temp }),
            signal:  AbortSignal.timeout(ROUTE_TIMEOUT),
        });

        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            return res.status(502).json({
                id: `chatcmpl-${taskId}`,
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: resolvedModel,
                choices: [{ index: 0, message: { role: 'assistant', content: `🐝 Node error: ${resp.status}` }, finish_reason: 'stop' }],
                usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
                _gstd: { error: 'node_error', status: resp.status, detail: errText.slice(0, 200) },
            });
        }

        const data: any = await resp.json();
        const content = data.choices?.[0]?.message?.content || '';

        return res.status(200).json({
            id:      `chatcmpl-${taskId}`,
            object:  'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model:   data.model || resolvedModel,
            choices: [{
                index:         0,
                message:       { role: 'assistant', content },
                finish_reason: 'stop',
            }],
            usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            _gstd: { routed_via: nodeUrl, model: data.model || resolvedModel },
        });

    } catch (e: any) {
        const isTimeout = e?.name === 'TimeoutError' || e?.code === 'ABORT_ERR';
        return res.status(503).json({
            id: `chatcmpl-${taskId}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: resolvedModel,
            choices: [{ index: 0, message: { role: 'assistant', content: `🐝 GSTD Network: ${isTimeout ? 'Node timeout (55s)' : e.message}` }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            _gstd: { error: isTimeout ? 'timeout' : 'connection_error' },
        });
    }
}
