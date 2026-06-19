#!/usr/bin/env tsx
/**
 * GSTD Settlement Script
 * Reads pending rewards from app.gstdtoken.com/api/v1/nodes/rewards/settle
 * and sends GSTD Jetton transfers to node operators via TON blockchain.
 *
 * Run weekly on Pi (where SETTLEMENT_WALLET_MNEMONIC is stored safely):
 *   npx tsx scripts/settle.ts [--dry-run]
 *
 * Env vars required:
 *   SETTLEMENT_WALLET_MNEMONIC — space-separated 24-word TON mnemonic
 *   TREASURY_SECRET            — matches Vercel env var
 *   GSTD_SWARM_URL             — https://app.gstdtoken.com
 *   GSTD_JETTON_ADDRESS        — Jetton master contract address
 */

import { TonClient, WalletContractV4, internal, toNano, Address, beginCell } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';

const SWARM_URL      = (process.env.GSTD_SWARM_URL || 'https://app.gstdtoken.com').replace(/\/$/, '');
const TREASURY_SECRET = process.env.TREASURY_SECRET || '';
const JETTON_ADDRESS  = process.env.GSTD_JETTON_ADDRESS || '';
const MNEMONIC        = process.env.SETTLEMENT_WALLET_MNEMONIC || '';
const DRY_RUN         = process.argv.includes('--dry-run');
const MIN_PAYOUT      = 0.1; // GSTD — skip wallets below this amount

interface SettlementEntry {
    wallet:      string;
    amount_gstd: number;
}

interface SettleApiResponse {
    entries:          SettlementEntry[];
    treasury_balance: number;
    total_gstd:       number;
    epoch:            string;
}

async function fetchSettlementPlan(): Promise<SettleApiResponse> {
    const resp = await fetch(`${SWARM_URL}/api/v1/nodes/rewards/settle`, {
        method:  'POST',
        headers: {
            'Content-Type':    'application/json',
            'x-treasury-secret': TREASURY_SECRET,
        },
        body: JSON.stringify({ dry_run: false }),
    });
    if (!resp.ok) throw new Error(`Settlement API ${resp.status}: ${await resp.text()}`);
    return resp.json() as Promise<SettleApiResponse>;
}

// Build Jetton transfer message (TEP-74)
function buildJettonTransferBody(toAddress: Address, amount: bigint): import('@ton/core').Cell {
    return beginCell()
        .storeUint(0x0f8a7ea5, 32)   // op: transfer
        .storeUint(0, 64)             // query_id
        .storeCoins(amount)           // amount in nano-GSTD (9 decimals)
        .storeAddress(toAddress)      // destination
        .storeAddress(null)           // response_destination
        .storeBit(false)              // no custom payload
        .storeCoins(toNano('0.001')) // forward TON amount
        .storeBit(false)             // no forward payload
        .endCell();
}

async function main() {
    if (!TREASURY_SECRET) { console.error('TREASURY_SECRET env var required'); process.exit(1); }

    console.log(`[Settle] Fetching settlement plan from ${SWARM_URL}...`);
    const plan = await fetchSettlementPlan();

    const payouts = (plan.entries || []).filter(e => e.amount_gstd >= MIN_PAYOUT);
    console.log(`[Settle] Epoch: ${plan.epoch}`);
    console.log(`[Settle] Total GSTD to distribute: ${plan.total_gstd}`);
    console.log(`[Settle] Treasury balance: ${plan.treasury_balance}`);
    console.log(`[Settle] Payouts (≥${MIN_PAYOUT} GSTD): ${payouts.length}`);
    payouts.forEach(e => console.log(`  → ${e.wallet}: ${e.amount_gstd} GSTD`));

    if (DRY_RUN) {
        console.log('\n[Settle] DRY RUN — no transactions sent.');
        return;
    }

    if (payouts.length === 0) {
        console.log('[Settle] Nothing to settle.');
        return;
    }

    if (!MNEMONIC) { console.error('SETTLEMENT_WALLET_MNEMONIC env var required for live run'); process.exit(1); }
    if (!JETTON_ADDRESS) { console.error('GSTD_JETTON_ADDRESS env var required'); process.exit(1); }

    // Connect to TON mainnet
    const client = new TonClient({
        endpoint: 'https://toncenter.com/api/v2/jsonRPC',
        apiKey:   process.env.TONCENTER_API_KEY,
    });

    const keyPair = await mnemonicToPrivateKey(MNEMONIC.split(' '));
    const wallet  = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const contract = client.open(wallet);

    const seqno = await contract.getSeqno();
    console.log(`\n[Settle] Wallet: ${wallet.address.toString()}`);
    console.log(`[Settle] Seqno: ${seqno}`);

    const jettonMaster = Address.parse(JETTON_ADDRESS);

    let sentCount = 0;
    for (const entry of payouts) {
        let toAddr: Address;
        try {
            toAddr = Address.parse(entry.wallet);
        } catch {
            console.warn(`  ⚠ Invalid address skipped: ${entry.wallet}`);
            continue;
        }

        const nanoAmount = BigInt(Math.round(entry.amount_gstd * 1e9));

        try {
            await contract.sendTransfer({
                seqno: seqno + sentCount,
                secretKey: keyPair.secretKey,
                messages: [internal({
                    to:    jettonMaster,
                    value: toNano('0.05'),
                    body:  buildJettonTransferBody(toAddr, nanoAmount),
                })],
            });
            console.log(`  ✓ Sent ${entry.amount_gstd} GSTD → ${entry.wallet}`);
            sentCount++;
            await new Promise(r => setTimeout(r, 2000)); // avoid rate limit
        } catch (e: any) {
            console.error(`  ✗ Failed for ${entry.wallet}: ${e.message}`);
        }
    }

    console.log(`\n[Settle] Done. Sent ${sentCount}/${payouts.length} transfers.`);
}

main().catch(err => { console.error(err); process.exit(1); });
