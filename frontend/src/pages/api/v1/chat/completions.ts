import { canonicalModelId } from '../../../../lib/modelId';
/**
 * POST /api/v1/chat/completions
 *
 * OpenAI-compatible inference endpoint backed by the GSTD sovereign node network.
 * Supports both standard (IP-rate-limited) and enterprise (API key) access.
 *
 * Enterprise: Authorization: Bearer gstd_xxx (created via /api/v1/enterprise/keys)
 * Standard:   30 req/min per IP; wallet billing requires a verified TON session
 */
export const config = { maxDuration: 115 };

import type { NextApiRequest, NextApiResponse } from 'next';
import { getClientIp } from '../../../../lib/ratelimit';
import { kvSet, kvRateLimit } from '../../../../lib/kv';
import { randomBytes } from 'crypto';
import { validateEnterpriseKey } from '../enterprise/keys';
import { recordEnterpriseUsage } from '../enterprise/usage';
import { chargeFee, refundFee, getModelPrice } from '../../../../lib/billing';
import { paidInference } from '../../../../lib/paidInference';
import { sessionWallet } from '../../../../lib/walletSession';
import { getActiveNodes } from '../../../../lib/nodes';

const DEFAULT_MODEL = 'llama3.2:3b';
const ROUTE_TIMEOUT = 110_000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── Auth: enterprise key OR standard IP rate limit ─────────────────────
    let enterpriseKey = null;
    let authenticatedWallet: string | null = null;
    const authHeader = req.headers['authorization'] || '';
    const bearerMatch = authHeader.match(/^Bearer (gstd_\S+)$/);

    if (bearerMatch) {
        enterpriseKey = await validateEnterpriseKey(bearerMatch[1]);
        if (!enterpriseKey) {
            try {
                authenticatedWallet = await sessionWallet(req.headers);
            } catch (err: any) {
                console.error('[chat/completions session]', err?.message || err);
                return res.status(503).json({ error: 'Could not verify wallet session' });
            }
            if (!authenticatedWallet) {
                return res.status(401).json({ error: 'Invalid enterprise key or wallet session' });
            }
            const ip = getClientIp(req.headers as any);
            if (!(await kvRateLimit(`chat:${ip}`, 30, 60_000))) {
                return res.status(429).json({
                    error: 'Rate limit exceeded. 30 requests/minute per IP. Use an enterprise API key for higher limits.',
                    upgrade: 'POST /api/v1/enterprise/keys',
                });
            }
        } else {
            // Enterprise rate limit by key RPM
            if (!(await kvRateLimit(`enterprise:${enterpriseKey.id}`, enterpriseKey.rpm_limit, 60_000))) {
                return res.status(429).json({
                    error: `Enterprise rate limit: ${enterpriseKey.rpm_limit} requests/minute`,
                    tier: enterpriseKey.tier,
                });
            }
        }
    } else {
        const ip = getClientIp(req.headers as any);
        if (!(await kvRateLimit(`chat:${ip}`, 30, 60_000))) {
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
    const resolvedModel = typeof model === 'string' && model ? model : DEFAULT_MODEL;
    if (enterpriseKey && enterpriseKey.allowed_models.length > 0) {
        if (!enterpriseKey.allowed_models.includes(resolvedModel)) {
            return res.status(403).json({ error: 'model_not_allowed', model: resolvedModel });
        }
    }

    const maxTok  = Math.min(parseInt(max_tokens) || 2048, 16384);
    const temp    = Math.min(Math.max(parseFloat(temperature) || 0.7, 0), 2);
    const taskId  = randomBytes(8).toString('hex');

    // ── GSTD billing (skip for enterprise keys) ────────────────────────────
    if (!enterpriseKey && !authenticatedWallet) {
        try {
            authenticatedWallet = await sessionWallet(req.headers);
        } catch (err: any) {
            console.error('[chat/completions session]', err?.message || err);
            return res.status(503).json({ error: 'Could not verify wallet session' });
        }
    }
    const walletAddress = !enterpriseKey ? authenticatedWallet : null;

    if (!enterpriseKey && getModelPrice(resolvedModel) > 0) {
        return paidInference(req,res,{ wallet: walletAddress, price: getModelPrice(resolvedModel), model: resolvedModel,
            messages, maxTokens: maxTok, surface: 'api' });
    }
    let billingCharge = 0;
    if (!enterpriseKey) {
        const charge = await chargeFee(walletAddress, resolvedModel, null, 'ip:' + getClientIp(req.headers));
        if (!charge.ok) {
            if (charge.error === 'no_wallet') {
                return res.status(402).json({
                    error: 'Payment required. Authenticate with a verified TON wallet session to use wallet credits. Anonymous free requests are limited.',
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

    // ── Resolve GSTD node (model-aware: picks node that has this model) ───
    const candidates = await getActiveNodes(resolvedModel);
    const nodeUrl = candidates[0]?.url;

    if (!nodeUrl) {
        if (walletAddress && billingCharge > 0) await refundFee(walletAddress, billingCharge);
        return res.status(503).json({
            id:      `chatcmpl-${taskId}`,
            object:  'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model:   resolvedModel,
            choices: [{
                index:         0,
                message:       { role: 'assistant', content: 'No GSTD nodes are online right now, so this request cannot be served. Please try again later.' },
                finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            _gstd: { error: resolvedModel === 'auto' ? 'no_node_available' : 'model_unavailable' },
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
        if (resolvedModel !== 'auto' && (typeof data.model !== 'string' || canonicalModelId(data.model) !== canonicalModelId(resolvedModel))) {
            return res.status(502).json({ error: 'model_mismatch', requested_model: resolvedModel });
        }
        const content   = data.choices?.[0]?.message?.content || '';
        if (!content.trim() || data._gstd?.error || data._gstd?.tier === 'fallback') {
            return res.status(502).json({ error: 'inference_failed', model: resolvedModel });
        }
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
            choices: [{ index: 0, message: { role: 'assistant', content: `🐝 GSTD Network: ${isTimeout ? 'Node timeout — model may still be loading, retry in 30s' : e.message}` }, finish_reason: 'stop' }],
            usage:   { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            _gstd:   { error: isTimeout ? 'timeout' : 'connection_error', refunded: billingCharge > 0 },
        });
    }
}
