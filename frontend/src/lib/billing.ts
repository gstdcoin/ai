import { consumePromoRequest } from './money';
import { randomUUID } from 'crypto';
import { kvConsumeQuota, kvGet } from './kv';

// GSTD cost per request by Ollama model ID
const MODEL_PRICES: Record<string, number> = {
    'auto': 0,
    'llama3.2:1b':     0,
    'llama3.2:3b':     0,
    'phi3:mini':       0,
    'gemma2:2b':       0,
    // Paid models
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
    // Odysseus special capabilities
    'odysseus-chat':     0.001,
    'odysseus-research': 0.05,
    'odysseus-docs':     0.02,
};

const FREE_DAILY_LIMIT = 50;
const COMMISSION_RATE  = 0.1;

export function getModelPrice(model: string): number {
    return MODEL_PRICES[model] ?? 0.005;
}

export function isFreeModel(model: string): boolean {
    return (MODEL_PRICES[model] ?? -1) === 0;
}

function todayKey(): string {
    return new Date().toISOString().slice(0, 10);
}

// Track and check free-tier daily usage (by wallet address or IP)
export async function checkFreeQuota(identifier: string): Promise<{ allowed: boolean; remaining: number }> {
    const key = `usage:free:${identifier.toLowerCase()}:${todayKey()}`;
    const raw = await kvGet(key);
    const used = parseInt(raw || '0', 10);
    const remaining = Math.max(0, FREE_DAILY_LIMIT - used);
    return { allowed: used < FREE_DAILY_LIMIT, remaining };
}

export async function incrementFreeUsage(identifier: string): Promise<void> {
    const key = `usage:free:${identifier.toLowerCase()}:${todayKey()}`;
    await kvConsumeQuota(key, FREE_DAILY_LIMIT, 90_000);
}

export type ChargeResult =
    | { ok: true; free: true; remaining: number }
    | { ok: true; free: false; charged: number; treasury: number; nodeReward: number }
    | { ok: false; error: 'insufficient_balance' | 'no_wallet'; balance?: number; required?: number };

/**
 * Attempt to charge a wallet for an inference request.
 * If model is free AND within daily limit → returns free: true.
 * Paid models use paidInference with a backed v2 reservation and 85/10/5 capture.
 * nodeId null means no specific node (routed dynamically).
 */
export async function chargeFee(
    wallet: string | null,
    model: string,
    nodeId: string | null,
): Promise<ChargeResult> {
    const price = getModelPrice(model);

    // Free models — check daily quota
    if (price === 0) {
        const identifier = wallet || 'anon';
        const quota = await kvConsumeQuota(
            `usage:free:${identifier.toLowerCase()}:${todayKey()}`,
            FREE_DAILY_LIMIT,
            90_000,
        );
        if (quota.allowed) {
            return { ok: true, free: true, remaining: quota.remaining };
        }
        if (wallet && await consumePromoRequest(wallet,randomUUID()))
            return { ok: true, free: true, remaining: 0 };
        // Over free limit: if no wallet → reject
        if (!wallet) {
            return { ok: false, error: 'no_wallet', required: 0 };
        }
        // Exceeding a free quota must never silently charge money.
    }

    return { ok: false, error: wallet ? 'insufficient_balance' : 'no_wallet', required: price };
}

export async function refundFee(_wallet: string, _amount: number): Promise<void> {
    throw new Error('Legacy direct billing is disabled; release the v2 reservation by payment id');
}
