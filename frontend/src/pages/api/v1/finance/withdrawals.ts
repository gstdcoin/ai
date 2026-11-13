import type { NextApiRequest, NextApiResponse } from 'next';
import { Cell, loadMessage } from '@ton/core';
import { sessionWallet } from '../../../../lib/walletSession';
import { MoneyError, walletId, nano, requestWithdrawal, cancelWithdrawal, rejectWithdrawal, dispatchWithdrawal,
    noteWithdrawalSubmission, confirmWithdrawal, expireUnsentWithdrawal, reconcileFailedWithdrawal, getWithdrawal, listWithdrawals, readMoneySystem, WITHDRAWAL_REQUEST_COOLDOWN_SECONDS } from '../../../../lib/money';
import { PLATFORM_CUSTODY_OWNER, custodySnapshot, jettonWalletFor, verifyDeposit, custodyWalletSeqno, chainHeadTime, findWithdrawalReceipt, normalizedWithdrawalMessage, verifyFailedWithdrawal } from '../../../../lib/custody';
import { withdrawalTransaction } from '../../../../lib/payout';
export default async function handler(req:NextApiRequest,res:NextApiResponse) {
    res.setHeader('Cache-Control','private, no-store');
    const session=await sessionWallet(req.headers);
    if (!session) return res.status(401).json({error:'Verified TON session required'});
    try {
        const wallet=walletId(session),operator=wallet===PLATFORM_CUSTODY_OWNER;
        if (req.method==='GET') return res.status(200).json({withdrawals:await listWithdrawals(operator && req.query.scope==='operator' ? undefined : wallet),
            operator,withdrawal_enabled:true,mode:'owner_signed',fee_gstd:0,request_cooldown_seconds:WITHDRAWAL_REQUEST_COOLDOWN_SECONDS});
        if (req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
        const {action='request',id,amount_gstd,tx_hash,boc}=req.body||{};
        if (action==='request') {
            const key=req.headers['idempotency-key'];
            if (typeof key!=='string' || !/^[A-Za-z0-9_-]{8,100}$/.test(key)) throw new MoneyError('idempotency_key_required');
            return res.status(200).json({withdrawal:await requestWithdrawal(wallet,nano(amount_gstd),key),fee_gstd:0});
        }
        if (typeof id!=='string') throw new MoneyError('withdrawal_id_required');
        const known=await getWithdrawal(id);
        if (!known || (!operator && known.wallet!==wallet)) return res.status(404).json({error:'withdrawal_not_found'});
        if (action==='cancel') return res.status(200).json({withdrawal:await cancelWithdrawal(id,wallet)});
        if (action==='reject') {
            if (!operator) return res.status(403).json({error:'custody_owner_required'});
            return res.status(200).json({withdrawal:await rejectWithdrawal(id,wallet),fee_gstd:0});
        }
        if (action==='dispatch') {
            if (!operator) return res.status(403).json({error:'custody_owner_required'});
            const system=await readMoneySystem();
            if (!system) throw new MoneyError('backing_not_reconciled');
            const w=await dispatchWithdrawal(id,wallet,await custodyWalletSeqno(wallet));
            if (!w.acquired) return res.status(409).json({error:'payout_already_prepared_do_not_resend',withdrawal:w});
            return res.status(200).json({withdrawal:w,transaction:withdrawalTransaction(w,system.owner,system.jettonWallet),
                fee_gstd:0,attached_ton:'0.05',note:'Native execution budget paid by custody owner; wallet returns unused TON.'});
        }
        if(action==='recover-unsent') {
            const chainTime=await chainHeadTime();
            const evidence={seqno:await custodyWalletSeqno(PLATFORM_CUSTODY_OWNER),chainTime};
            return res.status(200).json({withdrawal:await expireUnsentWithdrawal(id,evidence)});
        }
        if (action==='submitted') {
            if (!operator) return res.status(403).json({error:'custody_owner_required'});
            if (typeof boc!=='string' || boc.length>100000) throw new MoneyError('invalid_message_boc');
            let hash:string,normalized:string;
            try {
                const roots=Cell.fromBoc(Buffer.from(boc,'base64'));
                if(roots.length!==1)throw Error('invalid_message_boc');
                hash=roots[0].hash().toString('hex');
                normalized=normalizedWithdrawalMessage(loadMessage(roots[0].beginParse()),wallet);
            } catch { throw new MoneyError('invalid_message_boc'); }
            return res.status(200).json({withdrawal:await noteWithdrawalSubmission(id,wallet,hash,normalized)});
        }
        if (action==='recover-failed') {
            if (!operator) return res.status(403).json({error:'custody_owner_required'});
            const hash=typeof tx_hash==='string'?tx_hash.toLowerCase():'';
            if(known.state==='cancelled'&&known.cancellationReason==='chain_failed'&&known.failureHash===hash)
                return res.status(200).json({withdrawal:known});
            if(known.state!=='submitted')throw new MoneyError('withdrawal_requires_chain_reconciliation');
            const system=await readMoneySystem();
            if(!system||system.payoutInFlight!==id)throw new MoneyError('withdrawal_requires_chain_reconciliation');
            const proof=await verifyFailedWithdrawal(hash,known,system.owner,system.jettonWallet);
            return res.status(200).json({withdrawal:await reconcileFailedWithdrawal(id,proof)});
        }
        if (action==='confirm') {
            if (known.state==='confirmed' && known.receiptHash===tx_hash) return res.status(200).json({withdrawal:known});
            const system=await readMoneySystem();
            if (!system) throw new MoneyError('backing_not_reconciled');
            const proof=tx_hash ? await verifyDeposit(String(tx_hash),system.owner,await jettonWalletFor(known.wallet))
                : await findWithdrawalReceipt(known,system.owner);
            if(!proof)return res.status(202).json({withdrawal:known,pending:true});

            const snapshot=await custodySnapshot(system.owner);
            return res.status(200).json({withdrawal:await confirmWithdrawal(id,proof,snapshot),fee_gstd:0});
        }
        return res.status(400).json({error:'Unknown action'});
    } catch(error) {
        if (error instanceof MoneyError && error.code === 'withdrawal_request_cooldown') {
            res.setHeader('Retry-After',String(WITHDRAWAL_REQUEST_COOLDOWN_SECONDS));
            return res.status(429).json({error:error.code,retry_after:WITHDRAWAL_REQUEST_COOLDOWN_SECONDS});
        }
        return res.status(error instanceof MoneyError?409:503).json({error:error instanceof MoneyError?error.code:'withdrawal_service_unavailable'});
    }
}
