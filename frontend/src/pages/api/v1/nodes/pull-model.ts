/**
 * POST /api/v1/nodes/pull-model
 *
 * Instructs a specific node to pull a new Ollama model.
 * The node must be online (active heartbeat). Request is queued in KV;
 * the node picks it up on next heartbeat and initiates `ollama pull`.
 *
 * Body: { node_id: string, model: string, wallet_address: string }
 * Auth: wallet_address must match node's registered wallet
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet } from '../../../../lib/kv';

const ALLOWED_MODEL_RE = /^[a-zA-Z0-9._:/-]{2,80}$/;
const MAX_QUEUE_PER_NODE = 5;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { node_id, model, wallet_address } = req.body || {};

    if (!node_id || typeof node_id !== 'string') return res.status(400).json({ error: 'node_id required' });
    if (!model || typeof model !== 'string' || !ALLOWED_MODEL_RE.test(model)) {
        return res.status(400).json({ error: 'Invalid model name. Use Ollama format e.g. llama3.1:8b' });
    }
    if (!wallet_address) return res.status(400).json({ error: 'wallet_address required' });

    // Verify node exists and wallet matches
    const nodeRaw = await kvGet(`node:${node_id}`);
    if (!nodeRaw) return res.status(404).json({ error: 'Node not found' });

    let node: any;
    try { node = JSON.parse(nodeRaw as string); } catch { return res.status(500).json({ error: 'Bad node data' }); }

    if (node.wallet_address && node.wallet_address !== wallet_address) {
        return res.status(403).json({ error: 'wallet_address does not match node owner' });
    }

    // Check node is online (last seen < 10 min)
    const age = Date.now() - new Date(node.last_seen || 0).getTime();
    if (age > 600_000) return res.status(503).json({ error: 'Node is offline (last seen > 10 minutes ago)' });

    // Read current pull queue
    const queueKey = `node:${node_id}:pull_queue`;
    let queue: string[] = [];
    try {
        const raw = await kvGet(queueKey);
        if (raw) queue = JSON.parse(raw as string);
    } catch { queue = []; }

    if (queue.includes(model)) {
        return res.status(200).json({ ok: true, queued: false, message: `${model} already in queue`, queue });
    }
    if (queue.length >= MAX_QUEUE_PER_NODE) {
        return res.status(429).json({ error: `Queue full (max ${MAX_QUEUE_PER_NODE} pending pulls)`, queue });
    }

    queue.push(model);
    await kvSet(queueKey, JSON.stringify(queue), 86400); // 24h TTL

    return res.status(200).json({
        ok: true,
        queued: true,
        model,
        node_id,
        message: `Model ${model} queued for download. Node will pull it on next heartbeat.`,
        queue,
    });
}
