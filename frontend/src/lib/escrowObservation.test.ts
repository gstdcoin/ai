import {it,expect} from 'vitest';
import {hasExpectedEscrowState} from './escrowObservation';
import type {PendingEscrowOperation} from './escrowOperations';
const task='0:'+'11'.repeat(32);
const pending=(action:PendingEscrowOperation['action']):PendingEscrowOperation=>({id:'one',task,action,role:0,since:100,payer:'0',total:'100',balance:'85',native:'400000000'});
const share=(state=0)=>({state,balance_nano:'0',missing_nano:'1',native_nano:'20000000'});
const chain=()=>({checked_at:101,deployed:true,state:0,mask:0,payer_balance:'0',native_nano:'20000000',shares:[share(),share(),share()]});
it('does not clear a three-message funding operation after only one share arrives',()=>{
 const p=pending('fund'),s=chain();s.mask=1;s.shares[0]={...s.shares[0],balance_nano:'85',missing_nano:'0'};
 expect(hasExpectedEscrowState(p,s)).toBe(false);
 s.mask=7;expect(hasExpectedEscrowState(p,s)).toBe(false);
 s.shares.forEach(x=>{x.missing_nano='0';});expect(hasExpectedEscrowState(p,s)).toBe(true);
});
it('requires all refund messages and the entire requested withdrawal to finish',()=>{
 const s=chain();s.state=2;s.shares=[share(2),share(2),share(2)];s.shares[1].balance_nano='10';
 expect(hasExpectedEscrowState(pending('refund'),s)).toBe(false);
 s.shares[1].balance_nano='0';expect(hasExpectedEscrowState(pending('refund'),s)).toBe(true);
 s.state=1;s.shares=[share(1),share(1),share(1)];s.shares[0].balance_nano='40';
 expect(hasExpectedEscrowState(pending('withdraw'),s)).toBe(false);
 s.shares[0].balance_nano='0';expect(hasExpectedEscrowState(pending('withdraw'),s)).toBe(true);
});
it('requires all four native reserves to reach the reclaim target rather than any balance decrease',()=>{
 const s=chain();s.native_nano='100000000';
 expect(hasExpectedEscrowState(pending('reclaim'),s)).toBe(false);
 s.native_nano='20000000';expect(hasExpectedEscrowState(pending('reclaim'),s)).toBe(true);
});
it('does not mistake stale, incomplete or malformed observations for success',()=>{
 const s=chain();s.checked_at=100;expect(hasExpectedEscrowState(pending('deploy'),s)).toBe(false);
 s.checked_at=101;s.shares=[];expect(hasExpectedEscrowState(pending('refund'),{...s,state:2})).toBe(false);
 s.shares=[share(),share(),{...share(),state:null as any}];expect(hasExpectedEscrowState(pending('deploy'),s)).toBe(false);
 s.mask=7;s.shares=[share(),share(),{...share(),missing_nano:'not-a-number'}];expect(hasExpectedEscrowState(pending('fund'),s)).toBe(false);
});
it('recognizes only the expected irreversible decision and keeps sync limited to matching share states',()=>{
 const s=chain();s.state=1;s.shares=[share(1),share(1),share(0)];
 expect(hasExpectedEscrowState(pending('accept'),s)).toBe(true);
 expect(hasExpectedEscrowState(pending('expire'),s)).toBe(false);
 expect(hasExpectedEscrowState(pending('sync'),s)).toBe(false);
 s.shares[2].state=1;expect(hasExpectedEscrowState(pending('sync'),s)).toBe(true);
});
