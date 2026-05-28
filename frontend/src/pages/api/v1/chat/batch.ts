/**
 * POST /api/v1/chat/batch
 *
 * Batch inference endpoint — inspired by dria-sdk pipeline dispatch pattern.
 * Distributes multiple prompts across available GSTD nodes in parallel
 * and aggregates results.
 *
 * Access: Standard tier (100+ GSTD) and above.
 * Auth:   Authorization: Bearer gstd_<api_key>  OR  x-wallet-address header
 *         with on-chain balance check.
 *
 * Request body:
 *   {
 *     prompts:     string[]          // 1–50 prompts
 *     system?:     string            // shared system prompt
 *     model?:      string            // Ollama model (default: llama3.2:3b)
 *     max_tokens?: number            // per-prompt token limit (default: 256)
 *   }
 *
 * Response:
 *   {
 *     results: { index: number; content: string; latency_ms: number }[]
 *     nodes_used: number
 *     total_ms: number
 *     failed: number
 *   }
 */
export const config = { maxDuration: 55 };

import type { NextApiRequest, NextApiResponse } from 'next';
import { rateLimit, getClientIp } from '../../../../lib/ratelimit';
import { getActiveNodes, NODE_MODEL } from '../../../../lib/nodes';
import { kvGet }        from '../../../../lib/kv';
import { validateEnterpriseKey } from '../enterprise/keys';

const MAX_PROMPTS    = 50;
const MIN_BALANCE    = 100;   // Standard tier minimum
const STANDARD_TIER  = 'standard';

async function getWalletBalance(wallet: string): Promise<number> {
    const raw = await kvGet(`balance:${wallet.toLowerCase()}`).catch(() => null);
    return raw ? parseFloat(raw as string) : 0;
}

async function authorizeRequest(req: NextApiRequest): Promise<{ ok: boolean; reason?: string }> {
    // Enterprise API key (validated via hash lookup — not raw key as KV suffix)
    const auth = req.headers['authorization'] || '';
    const bearerMatch = (auth as string).match(/^Bearer (gstd_\S+)$/);
    if (bearerMatch) {
        const key = await validateEnterpriseKey(bearerMatch[1]);
        if (key) return { ok: true };
    }

    // Wallet-based auth (Standard+ tier)
    const wallet = (req.headers['x-wallet-address'] as string) || req.body?.wallet;
    if (wallet) {
        const balance = await getWalletBalance(wallet);
        if (balance >= MIN_BALANCE) return { ok: true };
        return { ok: false, reason: `Batch API requires ${MIN_BALANCE}+ GSTD (Standard tier). Your balance: ${balance.toFixed(2)} GSTD` };
    }

    return { ok: false, reason: 'Batch API requires Standard tier (100+ GSTD). Provide x-wallet-address header or enterprise API key.' };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const ip = getClientIp(req.headers as any);
    if (!rateLimit(`batch:${ip}`, 5, 60_000)) {
        return res.status(429).json({ error: 'Rate limit: 5 batch requests/minute' });
    }

    const auth = await authorizeRequest(req);
    if (!auth.ok) return res.status(403).json({ error: auth.reason });

    const { prompts, system, model, max_tokens = 256 } = req.body || {};

    if (!Array.isArray(prompts) || prompts.length === 0) {
        return res.status(400).json({ error: 'prompts array required' });
    }
    if (prompts.length > MAX_PROMPTS) {
        return res.status(400).json({ error: `Max ${MAX_PROMPTS} prompts per batch` });
    }

    const targetModel = model || NODE_MODEL;
    const start       = Date.now();

    // Get all available nodes, scored by model locality (datenlord pattern)
    const nodes = await getActiveNodes(targetModel);
    if (nodes.length === 0) {
        return res.status(503).json({ error: 'No GSTD nodes available' });
    }

    // dria-sdk dispatch pattern: assign each prompt to a node in round-robin,
    // then fan-out all assignments in parallel
    const assignments = prompts.map((prompt: string, idx: number) => ({
        index:  idx,
        prompt,
        node:   nodes[idx % nodes.length],
    }));

    const systemMsg = system || 'You are GSTD Sovereign AI. Be accurate and concise.';

    const results = await Promise.all(
        assignments.map(async ({ index, prompt, node }) => {
            const t0 = Date.now();
            try {
                const resp = await fetch(`${node.url}/v1/chat/completions`, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model:      targetModel,
                        messages: [
                            { role: 'system',  content: systemMsg },
                            { role: 'user',    content: String(prompt) },
                        ],
                        max_tokens: Math.min(Number(max_tokens) || 256, 512),
                        temperature: 0.7,
                        stream: false,
                    }),
                    signal: AbortSignal.timeout(25_000),
                });

                if (!resp.ok) return { index, content: null, latency_ms: Date.now() - t0, error: `Node ${resp.status}` };
                const data: any = await resp.json();
                const content   = data.choices?.[0]?.message?.content || '';
                return { index, content: content || null, latency_ms: Date.now() - t0 };
            } catch (e: any) {
                return { index, content: null, latency_ms: Date.now() - t0, error: e.message };
            }
        })
    );

    const succeeded = results.filter((r) => r.content !== null);
    const failed    = results.filter((r) => r.content === null);

    return res.status(200).json({
        results:    succeeded.map(({ index, content, latency_ms }) => ({ index, content, latency_ms })),
        nodes_used: Math.min(nodes.length, assignments.length),
        total_ms:   Date.now() - start,
        failed:     failed.length,
        ...(failed.length > 0 ? { failed_indices: failed.map((r) => r.index) } : {}),
    });
}
