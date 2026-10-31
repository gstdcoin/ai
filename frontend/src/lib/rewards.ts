/**
 * Legacy reward balance readers and a non-executable settlement preview.
 *
 * Unfunded accrual is disabled here. Funded, accepted work settles atomically
 * through money.ts ledger reservations: 85% executor, 10% protocol, 5% reserve.
 * Current withdrawals use the authenticated owner-signed finance flow;
 * this legacy module neither dispatches payouts nor clears balances.
 */

import { kvGet, kvKeys } from './kv';

export const COMMUNITY_TAX     = 0.15;   // Legacy combined protocol/reserve share; not an accrual mechanism
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

/** Compatibility no-op. Free/unfunded work must not create monetary rewards. */
export async function accrueReward(
    nodeId:  string,
    wallet:  string,
    feeGstd: number = BASE_TASK_FEE,
    taskId?: string,
): Promise<{ nodeShare: number; communityShare: number }> {
    // Unfunded work has no monetary reward. Paid work settles through v2 escrow only.
    return { nodeShare: 0, communityShare: 0 };
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
