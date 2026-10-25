/** Authenticated task result delivery; accounting is owned by tasks/complete. */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet } from '../../../../lib/kv';
import { requireNodeSignature } from '../../../../lib/nodeAuth';
import { hasTaskResult } from '../../../../lib/taskValidation';

const RESULT_TTL = 120;
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        const taskId = req.query.task_id;
        if (typeof taskId !== 'string' || !taskId) return res.status(400).json({ error: 'task_id required' });
        const raw = await kvGet(`task:result:${taskId}`);
        return res.status(200).json(raw ? JSON.parse(raw) : { ready: false });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { task_id, node_id, result, latency_ms = 0, model } = req.body || {};
    if (typeof task_id !== 'string' || !task_id || typeof node_id !== 'string' || !node_id)
        return res.status(400).json({ error: 'task_id and node_id required' });
    if (!hasTaskResult(result)) return res.status(422).json({ error: 'A non-empty successful result is required' });
    const raw = await kvGet(`node:${node_id}`);
    if (!raw) return res.status(403).json({ error: 'Unknown node' });
    const wallet = String(JSON.parse(raw).wallet_address || '').toLowerCase();
    if (!wallet || wallet !== String(req.headers['x-wallet-address'] || '').trim().toLowerCase())
        return res.status(403).json({ error: 'Wallet mismatch' });
    const auth = await requireNodeSignature(node_id, req.headers as any);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    const assigned = await kvGet(`task_assigned:${task_id}`);
    const completed = assigned ? null : await kvGet(`task_completed:${task_id}`);
    const record = assigned ? JSON.parse(assigned) : completed ? JSON.parse(completed) : null;
    if (!record || record.node_id !== node_id) return res.status(409).json({ error: 'Task is not assigned to this node' });
    if (record.expected_hash && String(result?.hash || '').toLowerCase() !== record.expected_hash.toLowerCase())
        return res.status(422).json({ error: 'Invalid verification result' });
    await kvSet(`task:result:${task_id}`, JSON.stringify({ ready: true, result, latency_ms, node_id, model }), RESULT_TTL);
    return res.status(200).json({ ok: true });
}
