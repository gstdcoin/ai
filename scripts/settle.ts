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

// TEP-74: a Transfer message (op 0xf8a7ea5) must go to the SENDER'S OWN
// jetton wallet (which then forwards to the recipient's jetton wallet),
// never to the jetton master directly -- the master doesn't implement the
// wallet-side transfer receive handler at all.
async function getJettonWalletAddress(client: TonClient, jettonMaster: Address, owner: Address): Promise<Address> {
    const result = await client.runMethod(jettonMaster, 'get_wallet_address', [
        { type: 'slice', cell: beginCell().storeAddress(owner).endCell() },
    ]);
    return result.stack.readAddress();
}

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
    entries:  SettlementEntry[];
    treasury: number;
    total:    number;
    epoch:    string;
}

async function fetchSettlementPlan(): Promise<SettleApiResponse> {
    // /settle only ever returns a plan now -- it never clears balances.
    // See confirmSettled() below for the step that actually clears them,
    // called only for wallets whose transfer really succeeded.
    const resp = await fetch(`${SWARM_URL}/api/v1/nodes/rewards/settle`, {
        method:  'POST',
        headers: {
            'Content-Type':    'application/json',
            'x-treasury-secret': TREASURY_SECRET,
        },
        body: JSON.stringify({}),
    });
    if (!resp.ok) throw new Error(`Settlement API ${resp.status}: ${await resp.text()}`);
    return resp.json() as Promise<SettleApiResponse>;
}

async function confirmSettled(epoch: string, wallets: string[]): Promise<void> {
    if (wallets.length === 0) return;
    const resp = await fetch(`${SWARM_URL}/api/v1/nodes/rewards/confirm-settlement`, {
        method:  'POST',
        headers: {
            'Content-Type':      'application/json',
            'x-treasury-secret': TREASURY_SECRET,
        },
        body: JSON.stringify({ epoch, wallets }),
    });
    if (!resp.ok) throw new Error(`Confirm-settlement API ${resp.status}: ${await resp.text()}`);
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
    console.log(`[Settle] Total GSTD to distribute: ${plan.total}`);
    console.log(`[Settle] Treasury balance: ${plan.treasury}`);
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
    const settlementJettonWallet = await getJettonWalletAddress(client, jettonMaster, wallet.address);
    console.log(`[Settle] Settlement wallet's GSTD jetton wallet: ${settlementJettonWallet.toString()}`);

    let sentCount = 0;
    // Only wallets that get pushed here have their pending balance cleared
    // (see confirmSettled() below) -- a skipped or failed entry keeps its
    // balance intact so it's retried on the next run instead of being lost.
    const confirmedWallets: string[] = [];
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
                    to:    settlementJettonWallet,
                    value: toNano('0.05'),
                    body:  buildJettonTransferBody(toAddr, nanoAmount),
                })],
            });
            console.log(`  ✓ Sent ${entry.amount_gstd} GSTD → ${entry.wallet}`);
            sentCount++;
            confirmedWallets.push(entry.wallet);
            await new Promise(r => setTimeout(r, 2000)); // avoid rate limit
        } catch (e: any) {
            console.error(`  ✗ Failed for ${entry.wallet}: ${e.message}`);
        }
    }

    // Note: sendTransfer() not throwing only confirms the settlement
    // wallet's outgoing message was accepted, not that the jetton wallet
    // contract actually processed it on-chain (that happens in a later
    // block). This is an existing limitation of this script's fire-and-
    // forget model, not something newly introduced here -- a genuinely
    // airtight version would poll for on-chain confirmation before
    // clearing. What this fix guarantees is the narrower, still important
    // property: balances are never cleared before a transfer was even
    // attempted, which was the actual bug.
    await confirmSettled(plan.epoch, confirmedWallets);

    console.log(`\n[Settle] Done. Sent ${sentCount}/${payouts.length} transfers. Cleared ${confirmedWallets.length} balances.`);
}

main().catch(err => { console.error(err); process.exit(1); });
