/**
 * POST /api/v1/chat/completions
 *
 * OpenAI-compatible inference endpoint backed by the GSTD sovereign node network.
 * Supports both standard (IP-rate-limited) and enterprise (API key) access.
 *
 * Enterprise: Authorization: Bearer gstd_xxx (created via /api/v1/enterprise/keys)
 * Standard:   No auth — 30 req/min per IP
 */
export const config = { maxDuration: 60 };

import type { NextApiRequest, NextApiResponse } from 'next';
import { rateLimit, getClientIp } from '../../../../lib/ratelimit';
import { kvGet, kvKeys, kvMGet, kvSet } from '../../../../lib/kv';
import { randomBytes } from 'crypto';
import { validateEnterpriseKey } from '../enterprise/keys';
import { recordEnterpriseUsage } from '../enterprise/usage';
import { chargeFee, refundFee } from '../../../../lib/billing';

// Map OpenAI/legacy model IDs → Ollama IDs (all inference via GSTD nodes)
const MODEL_ALIASES: Record<string, string> = {
    'gpt-4':                                       'llama3.1:70b',
    'gpt-4o':                                      'llama3.1:70b',
    'gpt-4-turbo':                                 'llama3.1:70b',
    'gpt-3.5-turbo':                               'llama3.1:8b',
    'auto':                                        'llama3.1:8b',
    // Legacy Groq IDs — transparently mapped, not routed to Groq
    'llama-3.3-70b-versatile':                     'llama3.1:70b',
    'llama-3.1-8b-instant':                        'llama3.1:8b',
    'meta-llama/llama-4-scout-17b-16e-instruct':   'llama3.1:8b',
    'qwen/qwen3-32b':                              'qwen2.5:32b',
    'moonshotai/kimi-k2-instruct':                 'qwen2.5:7b',
    'openai/gpt-oss-120b':                         'llama3.1:70b',
    'openai/gpt-oss-20b':                          'qwen2.5:7b',
    'mixtral-8x7b-32768':                          'mixtral:8x7b',
    'gemma2-9b-it':                                'gemma2:2b',
    // Native Ollama IDs — pass through
    'llama3.2:3b':    'llama3.2:3b',
    'llama3.2:1b':    'llama3.2:1b',
    'llama3.1:8b':    'llama3.1:8b',
    'llama3.1:70b':   'llama3.1:70b',
    'qwen2.5:7b':     'qwen2.5:7b',
    'qwen2.5:14b':    'qwen2.5:14b',
    'qwen2.5:32b':    'qwen2.5:32b',
    'mistral:7b':     'mistral:7b',
    'phi3:mini':      'phi3:mini',
    'phi3:medium':    'phi3:medium',
    'gemma2:2b':      'gemma2:2b',
    'deepseek-r1:14b': 'deepseek-r1:14b',
    'deepseek-r1:70b': 'deepseek-r1:70b',
    'codellama:7b':   'codellama:7b',
    'codellama:13b':  'codellama:13b',
    'nomic-embed-text': 'nomic-embed-text',
};

const DEFAULT_MODEL   = 'llama3.2:3b';
const ROUTE_TIMEOUT   = 55_000;

async function resolveNodeUrl(): Promise<string> {
    // 1. Env override (fastest, set in Vercel dashboard)
    const envUrl = (process.env.GSTD_NODE_URL || '').replace(/\/$/, '');
    if (envUrl) return envUrl;

    // 2. KV — written by every heartbeat (fast, no network round-trip to GitHub)
    try {
        const nodeUrlKeys = await kvKeys('node_url:');
        if (nodeUrlKeys.length > 0) {
            const url = await kvGet(nodeUrlKeys[0]);
            if (url?.startsWith('http')) return (url as string).replace(/\/$/, '');
        }
        const nodeKeys = await kvKeys('node:');
        if (nodeKeys.length > 0) {
            const values = await kvMGet(nodeKeys);
            for (const raw of values) {
                if (!raw) continue;
                const node: any = JSON.parse(raw);
                const url: string = node.node_url || node.multiaddrs?.[0] || '';
                const lastSeenMs = Date.now() - new Date(node.last_seen || 0).getTime();
                if (url.startsWith('http') && lastSeenMs < 600_000) return url.replace(/\/$/, '');
            }
        }
    } catch { /* KV unavailable */ }

    // 3. GitHub fallback — updated by tunnel.sh on each tunnel start
    try {
        const ghResp = await fetch(
            `https://raw.githubusercontent.com/gstdcoin/ai/main/node-url.txt?t=${Math.floor(Date.now() / 30000)}`,
            { signal: AbortSignal.timeout(4000) }
        );
        if (ghResp.ok) {
            const url = (await ghResp.text()).trim();
            if (url.startsWith('http')) return url.replace(/\/$/, '');
        }
    } catch { /* GitHub unavailable */ }

    return '';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── Auth: enterprise key OR standard IP rate limit ─────────────────────
    let enterpriseKey = null;
    const authHeader = req.headers['authorization'] || '';
    const bearerMatch = authHeader.match(/^Bearer (gstd_\S+)$/);

    if (bearerMatch) {
        enterpriseKey = await validateEnterpriseKey(bearerMatch[1]);
        if (!enterpriseKey) {
            return res.status(401).json({ error: 'Invalid or expired enterprise API key' });
        }
        // Enterprise rate limit by key RPM
        if (!rateLimit(`enterprise:${enterpriseKey.id}`, enterpriseKey.rpm_limit, 60_000)) {
            return res.status(429).json({
                error: `Enterprise rate limit: ${enterpriseKey.rpm_limit} requests/minute`,
                tier: enterpriseKey.tier,
            });
        }
    } else {
        const ip = getClientIp(req.headers as any);
        if (!rateLimit(`chat:${ip}`, 30, 60_000)) {
            return res.status(429).json({
                error: 'Rate limit exceeded. 30 requests/minute per IP. Use an enterprise API key for higher limits.',
                upgrade: 'POST /api/v1/enterprise/keys',
            });
        }
    }

    const { messages, model, max_tokens, temperature, stream } = req.body || {};

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages array required' });
    }
    if (messages.length > 200) {
        return res.status(400).json({ error: 'Too many messages (max 200)' });
    }

    // Check enterprise model restriction
    let resolvedModel = MODEL_ALIASES[model] || (typeof model === 'string' && model ? model : DEFAULT_MODEL);
    if (enterpriseKey && enterpriseKey.allowed_models.length > 0) {
        if (!enterpriseKey.allowed_models.includes(resolvedModel)) {
            resolvedModel = enterpriseKey.allowed_models[0];
        }
    }

    const maxTok  = Math.min(parseInt(max_tokens) || 2048, 16384);
    const temp    = Math.min(Math.max(parseFloat(temperature) || 0.7, 0), 2);
    const taskId  = randomBytes(8).toString('hex');

    // ── GSTD billing (skip for enterprise keys) ────────────────────────────
    const walletAddress = !enterpriseKey
        ? ((req.headers['x-wallet-address'] as string) || null)?.trim() || null
        : null;

    let billingCharge = 0;
    if (!enterpriseKey) {
        const charge = await chargeFee(walletAddress, resolvedModel, null);
        if (!charge.ok) {
            if (charge.error === 'no_wallet') {
                return res.status(402).json({
                    error: 'Payment required. Add X-Wallet-Address header with your TON wallet, or connect wallet at app.gstdtoken.com to get 50 free requests/day.',
                    model: resolvedModel,
                    required_gstd: charge.required ?? 0,
                    deposit_url: '/api/v1/credits/deposit',
                });
            }
            return res.status(402).json({
                error: 'Insufficient GSTD balance.',
                balance: charge.balance,
                required_gstd: charge.required,
                deposit_url: '/api/v1/credits/deposit',
            });
        }
        if (!charge.free) {
            billingCharge = charge.charged;
        }
    }

    // ── Resolve GSTD node ──────────────────────────────────────────────────
    const nodeUrl = await resolveNodeUrl();

    if (!nodeUrl) {
        return res.status(503).json({
            id:      `chatcmpl-${taskId}`,
            object:  'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model:   resolvedModel,
            choices: [{
                index:         0,
                message:       { role: 'assistant', content: '🐝 GSTD Network: No active nodes available. Set GSTD_NODE_URL in Vercel env vars or wait for a node to come online.' },
                finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            _gstd: { error: 'no_node_available' },
        });
    }

    // ── Forward to GSTD node ───────────────────────────────────────────────
    try {
        const resp = await fetch(`${nodeUrl}/v1/chat/completions`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ model: resolvedModel, messages, stream: false, max_tokens: maxTok, temperature: temp }),
            signal:  AbortSignal.timeout(ROUTE_TIMEOUT),
        });

        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            if (walletAddress && billingCharge > 0) await refundFee(walletAddress, billingCharge);
            return res.status(502).json({
                id:      `chatcmpl-${taskId}`,
                object:  'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model:   resolvedModel,
                choices: [{ index: 0, message: { role: 'assistant', content: `🐝 Node error: ${resp.status}` }, finish_reason: 'stop' }],
                usage:   { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
                _gstd:   { error: 'node_error', status: resp.status, detail: errText.slice(0, 200), refunded: billingCharge > 0 },
            });
        }

        const data: any = await resp.json();
        const content   = data.choices?.[0]?.message?.content || '';
        const usage     = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

        // Record enterprise usage
        if (enterpriseKey) {
            await recordEnterpriseUsage(
                kvSet,
                enterpriseKey.id,
                data.model || resolvedModel,
                usage.prompt_tokens,
                usage.completion_tokens,
            );
        }

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
            usage,
            _gstd: {
                routed_via: nodeUrl,
                model:      data.model || resolvedModel,
                enterprise: enterpriseKey ? { org: enterpriseKey.org, tier: enterpriseKey.tier } : null,
                billing:    billingCharge > 0 ? { charged_gstd: billingCharge } : { free: true },
            },
        });

    } catch (e: any) {
        const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
        if (walletAddress && billingCharge > 0) await refundFee(walletAddress, billingCharge);
        return res.status(503).json({
            id:      `chatcmpl-${taskId}`,
            object:  'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model:   resolvedModel,
            choices: [{ index: 0, message: { role: 'assistant', content: `🐝 GSTD Network: ${isTimeout ? 'Node timeout (55s)' : e.message}` }, finish_reason: 'stop' }],
            usage:   { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            _gstd:   { error: isTimeout ? 'timeout' : 'connection_error', refunded: billingCharge > 0 },
        });
    }
}
