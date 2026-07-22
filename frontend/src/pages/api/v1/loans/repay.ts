/**
 * POST /api/v1/loans/repay
 * Repay an active GSTD loan, fully or partially.
 * Releases proportional collateral back to user's wallet.
 *
 * Body: { wallet, loan_id, repay_gstd }
 * - repay_gstd: amount of GSTD credit to repay (use "all" in body for full repayment)
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet } from '../../../../lib/kv';
import type { LoanRecord } from './create';

export const config = { maxDuration: 55 };

const DAILY_INTEREST = 0.005;

function accrueInterest(loan: LoanRecord): LoanRecord {
    const daysElapsed = (Date.now() - loan.last_updated) / 86400_000;
    const newInterest = loan.total_owed * DAILY_INTEREST * daysElapsed;
    const updated = {
        ...loan,
        interest_gstd: loan.interest_gstd + newInterest,
        total_owed:    loan.total_owed + newInterest,
        health_factor: parseFloat((loan.collateral_gstd / (loan.total_owed + newInterest)).toFixed(4)),
        last_updated:  Date.now(),
    };
    return updated;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { wallet, loan_id, repay_gstd } = req.body as {
        wallet?: string; loan_id?: string; repay_gstd?: number | 'all';
    };

    if (!wallet || !loan_id) {
        return res.status(400).json({ error: 'wallet and loan_id are required' });
    }

    const walletKey = wallet.toLowerCase();
    const loanKey   = `loan:${walletKey}:${loan_id}`;

    // Independent reads -- run concurrently (each KV round-trip is slow, ~5s).
    // credit/balance/locked don't depend on the loan lookup, so fetch them all
    // up front instead of serially after validating the loan.
    const [raw, creditRaw, balRaw, lockedRaw] = await Promise.all([
        kvGet(loanKey).catch(() => null),
        kvGet(`credit:${walletKey}`).catch(() => '0'),
        kvGet(`balance:${walletKey}`).catch(() => '0'),
        kvGet(`locked:${walletKey}`).catch(() => '0'),
    ]);

    if (!raw) return res.status(404).json({ error: 'Loan not found' });

    let loan = JSON.parse(raw as string) as LoanRecord;
    if (loan.status !== 'active') {
        return res.status(409).json({ error: `Loan is ${loan.status}`, loan_id });
    }

    // Accrue interest to current moment
    loan = accrueInterest(loan);

    const repayAmount = repay_gstd === 'all' ? loan.total_owed : Number(repay_gstd);
    if (!repayAmount || repayAmount <= 0) {
        return res.status(400).json({ error: 'repay_gstd must be a positive number or "all"' });
    }

    // Check user has enough credit balance to repay
    const creditBalance = creditRaw ? parseFloat(creditRaw as string) : 0;
    const actualRepay   = Math.min(repayAmount, loan.total_owed, creditBalance);

    if (actualRepay < 0.0001) {
        return res.status(402).json({
            error:          'Insufficient credit balance to repay',
            credit_balance: creditBalance,
            total_owed:     loan.total_owed,
        });
    }

    // Calculate collateral released proportionally
    const repayFraction = actualRepay / loan.total_owed;
    const collateralReleased = parseFloat((loan.collateral_gstd * repayFraction).toFixed(4));
    const fullyRepaid = actualRepay >= loan.total_owed - 0.0001;

    const balance = balRaw ? parseFloat(balRaw as string) : 0;
    const locked  = lockedRaw ? parseFloat(lockedRaw as string) : 0;

    // Update loan record
    if (fullyRepaid) {
        loan.status          = 'repaid';
        loan.total_owed      = 0;
        loan.collateral_gstd = 0;
        loan.repaid_at       = Date.now();
    } else {
        loan.total_owed  -= actualRepay;
        loan.collateral_gstd -= collateralReleased;
        loan.health_factor = loan.collateral_gstd > 0
            ? parseFloat((loan.collateral_gstd / loan.total_owed).toFixed(4))
            : 0;
    }

    // Independent writes -- run concurrently for the same reason as the reads above
    await Promise.all([
        kvSet(`credit:${walletKey}`, String(Math.max(0, creditBalance - actualRepay))),
        kvSet(`balance:${walletKey}`, String(balance + collateralReleased)),
        kvSet(`locked:${walletKey}`, String(Math.max(0, locked - collateralReleased))),
        kvSet(loanKey, JSON.stringify(loan)),
    ]);

    return res.status(200).json({
        loan_id,
        repaid_gstd:          actualRepay,
        collateral_released:  collateralReleased,
        remaining_debt:       fullyRepaid ? 0 : loan.total_owed,
        remaining_collateral: loan.collateral_gstd,
        health_factor:        loan.health_factor,
        status:               loan.status,
        message: fullyRepaid
            ? `Loan fully repaid. ${collateralReleased} GSTD collateral returned to your wallet.`
            : `Partial repayment. ${collateralReleased} GSTD released. ${loan.total_owed.toFixed(4)} GSTD still owed.`,
    });
}
