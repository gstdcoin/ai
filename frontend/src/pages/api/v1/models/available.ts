/**
 * GET /api/v1/models/available
 * Returns models currently available across active GSTD nodes with pricing.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvKeys, kvGet, kvMGet } from '../../../../lib/kv';

// GSTD price per request by model
const MODEL_PRICES: Record<string, number> = {
    'llama3.2:1b':     0,
    'llama3.2:3b':     0,
    'phi3:mini':       0,
    'gemma2:2b':       0,
    'llama3.1:8b':     0.005,
    'qwen2.5:7b':      0.005,
    'mistral:7b':      0.005,
    'phi3:medium':     0.005,
    'qwen2.5:14b':     0.01,
    'deepseek-r1:14b': 0.02,
    'codellama:7b':    0.005,
    'codellama:13b':   0.01,
    'qwen2.5:32b':     0.03,
    'mixtral:8x7b':    0.02,
    'llama3.1:70b':    0.05,
    'deepseek-r1:70b': 0.08,
    'odysseus-chat':     0.001,
    'odysseus-research': 0.05,
    'odysseus-docs':     0.02,
};

export interface AvailableModel {
    model_id:       string;
    display_name:   string;
    nodes_count:    number;
    price_gstd:     number;
    is_free:        boolean;
    avg_latency_ms: number | null;
    category:       string;
}

function displayName(id: string): string {
    const map: Record<string, string> = {
        'llama3.2:3b':     'Llama 3.2 3B',
        'llama3.2:1b':     'Llama 3.2 1B',
        'llama3.1:8b':     'Llama 3.1 8B',
        'llama3.1:70b':    'Llama 3.1 70B',
        'qwen2.5:7b':      'Qwen 2.5 7B',
        'qwen2.5:14b':     'Qwen 2.5 14B',
        'qwen2.5:32b':     'Qwen 2.5 32B',
        'mistral:7b':      'Mistral 7B',
        'phi3:mini':       'Phi-3 Mini',
        'phi3:medium':     'Phi-3 Medium',
        'gemma2:2b':       'Gemma 2 2B',
        'deepseek-r1:14b': 'DeepSeek R1 14B',
        'deepseek-r1:70b': 'DeepSeek R1 70B',
        'codellama:7b':    'CodeLlama 7B',
        'codellama:13b':   'CodeLlama 13B',
        'mixtral:8x7b':    'Mixtral 8x7B',
        'odysseus-chat':     'Odysseus Chat',
        'odysseus-research': 'Odysseus Research',
        'odysseus-docs':     'Odysseus Docs',
    };
    return map[id] || id;
}

function modelCategory(id: string): string {
    if (id.startsWith('codellama')) return 'code';
    if (id.startsWith('odysseus-research')) return 'research';
    if (id.startsWith('odysseus')) return 'workspace';
    if (id.startsWith('deepseek-r1')) return 'reasoning';
    return 'chat';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // Aggregate models from all active nodes
    const modelCount: Record<string, number>       = {};
    const modelLatency: Record<string, number[]>   = {};

    try {
        const nodeKeys = await kvKeys('node:');
        if (nodeKeys.length > 0) {
            const values = await kvMGet(nodeKeys);
            const now = Date.now();
            for (const raw of values) {
                if (!raw) continue;
                const node: any = JSON.parse(raw);
                const lastSeenMs = now - new Date(node.last_seen || 0).getTime();
                if (lastSeenMs > 600_000) continue; // stale

                const caps: string[] = node.capabilities || node.models || [];
                for (const cap of caps) {
                    modelCount[cap] = (modelCount[cap] || 0) + 1;
                    if (node.avg_latency_ms) {
                        if (!modelLatency[cap]) modelLatency[cap] = [];
                        modelLatency[cap].push(node.avg_latency_ms);
                    }
                }
            }
        }
    } catch { /* KV unavailable — return empty */ }

    // Build response: combine live node data with price catalog
    const seen = new Set<string>([...Object.keys(modelCount), ...Object.keys(MODEL_PRICES)]);
    const models: AvailableModel[] = [];

    for (const modelId of seen) {
        const count   = modelCount[modelId] || 0;
        const latArr  = modelLatency[modelId] || [];
        const avgLat  = latArr.length > 0 ? Math.round(latArr.reduce((a, b) => a + b, 0) / latArr.length) : null;
        const price   = MODEL_PRICES[modelId] ?? 0.005;

        models.push({
            model_id:       modelId,
            display_name:   displayName(modelId),
            nodes_count:    count,
            price_gstd:     price,
            is_free:        price === 0,
            avg_latency_ms: avgLat,
            category:       modelCategory(modelId),
        });
    }

    // Sort: free first, then by nodes_count desc, then by price asc
    models.sort((a, b) => {
        if (a.is_free !== b.is_free) return a.is_free ? -1 : 1;
        if (b.nodes_count !== a.nodes_count) return b.nodes_count - a.nodes_count;
        return a.price_gstd - b.price_gstd;
    });

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json({ models, updated_at: new Date().toISOString() });
}
