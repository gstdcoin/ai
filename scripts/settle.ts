#!/usr/bin/env tsx
/**
 * GSTD settlement plan inspector.
 * Reads pending rewards from app.gstdtoken.com/api/v1/nodes/rewards/settle.
 *
 * Dry-run only. Live transfers remain disabled until payouts are reserved
 * atomically and on-chain receipts can be independently verified.
 *   npx tsx scripts/settle.ts --dry-run
 *
 * Env vars required:
 *   TREASURY_SECRET            — matches the platform treasury secret
 *   GSTD_SWARM_URL             — https://app.gstdtoken.com
 */

const SWARM_URL      = (process.env.GSTD_SWARM_URL || 'https://app.gstdtoken.com').replace(/\/$/, '');
const TREASURY_SECRET = process.env.TREASURY_SECRET || '';
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
    // /settle only returns a read-only plan and never clears balances.
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

async function main() {
    if (!DRY_RUN) {
        console.error('Live settlement is disabled until atomic payout reservations and independent on-chain receipt verification are implemented. Use --dry-run to inspect the current plan.');
        process.exitCode = 1;
        return;
    }
    if (!TREASURY_SECRET) { console.error('TREASURY_SECRET env var required'); process.exit(1); }

    console.log(`[Settle] Fetching settlement plan from ${SWARM_URL}...`);
    const plan = await fetchSettlementPlan();

    const payouts = (plan.entries || []).filter(e => e.amount_gstd >= MIN_PAYOUT);
    console.log(`[Settle] Epoch: ${plan.epoch}`);
    console.log(`[Settle] Total GSTD to distribute: ${plan.total}`);
    console.log(`[Settle] Treasury balance: ${plan.treasury}`);
    console.log(`[Settle] Payouts (≥${MIN_PAYOUT} GSTD): ${payouts.length}`);
    payouts.forEach(e => console.log(`  → ${e.wallet}: ${e.amount_gstd} GSTD`));

    console.log('\n[Settle] DRY RUN — no transactions sent; balances are unchanged.');
}

main().catch(err => { console.error(err); process.exit(1); });
