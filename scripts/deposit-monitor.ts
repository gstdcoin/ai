#!/usr/bin/env tsx
/**
 * GSTD Deposit Monitor
 * Watches the ecosystem treasury wallet for incoming GSTD Jetton transfers.
 * When a deposit is detected, calls ton-webhook to credit the sender's account.
 *
 * Run on Pi (keep alive with pm2):
 *   pm2 start scripts/deposit-monitor.ts --interpreter=tsx --name gstd-monitor
 *
 * Env vars:
 *   TREASURY_WALLET_ADDRESS — TON address to watch for incoming GSTD
 *   GSTD_JETTON_ADDRESS     — Jetton master address
 *   TREASURY_SECRET         — secret for /api/v1/credits/ton-webhook
 *   GSTD_SWARM_URL          — https://app.gstdtoken.com
 *   TONCENTER_API_KEY       — optional, raises rate limit
 */

const TREASURY_WALLET = process.env.TREASURY_WALLET_ADDRESS || '';
const JETTON_ADDRESS  = process.env.GSTD_JETTON_ADDRESS || '';
const TREASURY_SECRET = process.env.TREASURY_SECRET || '';
const SWARM_URL       = (process.env.GSTD_SWARM_URL || 'https://app.gstdtoken.com').replace(/\/$/, '');
const TONCENTER_KEY   = process.env.TONCENTER_API_KEY ? `&api_key=${process.env.TONCENTER_API_KEY}` : '';
const POLL_INTERVAL   = 60_000; // 1 minute

const TONCENTER_BASE  = `https://toncenter.com/api/v2`;

let lastLt = '0';

async function fetchRecentJettonTxs(): Promise<any[]> {
    try {
        const url = `${TONCENTER_BASE}/getTransactions?address=${TREASURY_WALLET}&limit=20&archival=false${TONCENTER_KEY}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!resp.ok) return [];
        const data: any = await resp.json();
        return (data.result || []);
    } catch {
        return [];
    }
}

function parseJettonTransfer(tx: any): { fromWallet: string; amountGstd: number; txHash: string; memo?: string } | null {
    try {
        // Jetton transfers arrive as inbound messages with specific opcode
        const inMsg = tx.in_msg;
        if (!inMsg?.msg_data?.body) return null;

        // Check if lt is new
        if (tx.transaction_id?.lt <= lastLt) return null;

        // Simple heuristic: if msg has value and looks like Jetton transfer
        // Full TEP-74 parsing would require BOC decoding — use amount from API
        const amountNano = parseInt(inMsg.value || '0', 10);
        if (amountNano < 1000) return null; // dust

        const amountGstd = amountNano / 1e9;
        const fromWallet = inMsg.source?.account_address || '';
        const txHash     = tx.transaction_id?.hash || '';
        const memo       = inMsg.message?.trim() || undefined;

        if (!fromWallet || !txHash) return null;
        return { fromWallet, amountGstd, txHash, memo };
    } catch {
        return null;
    }
}

async function notifyWebhook(deposit: { fromWallet: string; amountGstd: number; txHash: string; memo?: string }) {
    try {
        const resp = await fetch(`${SWARM_URL}/api/v1/credits/ton-webhook`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secret:       TREASURY_SECRET,
                from_wallet:  deposit.fromWallet,
                amount_gstd:  deposit.amountGstd,
                tx_hash:      deposit.txHash,
                memo:         deposit.memo,
            }),
            signal: AbortSignal.timeout(10_000),
        });
        const data: any = await resp.json();
        if (data.ok && !data.duplicate) {
            console.log(`[Monitor] Credited ${deposit.amountGstd} GSTD to ${data.credited_wallet} | tx: ${deposit.txHash.slice(0, 12)}...`);
        } else if (data.duplicate) {
            // already processed
        } else {
            console.warn(`[Monitor] Webhook error:`, data);
        }
    } catch (e: any) {
        console.error(`[Monitor] Webhook failed: ${e.message}`);
    }
}

async function poll() {
    if (!TREASURY_WALLET) { console.error('[Monitor] TREASURY_WALLET_ADDRESS not set'); return; }

    const txs = await fetchRecentJettonTxs();

    // Process new transactions (newest first in API response)
    let newLt = lastLt;
    for (const tx of txs) {
        const lt = tx.transaction_id?.lt || '0';
        if (lt <= lastLt) continue;

        const deposit = parseJettonTransfer(tx);
        if (deposit) {
            await notifyWebhook(deposit);
        }
        if (lt > newLt) newLt = lt;
    }
    if (newLt > lastLt) {
        lastLt = newLt;
    }
}

async function main() {
    console.log(`[Monitor] GSTD Deposit Monitor started`);
    console.log(`[Monitor] Watching: ${TREASURY_WALLET || '(not configured)'}`);
    console.log(`[Monitor] Poll interval: ${POLL_INTERVAL / 1000}s`);

    if (!TREASURY_WALLET || !TREASURY_SECRET) {
        console.warn('[Monitor] Warning: TREASURY_WALLET_ADDRESS or TREASURY_SECRET not set — monitor will log but not credit');
    }

    // Initial poll
    await poll();

    // Periodic poll
    setInterval(poll, POLL_INTERVAL);
}

main().catch(console.error);
