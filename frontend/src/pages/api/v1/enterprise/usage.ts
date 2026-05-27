/**
 * GET /api/v1/enterprise/usage?key_id=<id>&period=<month|day|all>
 * Per-key usage tracking: tokens, requests, cost in USD.
 * Requires X-Master-Key header.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys } from '../../../../lib/kv';
import type { EnterpriseKey } from './keys';

// GSTD pricing: $0.10 per 1M tokens (vs OpenAI $1-15, AWS $1.5-21)
const GSTD_PRICE_PER_1M_TOKENS = 0.10;

function getMasterKey(): string {
    return process.env.ENTERPRISE_MASTER_KEY || 'dev_master_key_change_in_production';
}

function currentPeriodKey(): string {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function dayKey(): string {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const masterKey = req.headers['x-master-key'];
    if (masterKey !== getMasterKey()) {
        return res.status(401).json({ error: 'Invalid or missing X-Master-Key header' });
    }

    const { key_id, period = 'month' } = req.query;

    // Fetch usage records
    const usagePrefix = key_id ? `enterprise_usage:${key_id}:` : 'enterprise_usage:';
    const usageKeys = await kvKeys(`${usagePrefix}*`).catch(() => [] as string[]);

    interface UsageRecord {
        key_id:       string;
        timestamp:    number;
        model:        string;
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        request_id:   string;
    }

    const records: UsageRecord[] = [];
    for (const kn of usageKeys) {
        const raw = await kvGet(kn).catch(() => null);
        if (!raw) continue;
        try {
            records.push(JSON.parse(raw as string));
        } catch { /* skip */ }
    }

    // Filter by period
    const now = Date.now();
    let filtered = records;
    if (period === 'month') {
        const monthStart = new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1).getTime();
        filtered = records.filter(r => r.timestamp >= monthStart);
    } else if (period === 'day') {
        const dayStart = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
        filtered = records.filter(r => r.timestamp >= dayStart);
    }

    // Aggregate
    const totalTokens   = filtered.reduce((s, r) => s + r.total_tokens, 0);
    const totalRequests = filtered.length;
    const costUsd       = (totalTokens / 1_000_000) * GSTD_PRICE_PER_1M_TOKENS;

    // Per-model breakdown
    const byModel = new Map<string, { requests: number; tokens: number }>();
    for (const r of filtered) {
        const m = byModel.get(r.model) || { requests: 0, tokens: 0 };
        m.requests++;
        m.tokens += r.total_tokens;
        byModel.set(r.model, m);
    }

    // Fetch key metadata if querying a specific key
    let keyMeta: EnterpriseKey | null = null;
    let pct_limit_used = null;
    if (key_id && typeof key_id === 'string') {
        const raw = await kvGet(`enterprise_key:${key_id}`).catch(() => null);
        if (raw) {
            try {
                keyMeta = JSON.parse(raw as string);
                if (keyMeta) {
                    pct_limit_used = ((totalTokens / keyMeta.monthly_limit_tokens) * 100).toFixed(1);
                }
            } catch { /* skip */ }
        }
    }

    return res.status(200).json({
        key_id:       key_id || 'all',
        period,
        summary: {
            total_requests: totalRequests,
            total_tokens:   totalTokens,
            cost_usd:       parseFloat(costUsd.toFixed(4)),
            cost_gstd:      parseFloat((costUsd / 0.01).toFixed(2)), // assuming $0.01/GSTD
            pct_monthly_limit_used: pct_limit_used,
        },
        by_model: Object.fromEntries(
            Array.from(byModel.entries()).map(([model, data]) => [model, {
                ...data,
                cost_usd: parseFloat(((data.tokens / 1_000_000) * GSTD_PRICE_PER_1M_TOKENS).toFixed(4)),
            }])
        ),
        pricing: {
            gstd_per_1m_tokens:    GSTD_PRICE_PER_1M_TOKENS,
            vs_openai_gpt4:        '$15.00 / 1M tokens (150x more expensive)',
            vs_aws_bedrock_claude: '$3.00 / 1M tokens (30x more expensive)',
            vs_azure_openai:       '$6.00 / 1M tokens (60x more expensive)',
            savings_vs_openai:     `${((1 - GSTD_PRICE_PER_1M_TOKENS / 15) * 100).toFixed(0)}% cheaper`,
        },
        key_info: keyMeta ? {
            name:  keyMeta.name,
            org:   keyMeta.org,
            tier:  keyMeta.tier,
            monthly_limit_tokens: keyMeta.monthly_limit_tokens,
        } : null,
        timestamp: Date.now(),
    });
}

// ─── Usage recording helper (called from chat completions endpoint) ───────────
export async function recordEnterpriseUsage(
    kvSet: (k: string, v: string) => Promise<void>,
    keyId: string,
    model: string,
    promptTokens: number,
    completionTokens: number,
): Promise<void> {
    const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record = {
        key_id:            keyId,
        timestamp:         Date.now(),
        model,
        prompt_tokens:     promptTokens,
        completion_tokens: completionTokens,
        total_tokens:      promptTokens + completionTokens,
        request_id:        requestId,
    };
    // TTL 90 days, stored per-request
    await kvSet(`enterprise_usage:${keyId}:${requestId}`, JSON.stringify(record))
        .catch(() => {});
}
