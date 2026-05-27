/**
 * F1 Reward Distribution — inspired by cosmos-sdk x/distribution
 *
 * Formula: nodeReward = jobFee × (1 - COMMUNITY_TAX) × (nodeComputePower / totalNetworkPower)
 *
 * In GSTD's simpler model each inference job has a fixed fee and a single executing node,
 * so the formula simplifies to: nodeReward = jobFee × (1 - COMMUNITY_TAX).
 * Community tax flows to the treasury for protocol development and grants.
 *
 * Rewards accumulate in Redis and are settled weekly via TON Jetton transfers.
 */

import { kvGet, kvSet, kvIncr, kvKeys } from './kv';

export const COMMUNITY_TAX     = 0.05;   // 5% to treasury
export const BASE_TASK_FEE     = 0.001;  // GSTD per completed inference task
export const SETTLEMENT_KEY    = 'rewards:settlement_epoch';

export interface RewardSnapshot {
    nodeId:        string;
    wallet:        string;
    accrued:       number;  // GSTD accumulated since last settlement
    totalLifetime: number;  // GSTD earned all-time
    lastAccrualAt: string;
}

export interface SettlementEntry {
    wallet:  string;
    amount:  number;  // GSTD to transfer
    nodeIds: string[];
}

/**
 * Accrue reward for a single completed inference job.
 * Adds nodeShare to node's pending balance and communityShare to treasury.
 * Idempotent per task_id — pass task_id to prevent double-counting.
 */
export async function accrueReward(
    nodeId:  string,
    wallet:  string,
    feeGstd: number = BASE_TASK_FEE,
    taskId?: string,
): Promise<{ nodeShare: number; communityShare: number }> {
    // Idempotency guard
    if (taskId) {
        const seen = await kvGet(`reward_seen:${taskId}`).catch(() => null);
        if (seen) return { nodeShare: 0, communityShare: 0 };
        await kvSet(`reward_seen:${taskId}`, '1', 86400 * 7).catch(() => {});
    }

    const nodeShare      = Math.round(feeGstd * (1 - COMMUNITY_TAX) * 1e6) / 1e6;
    const communityShare = Math.round(feeGstd * COMMUNITY_TAX * 1e6) / 1e6;
    const walletKey      = wallet.toLowerCase();

    await Promise.all([
        // Node's pending rewards (by wallet, for TON settlement)
        kvGet(`rewards:pending:${walletKey}`).then(async (raw) => {
            const current = raw ? parseFloat(raw as string) : 0;
            const next    = Math.round((current + nodeShare) * 1e6) / 1e6;
            await kvSet(`rewards:pending:${walletKey}`, String(next));
        }),
        // Node's lifetime earnings (by nodeId)
        kvGet(`rewards:lifetime:${nodeId}`).then(async (raw) => {
            const current = raw ? parseFloat(raw as string) : 0;
            const next    = Math.round((current + nodeShare) * 1e6) / 1e6;
            await kvSet(`rewards:lifetime:${nodeId}`, String(next));
        }),
        // Community treasury accumulator
        kvGet('rewards:treasury').then(async (raw) => {
            const current = raw ? parseFloat(raw as string) : 0;
            const next    = Math.round((current + communityShare) * 1e6) / 1e6;
            await kvSet('rewards:treasury', String(next));
        }),
        // Epoch counter for settlement tracking
        kvSet(`rewards:node_wallet:${nodeId}`, walletKey),
    ]).catch(() => {});

    return { nodeShare, communityShare };
}

/**
 * Read a node's pending (unsettled) reward balance for a wallet.
 */
export async function getPendingReward(wallet: string): Promise<number> {
    const raw = await kvGet(`rewards:pending:${wallet.toLowerCase()}`).catch(() => null);
    return raw ? parseFloat(raw as string) : 0;
}

/**
 * Read a node's lifetime total earnings.
 */
export async function getLifetimeReward(nodeId: string): Promise<number> {
    const raw = await kvGet(`rewards:lifetime:${nodeId}`).catch(() => null);
    return raw ? parseFloat(raw as string) : 0;
}

/**
 * Read the community treasury balance.
 */
export async function getTreasuryBalance(): Promise<number> {
    const raw = await kvGet('rewards:treasury').catch(() => null);
    return raw ? parseFloat(raw as string) : 0;
}

/**
 * Compute settlement amounts for all wallets with pending rewards above minAmount.
 * Returns list of {wallet, amount, nodeIds} to be sent as TON Jetton transfers.
 * Does NOT clear balances — call clearSettledRewards() after on-chain confirmation.
 */
export async function computeSettlement(
    minAmount: number = 0.01,
): Promise<SettlementEntry[]> {
    const walletKeys     = await kvKeys('rewards:pending:').catch(() => [] as string[]);
    const nodeWalletKeys = await kvKeys('rewards:node_wallet:').catch(() => [] as string[]);

    // Build wallet→nodeIds map once
    const walletNodes: Record<string, string[]> = {};
    await Promise.all(
        nodeWalletKeys.map(async (nk) => {
            const w = await kvGet(nk).catch(() => null);
            if (!w) return;
            const wallet = w as string;
            if (!walletNodes[wallet]) walletNodes[wallet] = [];
            walletNodes[wallet].push(nk.replace('rewards:node_wallet:', ''));
        })
    );

    const entries: SettlementEntry[] = [];
    await Promise.all(
        walletKeys.map(async (key) => {
            const wallet = key.replace('rewards:pending:', '');
            const raw    = await kvGet(key).catch(() => null);
            const amount = raw ? parseFloat(raw as string) : 0;
            if (amount < minAmount) return;
            entries.push({ wallet, amount, nodeIds: walletNodes[wallet] || [] });
        })
    );

    return entries.sort((a, b) => b.amount - a.amount);
}

/**
 * Zero out pending balances after on-chain settlement confirmation.
 * Pass the wallets that were successfully settled.
 */
export async function clearSettledRewards(
    wallets: string[],
    epochId: string,
): Promise<void> {
    await Promise.all(
        wallets.map((w) =>
            kvSet(`rewards:pending:${w.toLowerCase()}`, '0').catch(() => {})
        )
    );
    await kvSet(SETTLEMENT_KEY, epochId).catch(() => {});
}
