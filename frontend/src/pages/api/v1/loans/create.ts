/**
 * POST /api/v1/loans/create
 * Take a loan collateralized by GSTD tokens.
 *
 * Mechanics:
 * - User locks GSTD as collateral (stored in KV, on-chain after contract deploy)
 * - Receives a credit balance equal to collateral_gstd × LTV_RATIO
 * - Credit used to pay for AI queries, storage, compute fees in the network
 * - Interest accrues daily; repay anytime via /api/v1/loans/repay
 * - If health_factor < 1.0, collateral is liquidated to cover debt
 *
 * LTV ratio: 70% (borrow 70 GSTD credit per 100 GSTD locked)
 * Interest:  0.5% per day (annualised ~182%)
 * Min loan:  1 GSTD
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvIncr } from '../../../../lib/kv';

const LTV_RATIO      = 0.70;  // max credit = 70% of collateral
const DAILY_INTEREST = 0.005; // 0.5% per day
const MIN_LOAN_GSTD  = 1;

export interface LoanRecord {
    loan_id:         string;
    wallet:          string;
    collateral_gstd: number;
    principal_gstd:  number;   // amount borrowed (= collateral × LTV)
    interest_gstd:   number;   // accrued so far
    total_owed:      number;   // principal + interest
    health_factor:   number;   // collateral_value / total_owed; liquidate if < 1
    status:          'active' | 'repaid' | 'liquidated';
    created_at:      number;
    last_updated:    number;
    repaid_at:       number | null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { wallet, collateral_gstd } = req.body as { wallet?: string; collateral_gstd?: number };

    if (!wallet || typeof wallet !== 'string') {
        return res.status(400).json({ error: 'wallet is required' });
    }
    const collateral = Number(collateral_gstd);
    if (!collateral || collateral < MIN_LOAN_GSTD) {
        return res.status(400).json({ error: `collateral_gstd must be at least ${MIN_LOAN_GSTD}` });
    }

    const walletKey = wallet.toLowerCase();

    // Check user has enough GSTD to lock as collateral
    const balRaw = await kvGet(`balance:${walletKey}`).catch(() => null);
    const balance = balRaw ? parseFloat(balRaw as string) : 0;

    if (balance < collateral) {
        return res.status(402).json({
            error:   'Insufficient GSTD balance for collateral',
            balance_gstd:    balance,
            required_gstd:   collateral,
            how_to_earn:     'Run a node (mobile or desktop) to earn GSTD. No initial tokens needed.',
        });
    }

    // Check for existing active loans (limit 3 concurrent)
    const loanKeys = await import('../../../../lib/kv').then(m => m.kvKeys(`loan:${walletKey}:*`)).catch(() => [] as string[]);
    const activeLoans: LoanRecord[] = [];
    for (const k of loanKeys) {
        const raw = await kvGet(k).catch(() => null);
        if (!raw) continue;
        try {
            const l = JSON.parse(raw as string) as LoanRecord;
            if (l.status === 'active') activeLoans.push(l);
        } catch { /* skip */ }
    }
    if (activeLoans.length >= 3) {
        return res.status(409).json({
            error:        'Maximum 3 active loans per wallet',
            active_loans: activeLoans.length,
        });
    }

    // Lock collateral — deduct from balance
    const newBalance = balance - collateral;
    await kvSet(`balance:${walletKey}`, String(newBalance));

    // Add to locked collateral tracker
    const lockedRaw = await kvGet(`locked:${walletKey}`).catch(() => '0');
    const newLocked = (lockedRaw ? parseFloat(lockedRaw as string) : 0) + collateral;
    await kvSet(`locked:${walletKey}`, String(newLocked));

    const principal = parseFloat((collateral * LTV_RATIO).toFixed(4));
    const loanId    = `loan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const loan: LoanRecord = {
        loan_id:         loanId,
        wallet:          walletKey,
        collateral_gstd: collateral,
        principal_gstd:  principal,
        interest_gstd:   0,
        total_owed:      principal,
        health_factor:   parseFloat((collateral / principal).toFixed(4)),
        status:          'active',
        created_at:      Date.now(),
        last_updated:    Date.now(),
        repaid_at:       null,
    };

    await kvSet(`loan:${walletKey}:${loanId}`, JSON.stringify(loan));

    // Credit the borrowed amount to the user's query/service balance
    const creditRaw = await kvGet(`credit:${walletKey}`).catch(() => '0');
    const newCredit = (creditRaw ? parseFloat(creditRaw as string) : 0) + principal;
    await kvSet(`credit:${walletKey}`, String(newCredit));

    await kvIncr('stats:total_loans');

    return res.status(201).json({
        loan_id:         loanId,
        collateral_gstd: collateral,
        borrowed_gstd:   principal,
        credit_balance:  newCredit,
        daily_interest_pct: DAILY_INTEREST * 100,
        health_factor:   loan.health_factor,
        liquidation_at_gstd_price_drop_pct: parseFloat(((1 - 1 / (1 / LTV_RATIO)) * 100).toFixed(1)),
        message:         `${principal} GSTD credit added to your balance. Use it for AI queries, storage, compute fees.`,
        repay_endpoint:  'POST /api/v1/loans/repay',
        contracts_note:  'Collateral held in KV. On-chain escrow activates after TON contract deployment.',
    });
}
