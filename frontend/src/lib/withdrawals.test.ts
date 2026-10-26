import { describe,it,expect,vi } from 'vitest';
import { Address,Cell } from '@ton/core';
import { nano,reconcileMoney,reserveMoney,captureMoney,claimMoney,moneyBalance,requestWithdrawal,
    dispatchWithdrawal,cancelWithdrawal,noteWithdrawalSubmission,confirmWithdrawal,expireUnsentWithdrawal,readMoneySystem } from './money';
import { withdrawalTransaction } from './payout';
const owner='0:'+'aa'.repeat(32),wallet='0:'+'bb'.repeat(32),other='0:'+'cc'.repeat(32);
let sequence=0;
async function funded() {
    sequence++;
    const w='0:'+sequence.toString(16).padStart(64,'0');
    await reconcileMoney({owner,jettonWallet:owner,reserve:nano('1000000').toString()},
        {manifest:'withdraw-fixture-'+sequence,legacyHold:'0',migrationReviewed:true,
            allocations:[{wallet:w,amount_nano:nano('100').toString(),reference:'withdraw-fixture-'+sequence}]});
    return w;
}
describe('owner-signed GSTD withdrawal accounting',()=>{
    it('reserves funds once and returns the exact amount on pre-dispatch cancellation',async()=>{
        const w=await funded(),a=await requestWithdrawal(w,nano('10'),'request-one');
        expect((await moneyBalance(w)).balance_gstd).toBe(90);
        expect((await requestWithdrawal(w,nano('10'),'request-one')).id).toBe(a.id);
        await expect(requestWithdrawal(w,nano('9'),'request-one')).rejects.toThrow('idempotency_conflict');
        await expect(cancelWithdrawal(a.id,other)).rejects.toThrow('withdrawal_not_found');
        await cancelWithdrawal(a.id,w);await cancelWithdrawal(a.id,w);
        expect((await moneyBalance(w)).balance_gstd).toBe(100);
    });
    it('requires the custody owner and prevents duplicate dispatch or a timeout refund of uncertain funds',async()=>{
        const w=await funded(),a=await requestWithdrawal(w,nano('20'),'request-two');
        await expect(dispatchWithdrawal(a.id,other,'1')).rejects.toThrow('custody_owner_required');
        const prepared=await dispatchWithdrawal(a.id,owner,'1');
        expect(prepared.acquired).toBe(true);
        expect((await dispatchWithdrawal(a.id,owner,'1')).acquired).toBe(false);
        await expect(cancelWithdrawal(a.id,w)).rejects.toThrow('chain_reconciliation');
        const tx=withdrawalTransaction(prepared,owner,owner);
        const body=Cell.fromBoc(Buffer.from(tx.messages[0].payload,'base64'))[0].beginParse();
        expect(body.loadUint(32)).toBe(0x0f8a7ea5);expect(body.loadUintBig(64).toString()).toBe(a.queryId);
        expect(body.loadCoins()).toBe(nano('20'));expect(body.loadAddress().toRawString()).toBe(w);
        await noteWithdrawalSubmission(a.id,owner,'ab'.repeat(32));
        const before=(await readMoneySystem())!.allocated;
        const proof={hash:'11'.repeat(32),sender:owner,amount:nano('20').toString(),queryId:a.queryId,utime:Math.floor(Date.now()/1000)};
        await expect(confirmWithdrawal(a.id,{...proof,amount:nano('21').toString()},
            {owner,jettonWallet:owner,reserve:nano('999980').toString()})).rejects.toThrow('receipt_mismatch');
        await confirmWithdrawal(a.id,proof,{owner,jettonWallet:owner,reserve:nano('999980').toString()});
        await confirmWithdrawal(a.id,proof,{owner,jettonWallet:owner,reserve:nano('999980').toString()});
        expect((await moneyBalance(w)).reserved_gstd).toBe(0);
        expect(BigInt((await readMoneySystem())!.allocated)).toBe(BigInt(before)-nano('20'));
        expect((await moneyBalance(w)).balance_gstd).toBe(80);
    });
    it('allows recovery of a rejected signing window only after chain expiry and an unchanged wallet nonce',async()=>{
        const w=await funded(),a=await requestWithdrawal(w,nano('5'),'request-three');
        const prepared=await dispatchWithdrawal(a.id,owner,'7');
        await expect(expireUnsentWithdrawal(a.id,{seqno:'7',chainTime:prepared.validUntil!+121})).rejects.toThrow('chain_reconciliation');
        vi.useFakeTimers();
        try {
            vi.setSystemTime((prepared.validUntil!+121)*1000);
            await expect(expireUnsentWithdrawal(a.id,{seqno:'8',chainTime:prepared.validUntil!+121})).rejects.toThrow('chain_reconciliation');
            await expireUnsentWithdrawal(a.id,{seqno:'7',chainTime:prepared.validUntil!+121});
            expect((await moneyBalance(w)).balance_gstd).toBe(100);
        } finally {vi.useRealTimers();}
    });
});
