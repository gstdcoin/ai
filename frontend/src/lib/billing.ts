import { kvGet, kvIncrByFloat, kvIncr, kvSet } from './kv';

// GSTD cost per request by Ollama model ID
const MODEL_PRICES: Record<string, number> = {
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
    await kvIncr(key);
    // TTL 25h so it doesn't stack across days
    const raw = await kvGet(key);
    if (raw === '1') {
        await kvSet(key, '1', 90_000);
    }
}

export type ChargeResult =
    | { ok: true; free: true; remaining: number }
    | { ok: true; free: false; charged: number; treasury: number; nodeReward: number }
    | { ok: false; error: 'insufficient_balance' | 'no_wallet'; balance?: number; required?: number };

/**
 * Attempt to charge a wallet for an inference request.
 * If model is free AND within daily limit → returns free: true.
 * Otherwise deducts GSTD and distributes: 90% node reward, 10% treasury.
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
        const quota = await checkFreeQuota(identifier);
        if (quota.allowed) {
            await incrementFreeUsage(identifier);
            return { ok: true, free: true, remaining: quota.remaining - 1 };
        }
        // Over free limit: if no wallet → reject
        if (!wallet) {
            return { ok: false, error: 'no_wallet', required: 0 };
        }
        // Wallet present but over free limit: charge 0.001 GSTD (base fee)
    }

    if (!wallet) {
        return { ok: false, error: 'no_wallet', required: price };
    }

    const balanceKey = `balance:${wallet.toLowerCase()}`;
    const raw = await kvGet(balanceKey);
    const balance = parseFloat(raw || '0');
    const charge = price === 0 ? 0.001 : price;

    if (balance < charge) {
        return { ok: false, error: 'insufficient_balance', balance, required: charge };
    }

    // Deduct from user
    await kvIncrByFloat(balanceKey, -charge);

    // 10% to treasury
    const treasury  = charge * COMMISSION_RATE;
    const nodeReward = charge - treasury;

    await kvIncrByFloat('treasury:balance', treasury);

    // Credit node rewards if node known
    if (nodeId) {
        const nodeKey = `rewards:pending:${nodeId.toLowerCase()}`;
        await kvIncrByFloat(nodeKey, nodeReward);
    } else {
        // Pool unattributed rewards — settled proportionally
        await kvIncrByFloat('rewards:pool', nodeReward);
    }

    return { ok: true, free: false, charged: charge, treasury, nodeReward };
}

export async function refundFee(wallet: string, amount: number): Promise<void> {
    if (amount <= 0) return;
    const balanceKey = `balance:${wallet.toLowerCase()}`;
    await kvIncrByFloat(balanceKey, amount);
    // Reverse treasury portion
    const treasury = amount * COMMISSION_RATE;
    await kvIncrByFloat('treasury:balance', -treasury);
}
