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

import { Cell, Address, beginCell } from '@ton/core';
import { TonClient } from '@ton/ton';

const TREASURY_WALLET = process.env.TREASURY_WALLET_ADDRESS || '';
const JETTON_ADDRESS  = process.env.GSTD_JETTON_ADDRESS || '';
const TREASURY_SECRET = process.env.TREASURY_SECRET || '';
const SWARM_URL       = (process.env.GSTD_SWARM_URL || 'https://app.gstdtoken.com').replace(/\/$/, '');
const TONCENTER_KEY   = process.env.TONCENTER_API_KEY ? `&api_key=${process.env.TONCENTER_API_KEY}` : '';
const POLL_INTERVAL   = 60_000; // 1 minute

const TONCENTER_BASE  = `https://toncenter.com/api/v2`;

let lastLt = '0';
// The treasury's own GSTD jetton wallet -- a TransferNotification only
// really proves a deposit if it was sent by THIS address. Without checking
// it, anyone could send an arbitrary internal message shaped like a
// TransferNotification straight to TREASURY_WALLET and fake a deposit of
// any size. Resolved once at startup in main() since it never changes.
let treasuryJettonWallet: string | null = null;

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

// TEP-74 TransferNotification, sent by the treasury's OWN jetton wallet to
// notify it of a completed incoming transfer:
//   transfer_notification#7362d09c query_id:uint64 amount:(VarUInteger 16)
//     sender:MsgAddress forward_payload:(Either Cell ^Cell)
const TRANSFER_NOTIFICATION_OP = 0x7362d09c;

function parseJettonTransfer(tx: any): { fromWallet: string; amountGstd: number; txHash: string; memo?: string } | null {
    try {
        const inMsg = tx.in_msg;
        if (!inMsg?.msg_data?.body) return null;

        // Check if lt is new
        if (tx.transaction_id?.lt <= lastLt) return null;

        // Only trust a notification that really came from the treasury's own
        // jetton wallet -- otherwise anyone could send an arbitrary message
        // shaped like a TransferNotification straight to TREASURY_WALLET and
        // fake a deposit of any size.
        const msgSource = (inMsg.source?.account_address || '').trim();
        if (!treasuryJettonWallet || !msgSource) return null;
        if (!Address.parse(msgSource).equals(Address.parse(treasuryJettonWallet))) return null;

        // The previous version read inMsg.value (the TON attached to this
        // notification message, typically a small forward_ton_amount) as if
        // it were the GSTD amount, and inMsg.source (the treasury's OWN
        // jetton wallet, which is what actually sends this notification) as
        // if it were the depositor -- both wrong. The real amount and real
        // sender are inside the message body per TEP-74, decoded here.
        const cell  = Cell.fromBoc(Buffer.from(inMsg.msg_data.body, 'base64'))[0];
        const slice = cell.beginParse();

        const op = slice.loadUint(32);
        if (op !== TRANSFER_NOTIFICATION_OP) return null; // not a jetton deposit notification

        slice.loadUint(64);                 // query_id — unused
        const amountNano = slice.loadCoins();
        const senderAddr  = slice.loadAddress();

        if (amountNano <= 0n) return null;

        const amountGstd = Number(amountNano) / 1e9;
        const fromWallet = senderAddr.toString();
        const txHash      = tx.transaction_id?.hash || '';

        // Optional memo: forward_payload, if present as an in-line comment cell
        let memo: string | undefined;
        try {
            const hasPayload = slice.loadBit();
            if (hasPayload && slice.remainingBits >= 32) {
                const payloadOp = slice.loadUint(32);
                if (payloadOp === 0) memo = slice.loadStringTail()?.trim() || undefined; // 0 = plain text comment
            }
        } catch { /* no/unparseable forward_payload — memo stays undefined */ }

        if (!fromWallet || !txHash) return null;
        return { fromWallet, amountGstd, txHash, memo };
    } catch {
        return null; // malformed body / not a jetton notification — skip, don't credit
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
    if (!JETTON_ADDRESS) {
        console.error('[Monitor] GSTD_JETTON_ADDRESS not set — cannot verify deposit notifications, refusing to start');
        return;
    }

    const client = new TonClient({
        endpoint: 'https://toncenter.com/api/v2/jsonRPC',
        apiKey:   process.env.TONCENTER_API_KEY,
    });
    const result = await client.runMethod(Address.parse(JETTON_ADDRESS), 'get_wallet_address', [
        { type: 'slice', cell: beginCell().storeAddress(Address.parse(TREASURY_WALLET)).endCell() },
    ]);
    treasuryJettonWallet = result.stack.readAddress().toString();
    console.log(`[Monitor] Treasury's GSTD jetton wallet: ${treasuryJettonWallet}`);

    // Initial poll
    await poll();

    // Periodic poll
    setInterval(poll, POLL_INTERVAL);
}

main().catch(console.error);
