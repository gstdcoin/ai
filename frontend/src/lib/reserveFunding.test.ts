import{beforeEach,afterEach,expect,it,vi}from 'vitest';
import{kvSet,kvGet}from './kv';
import{dispatchWithdrawal}from './money';
import{prepareReserveFunding,confirmReserveFunding,noteReserveSubmission,recoverUnsentReserveFunding,type ReserveFundingPolicy,type ReserveFunding}from './reserveFunding';
const address=(s:string)=>'0:'+s.repeat(64),owner=address('1'),vault=address('2'),jetton=address('3'),vaultJetton=address('4');
const policy:ReserveFundingPolicy={id:'verified-fixture-only',owner,vault,vaultJettonWallet:vaultJetton,maximumNano:'100'};
let now=1800000000000;
beforeEach(async()=>{
 now=1800000000000;vi.spyOn(Date,'now').mockImplementation(()=>now);
 await kvSet('money:v2:system',JSON.stringify({owner,jettonWallet:jetton,reserve:'1000',allocated:'900',legacyHold:'100',openedAt:now,checkedAt:now,validUntil:now+900000,migrationReviewed:true,manifest:'fixture'}));
 await kvSet('money:v2:fund:reserve',JSON.stringify({nano:'100'}));
 await kvSet('money:v2:account:'+address('5'),JSON.stringify({available:'800',reserved:'0',pending:'0',promo:'0',earned:'0'}));
});
afterEach(()=>vi.restoreAllMocks());
const read=async(key:string)=>JSON.parse((await kvGet(key))!);
function receipt(t:ReserveFunding){
 const base={amount:t.amount,sender:owner,queryId:t.queryId,utime:Math.floor(now/1000)};
 return{deposit:{...base,hash:'a'.repeat(64)},notification:{...base,hash:'b'.repeat(64),vault,jettonWallet:vaultJetton}};
}
it('holds only reserve funds once and settles only a matched deposit plus accepted vault notification',async()=>{
 const customer=await kvGet('money:v2:account:'+address('5'));
 const t=await prepareReserveFunding(policy,owner,'80','reserve-case-1','7');
 expect(t.acquired).toBe(true);expect((await read('money:v2:fund:reserve')).nano).toBe('20');
 expect((await read('money:v2:system')).allocated).toBe('900');
 expect((await prepareReserveFunding(policy,owner,'80','reserve-case-1','7')).acquired).toBe(false);
 await expect(prepareReserveFunding(policy,owner,'70','reserve-case-1','7')).rejects.toThrow('idempotency_conflict');
 const proof=receipt(t),snapshot={owner,jettonWallet:jetton,reserve:'920'};
 await expect(confirmReserveFunding(t.id,{...proof,notification:{...proof.notification,vault:address('6')}},snapshot)).rejects.toThrow('reserve_receipt_mismatch');
 await expect(confirmReserveFunding(t.id,{...proof,notification:{...proof.notification,queryId:'0'}},snapshot)).rejects.toThrow('reserve_receipt_mismatch');
 await noteReserveSubmission(t.id,owner,'c'.repeat(64));
 await confirmReserveFunding(t.id,proof,snapshot);await confirmReserveFunding(t.id,proof,snapshot);
 expect((await read('money:v2:system')).allocated).toBe('820');expect((await read('money:v2:system')).reserve).toBe('920');
 expect((await read('money:v2:system')).payoutInFlight).toBeUndefined();
 expect(await kvGet('money:v2:account:'+address('5'))).toBe(customer);
});
it('serializes competing reserve transfers and ordinary customer payouts on the same lock',async()=>{
 const outcomes=await Promise.allSettled(['reserve-race-a','reserve-race-b'].map(id=>prepareReserveFunding(policy,owner,'80',id,'8')));
 expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 await kvSet('money:v2:withdrawal:ordinary-fixture',JSON.stringify({id:'ordinary-fixture',state:'requested',amount:'1',wallet:address('5')}));
 await expect(dispatchWithdrawal('ordinary-fixture',owner,'8')).rejects.toThrow('another_payout_requires_reconciliation');
 expect((await read('money:v2:fund:reserve')).nano).toBe('20');
});
it('rejects other owners, excess amounts and stale backing rather than spending customer liabilities',async()=>{
 await expect(prepareReserveFunding(policy,address('6'),'10','reserve-auth-case','7')).rejects.toThrow('custody_owner_required');
 await expect(prepareReserveFunding(policy,owner,'101','reserve-cap-case','7')).rejects.toThrow('reserve_batch_cap');
 await kvSet('money:v2:fund:reserve',JSON.stringify({nano:'20'}));
 await expect(prepareReserveFunding(policy,owner,'21','reserve-fund-case','7')).rejects.toThrow('insufficient_reserve_fund');
 now+=900001;await expect(prepareReserveFunding(policy,owner,'10','reserve-stale-case','7')).rejects.toThrow('backing_not_reconciled');
});
it('never unlocks an uncertain submission on a timer or a changed wallet seqno',async()=>{
 const t=await prepareReserveFunding(policy,owner,'80','reserve-recovery-a','7');now+=800000;
 await expect(recoverUnsentReserveFunding(t.id,{seqno:'8',chainTime:Math.floor(now/1000)})).rejects.toThrow('reserve_requires_chain_reconciliation');
 await expect(recoverUnsentReserveFunding(t.id,{seqno:'7',chainTime:t.validUntil})).rejects.toThrow('reserve_requires_chain_reconciliation');
 await recoverUnsentReserveFunding(t.id,{seqno:'7',chainTime:Math.floor(now/1000)});
 await recoverUnsentReserveFunding(t.id,{seqno:'7',chainTime:Math.floor(now/1000)});
 expect((await read('money:v2:fund:reserve')).nano).toBe('100');expect((await read('money:v2:system')).allocated).toBe('900');
 const other=await prepareReserveFunding(policy,owner,'50','reserve-recovery-b','7');await noteReserveSubmission(other.id,owner,'d'.repeat(64));now+=800000;
 await expect(recoverUnsentReserveFunding(other.id,{seqno:'7',chainTime:Math.floor(now/1000)})).rejects.toThrow('reserve_requires_chain_reconciliation');
});
