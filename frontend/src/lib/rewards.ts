/**
 * F1 Reward Distribution — inspired by cosmos-sdk x/distribution
 *
 * Formula: nodeReward = jobFee × (1 - COMMUNITY_TAX) × (nodeComputePower / totalNetworkPower)
 *
 * In GSTD's simpler model each inference job has a fixed fee and a single executing node,
 * so the formula simplifies to: nodeReward = jobFee × (1 - COMMUNITY_TAX).
 * Community tax flows to the treasury for protocol development and grants.
 *
 * Rewards accumulate in Redis. Payouts remain disabled until a verified,
 * idempotent on-chain settlement flow is available.
 */

import { kvGet, kvSet, kvKeys, kvIncrByFloat, kvAccrueTaskReward } from './kv';

export const COMMUNITY_TAX     = 0.05;   // 5% to treasury
export const BASE_TASK_FEE     = 0.001;  // GSTD per completed inference task
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
    const nodeShare      = Math.round(feeGstd * (1 - COMMUNITY_TAX) * 1e6) / 1e6;
    const communityShare = Math.round(feeGstd * COMMUNITY_TAX * 1e6) / 1e6;
    const walletKey      = wallet.toLowerCase();

    if (taskId) {
        const credited = await kvAccrueTaskReward(
            taskId, walletKey, nodeId, nodeShare, communityShare, feeGstd,
        );
        return credited
            ? { nodeShare, communityShare }
            : { nodeShare: 0, communityShare: 0 };
    }

    await Promise.all([
        kvIncrByFloat(`rewards:pending:${walletKey}`, nodeShare),
        kvIncrByFloat(`rewards:lifetime:${nodeId}`, nodeShare),
        kvIncrByFloat('rewards:treasury', communityShare),
        kvIncrByFloat('stats:total_gstd_paid', feeGstd),
        kvSet(`rewards:node_wallet:${nodeId}`, walletKey),
    ]);

    return { nodeShare, communityShare };
}

/**
 * Read a node's pending (unsettled) reward balance for a wallet.
 */
export async function getPendingReward(wallet: string): Promise<number> {
    const raw = await kvGet(`rewards:pending:${wallet.toLowerCase()}`);
    return raw ? parseFloat(raw as string) : 0;
}

/**
 * Read a node's lifetime total earnings.
 */
export async function getLifetimeReward(nodeId: string): Promise<number> {
    const raw = await kvGet(`rewards:lifetime:${nodeId}`);
    return raw ? parseFloat(raw as string) : 0;
}

/**
 * Read the community treasury balance.
 */
export async function getTreasuryBalance(): Promise<number> {
    const raw = await kvGet('rewards:treasury');
    return raw ? parseFloat(raw as string) : 0;
}

/**
 * Compute settlement amounts for all wallets with pending rewards above minAmount.
 * Returns list of {wallet, amount, nodeIds} to be sent as TON Jetton transfers.
 * This is a read-only plan. No current API clears balances after a transfer.
 */
export async function computeSettlement(
    minAmount: number = 0.01,
): Promise<SettlementEntry[]> {
    const walletKeys     = await kvKeys('rewards:pending:');
    const nodeWalletKeys = await kvKeys('rewards:node_wallet:');

    // Build wallet→nodeIds map once
    const walletNodes: Record<string, string[]> = {};
    await Promise.all(
        nodeWalletKeys.map(async (nk) => {
            const w = await kvGet(nk);
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
            const raw    = await kvGet(key);
            const amount = raw ? parseFloat(raw as string) : 0;
            if (amount < minAmount) return;
            entries.push({ wallet, amount, nodeIds: walletNodes[wallet] || [] });
        })
    );

    return entries.sort((a, b) => b.amount - a.amount);
}
