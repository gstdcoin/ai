import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../lib/kv';
import { sessionWallet } from '../../../../lib/walletSession';
import { MoneyError, readMoneySystem, reconcileMoney, moneyBalance, walletId } from '../../../../lib/money';
import { custodySnapshot, verifyDeposit } from '../../../../lib/custody';
export default async function handler(req: NextApiRequest,res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const wallet = await sessionWallet(req.headers);
    if (!wallet) return res.status(401).json({ error: 'Verified TON session required' });
    try {
        const hash = String(req.body?.tx_hash || '').toLowerCase();
        if (!/^[a-f0-9]{64}$/.test(hash)) throw new MoneyError('invalid_transaction_hash');
        const previous = await kvGet('money:v2:allocation:deposit:' + hash);
        if (previous) {
            const receipt = JSON.parse(previous);
            if (receipt.wallet !== walletId(wallet)) throw new MoneyError('deposit_sender_mismatch');
            return res.status(200).json({ ok: true, duplicate: true, tx_hash: hash,
                amount_nano: receipt.amount, ...await moneyBalance(wallet) });
        }
        const system = await readMoneySystem();
        if (!system?.migrationReviewed) throw new MoneyError('backing_not_reconciled');
        const proof = await verifyDeposit(String(req.body?.tx_hash || ''),wallet,system.jettonWallet);
        if (proof.utime < Math.floor(system.openedAt / 1000)) throw new MoneyError('legacy_deposit_requires_reconciliation');
        // Recheck actual custody after verifying the receipt. Never convert TON/Stars at a guessed rate.
        const snapshot = await custodySnapshot(system.owner);
        if (snapshot.jettonWallet !== system.jettonWallet) throw new MoneyError('custody_mismatch');
        await reconcileMoney(snapshot,{ manifest: 'deposit-' + proof.hash, legacyHold: system.legacyHold,
            migrationReviewed: true, preserveLegacyHold: true, allocations: [{ wallet: walletId(wallet), amount_nano: proof.amount, reference: 'deposit:' + proof.hash }] });
        return res.status(200).json({ ok: true, tx_hash: proof.hash, amount_nano: proof.amount, ...await moneyBalance(wallet) });
    } catch (error) {
        return res.status(error instanceof MoneyError ? 409 : 503).json({
            error: error instanceof MoneyError ? error.code : 'deposit_verification_failed' });
    }
}
