/**
 * GET /api/v1/loans/list?wallet=<address>
 * List all loans for a wallet, with accrued interest calculated.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys } from '../../../../lib/kv';
import type { LoanRecord } from './create';

export const config = { maxDuration: 55 };

const DAILY_INTEREST = 0.005;

function withAccruedInterest(loan: LoanRecord): LoanRecord & { accrued_since_update: number } {
    if (loan.status !== 'active') return { ...loan, accrued_since_update: 0 };
    const days    = (Date.now() - loan.last_updated) / 86400_000;
    const accrued = loan.total_owed * DAILY_INTEREST * days;
    return {
        ...loan,
        interest_gstd:        loan.interest_gstd + accrued,
        total_owed:            parseFloat((loan.total_owed + accrued).toFixed(6)),
        health_factor:         parseFloat((loan.collateral_gstd / (loan.total_owed + accrued)).toFixed(4)),
        accrued_since_update:  parseFloat(accrued.toFixed(6)),
    };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { wallet } = req.query;
    if (!wallet || typeof wallet !== 'string') {
        return res.status(400).json({ error: 'wallet query param required' });
    }

    const walletKey  = wallet.toLowerCase();
    const [loanKeys, creditRaw, lockedRaw] = await Promise.all([
        kvKeys(`loan:${walletKey}:*`).catch(() => [] as string[]),
        kvGet(`credit:${walletKey}`).catch(() => '0'),
        kvGet(`locked:${walletKey}`).catch(() => '0'),
    ]);

    const loanRaws = await Promise.all(loanKeys.map(k => kvGet(k).catch(() => null)));
    const loans: Array<LoanRecord & { accrued_since_update: number }> = [];
    for (const raw of loanRaws) {
        if (!raw) continue;
        try {
            loans.push(withAccruedInterest(JSON.parse(raw as string)));
        } catch { /* skip */ }
    }

    loans.sort((a, b) => b.created_at - a.created_at);

    const active  = loans.filter(l => l.status === 'active');
    const repaid  = loans.filter(l => l.status === 'repaid');
    const totalDebt       = active.reduce((s, l) => s + l.total_owed, 0);
    const totalCollateral = active.reduce((s, l) => s + l.collateral_gstd, 0);

    return res.status(200).json({
        wallet,
        credit_balance:    creditRaw  ? parseFloat(creditRaw  as string) : 0,
        locked_collateral: lockedRaw  ? parseFloat(lockedRaw  as string) : 0,
        summary: {
            active_loans:         active.length,
            total_debt_gstd:      parseFloat(totalDebt.toFixed(4)),
            total_collateral_gstd: parseFloat(totalCollateral.toFixed(4)),
            overall_health_factor: totalDebt > 0 ? parseFloat((totalCollateral / totalDebt).toFixed(4)) : null,
        },
        active_loans:  active,
        repaid_loans:  repaid,
        terms: {
            ltv_ratio_pct:       70,
            daily_interest_pct:  0.5,
            min_loan_gstd:       1,
            liquidation_threshold: 1.0,
        },
        timestamp: Date.now(),
    });
}
