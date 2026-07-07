/**
 * GET  /api/v1/training/jobs        — list user's active jobs (by wallet)
 * POST /api/v1/training/jobs        — submit a new fine-tuning job
 * GET  /api/v1/training/jobs/:id    — handled via [id].ts
 *
 * POST body:
 *   model        string   — base model: llama3.2:3b | llama3.1:8b | qwen2.5:7b | mistral:7b | ...
 *   dataset_url  string   — public or signed URL to JSONL file (Alpaca format)
 *   domain?      string   — specialization hint: general | code | medical | legal | finance
 *   epochs?      number   — training epochs (default 1, max 5)
 *   steps?       number   — steps per shard (default 100)
 *   wallet?      string   — requester TON wallet (for reward tracking)
 *
 * Job is split into shards and pushed to tasks:queue with required_caps: ["finetune"].
 * TrainingNode picks them up via /api/v1/tasks/poll.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvPush, kvKeys, kvIncr, kvIncrByFloat } from '../../../../lib/kv';
import { randomBytes } from 'crypto';

const SUPPORTED_MODELS = [
    'llama3.1:8b', 'llama3.2:3b', 'llama3.2:1b',
    'qwen2.5:7b', 'qwen2.5:3b', 'mistral:7b',
    'phi3:mini', 'gemma2:2b',
];

const COST_PER_EPOCH: Record<string, number> = {
    'llama3.1:8b': 2.0, 'qwen2.5:7b': 2.0, 'mistral:7b': 2.0,
    'llama3.2:3b': 0.8, 'qwen2.5:3b': 0.8, 'phi3:mini': 0.8,
    'llama3.2:1b': 0.4, 'gemma2:2b': 0.4,
};

// V1: one shard per job (dataset_url points to full JSONL)
// V2: split into N shards with signed URLs per segment
const SHARDS_PER_JOB = 1;

export interface TrainingJob {
    job_id:       string;
    model:        string;
    dataset_url:  string;
    domain:       string;
    epochs:       number;
    steps:        number;
    wallet:       string;
    status:       'pending' | 'training' | 'aggregating' | 'done' | 'failed';
    shards_total: number;
    shards_done:  number;
    cost_gstd:    number;
    created_at:   string;
    updated_at:   string;
    lora_url?:    string;
    error?:       string;
    gradients:    GradientRecord[];
}

export interface GradientRecord {
    shard_id:            string;
    node_id:             string;
    metacognitive_score: number;
    gradient_norm:       number;
    val_loss_improvement: number;
    lora_path:           string;
    submitted_at:        string;
}

const JOB_TTL = 7 * 24 * 3600; // 7 days

// SSRF protection: block private/loopback/cloud-metadata addresses
const BLOCKED_HOSTS = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1|fd|fc)/i;

function validateDatasetUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
    let u: URL;
    try { u = new URL(raw); } catch { return { ok: false, reason: 'Invalid URL' }; }
    if (u.protocol !== 'https:') return { ok: false, reason: 'dataset_url must use https' };
    if (BLOCKED_HOSTS.test(u.hostname)) return { ok: false, reason: 'dataset_url host not allowed' };
    return { ok: true, url: u };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'POST') {
        return handleSubmit(req, res);
    }
    if (req.method === 'GET') {
        return handleList(req, res);
    }
    return res.status(405).json({ error: 'Method not allowed' });
}

async function handleSubmit(req: NextApiRequest, res: NextApiResponse) {
    try {
        const body = req.body as any;
        const model:       string = body.model || 'llama3.2:3b';
        const dataset_url: string = body.dataset_url || '';
        const domain:      string = body.domain || 'general';
        const epochs:      number = Math.min(5, Math.max(1, Number(body.epochs) || 1));
        const steps:       number = Math.min(1000, Math.max(10, Number(body.steps) || 100));
        const wallet:      string = body.wallet || '';

        if (!dataset_url) {
            return res.status(400).json({ error: 'dataset_url required' });
        }
        const urlCheck = validateDatasetUrl(dataset_url);
        if (!urlCheck.ok) {
            return res.status(400).json({ error: urlCheck.reason });
        }
        if (!SUPPORTED_MODELS.includes(model)) {
            return res.status(400).json({
                error: `Unsupported model: ${model}`,
                supported: SUPPORTED_MODELS,
            });
        }

        const job_id    = randomBytes(10).toString('hex');
        const cost_gstd = (COST_PER_EPOCH[model] || 1.0) * epochs;

        // Enforce payment: deduct GSTD balance if wallet provided
        if (wallet) {
            const walletKey = wallet.trim().toLowerCase();
            const balRaw    = await kvGet(`balance:${walletKey}`);
            const balance   = parseFloat(balRaw || '0');
            if (balance < cost_gstd) {
                return res.status(402).json({
                    error:     'Insufficient GSTD balance',
                    required:  cost_gstd,
                    available: balance,
                    deposit_to: process.env.NEXT_PUBLIC_TON_VAULT || '',
                });
            }
            await kvIncrByFloat(`balance:${walletKey}`, -cost_gstd);
        }

        const job: TrainingJob = {
            job_id,
            model,
            dataset_url,
            domain,
            epochs,
            steps,
            wallet,
            status:       'pending',
            shards_total: SHARDS_PER_JOB,
            shards_done:  0,
            cost_gstd,
            created_at:   new Date().toISOString(),
            updated_at:   new Date().toISOString(),
            gradients:    [],
        };

        await kvSet(`training:job:${job_id}`, JSON.stringify(job), JOB_TTL);
        if (wallet) {
            const existing = await kvGet(`training:wallet:${wallet}`);
            const ids = existing ? existing.split('\n').filter(Boolean) : [];
            ids.push(job_id);
            await kvSet(`training:wallet:${wallet}`, ids.join('\n'), JOB_TTL);
        }

        // Push one finetune shard per epoch into tasks:queue
        for (let epoch = 0; epoch < epochs; epoch++) {
            const shard_id = `${job_id}-e${epoch}`;
            const task = {
                task_id:      shard_id,
                type:         'finetune',
                required_caps: ['finetune'],
                payload: {
                    job_id,
                    shard_id,
                    base_model:  model,
                    domain,
                    shard_url:   dataset_url,
                    steps,
                    epochs:      1,
                    epoch_index: epoch,
                    reward_gstd: cost_gstd * 0.8 / epochs, // 80% to nodes
                },
                priority:   2,
                created_at: new Date().toISOString(),
            };
            await kvPush('tasks:queue', JSON.stringify(task));
        }

        await kvIncr('stats:training_jobs_submitted');

        return res.status(200).json({
            ok:        true,
            job_id,
            model,
            domain,
            epochs,
            cost_gstd,
            shards:    SHARDS_PER_JOB * epochs,
            status:    'pending',
            track_url: `/api/v1/training/jobs/${job_id}`,
        });
    } catch (err: any) {
        console.error('[training/jobs POST]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}

async function handleList(req: NextApiRequest, res: NextApiResponse) {
    try {
        const wallet = (req.query.wallet as string) || '';
        if (!wallet) {
            return res.status(400).json({ error: 'wallet query param required' });
        }
        // IDOR protection: requester must prove wallet ownership via header
        const headerWallet = (req.headers['x-wallet-address'] as string || '').trim();
        if (!headerWallet || headerWallet !== wallet) {
            return res.status(403).json({ error: 'X-Wallet-Address header must match wallet param' });
        }

        // Get all job IDs for this wallet (stored as a list)
        const raw = await kvGet(`training:wallet:${wallet}`);
        const jobIds: string[] = raw ? raw.split('\n').filter(Boolean) : [];

        const jobs = await Promise.all(
            jobIds.slice(-20).map(async (id) => {
                const jobRaw = await kvGet(`training:job:${id}`);
                return jobRaw ? JSON.parse(jobRaw) as TrainingJob : null;
            })
        );

        return res.status(200).json({
            jobs: jobs.filter(Boolean).reverse(),
            total: jobIds.length,
        });
    } catch (err: any) {
        console.error('[training/jobs GET]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
