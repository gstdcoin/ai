/**
 * POST /api/v1/models/pull
 * Trigger model download on a specific GSTD node.
 * The node must be reachable and have sufficient RAM for the model.
 *
 * Body: { model_id: string, node_url?: string }
 * - model_id: Ollama ID or hf.co/org/model GGUF path
 * - node_url: optional specific node; omit to auto-select best node with enough RAM
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvKeys } from '../../../../lib/kv';
import { resolveNodeUrl } from '../../../../lib/nodes';

const RAM_REQUIREMENTS: Record<string, number> = {
    'llama3.2:1b':  1.5, 'llama3.2:3b':  3,   'gemma2:2b':   2,
    'phi3:mini':    2.5, 'qwen2.5:3b':   3,
    'llama3.1:8b':  5,   'qwen2.5:7b':   4.5, 'mistral:7b':  4,
    'mistral-nemo:12b': 7, 'codellama:7b': 4,  'deepseek-coder:6.7b': 4,
    'nomic-embed-text': 0.5,
    'phi3:medium':  8,   'qwen2.5:14b':  9,   'deepseek-r1:14b': 9,
    'codellama:13b': 8,  'llava:13b':    8,   'mixtral:8x7b': 26,
    'llama3.1:70b': 40,  'qwen2.5:32b':  20,  'deepseek-r1:70b': 40,
    'codellama:70b': 40,
};

// SSRF protection: block private/loopback/cloud-metadata addresses (same pattern
// used by training/jobs.ts's dataset_url validation)
const BLOCKED_HOSTS = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1|fd|fc)/i;

function validateNodeUrl(raw: string): { ok: true; url: string } | { ok: false; reason: string } {
    let u: URL;
    try { u = new URL(raw); } catch { return { ok: false, reason: 'Invalid node_url' }; }
    if (u.protocol !== 'https:') return { ok: false, reason: 'node_url must use https' };
    if (BLOCKED_HOSTS.test(u.hostname)) return { ok: false, reason: 'node_url host not allowed' };
    return { ok: true, url: `${u.origin}${u.pathname}`.replace(/\/$/, '') };
}

function getRequiredRam(modelId: string): number {
    if (RAM_REQUIREMENTS[modelId]) return RAM_REQUIREMENTS[modelId];
    // HuggingFace GGUF — estimate from URL tokens
    if (modelId.includes('70B') || modelId.includes('65B')) return 40;
    if (modelId.includes('32B') || modelId.includes('34B')) return 20;
    if (modelId.includes('13B') || modelId.includes('14B')) return 9;
    if (modelId.includes('7B') || modelId.includes('8B'))   return 5;
    if (modelId.includes('3B'))  return 3;
    if (modelId.includes('1B'))  return 2;
    return 8; // unknown — assume 8GB
}

async function findCapableNode(modelId: string): Promise<string | null> {
    const requiredRam = getRequiredRam(modelId);
    const nodeKeys = await kvKeys('node:*').catch(() => [] as string[]);

    const candidates: Array<{ url: string; ram_gb: number; latency: number }> = [];

    for (const key of nodeKeys) {
        const raw = await kvGet(key).catch(() => null);
        if (!raw) continue;
        try {
            const node = JSON.parse(raw as string);
            if (node.ram_gb >= requiredRam && node.url) {
                candidates.push({ url: node.url, ram_gb: node.ram_gb, latency: node.latency_ms || 9999 });
            }
        } catch { /* skip */ }
    }

    if (!candidates.length) return null;
    // Prefer most RAM (can run the model comfortably), then lowest latency
    candidates.sort((a, b) => b.ram_gb - a.ram_gb || a.latency - b.latency);
    return candidates[0].url;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { model_id, node_url: explicitNodeUrl } = req.body as { model_id?: string; node_url?: string };

    if (!model_id || typeof model_id !== 'string') {
        return res.status(400).json({ error: 'model_id is required' });
    }

    // Validate model_id format (Ollama ID or HuggingFace path)
    const isOllama = /^[a-z0-9._-]+:[a-z0-9._-]+$/.test(model_id);
    const isHuggingFace = model_id.startsWith('hf.co/');
    if (!isOllama && !isHuggingFace) {
        return res.status(400).json({ error: 'model_id must be "name:tag" (Ollama) or "hf.co/org/model" (HuggingFace)' });
    }

    const requiredRam = getRequiredRam(model_id);

    // Resolve target node
    let targetUrl: string;
    if (explicitNodeUrl) {
        const validated = validateNodeUrl(explicitNodeUrl);
        if (!validated.ok) return res.status(400).json({ error: validated.reason });
        targetUrl = validated.url;
    } else {
        const autoNode = await findCapableNode(model_id);
        if (autoNode) {
            targetUrl = autoNode;
        } else {
            // Fall back to bootstrap node
            targetUrl = (await resolveNodeUrl()).replace(/\/$/, '');
        }
    }

    if (!targetUrl) {
        return res.status(503).json({ error: 'No capable node available', required_ram_gb: requiredRam });
    }

    // Trigger pull on the node via Ollama API
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const resp = await fetch(`${targetUrl}/api/pull`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: model_id, stream: false }),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            return res.status(502).json({ error: `Node returned ${resp.status}`, detail: text.slice(0, 200) });
        }

        const data = await resp.json().catch(() => ({})) as { status?: string; error?: string };

        if (data.error) {
            return res.status(422).json({ error: data.error });
        }

        // Record pull job in KV for status tracking
        const jobId = `pull_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await kvSet(`model_pull:${jobId}`, JSON.stringify({
            job_id:      jobId,
            model_id,
            node_url:    targetUrl,
            status:      data.status || 'pulling',
            started_at:  Date.now(),
        })).catch(() => {});

        return res.status(200).json({
            job_id:       jobId,
            model_id,
            node_url:     targetUrl,
            status:       data.status || 'pulling',
            required_ram_gb: requiredRam,
            message:      `Pull initiated on ${targetUrl}. Large models may take several minutes.`,
        });

    } catch (err: any) {
        if (err.name === 'AbortError') {
            return res.status(504).json({ error: 'Node did not respond in time', node_url: targetUrl });
        }
        return res.status(503).json({ error: 'Could not reach node', detail: err.message, node_url: targetUrl });
    }
}
