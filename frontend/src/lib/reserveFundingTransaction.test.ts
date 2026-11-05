import{expect,it}from 'vitest';
import{Cell,Address}from '@ton/core';
import{reserveFundingTransaction}from './reserveFundingTransaction';
import type{ReserveFunding}from './reserveFunding';
import type{MoneySystem}from './money';
const a=(v:string)=>'0:'+v.repeat(64);
it('funds only the bound vault through the custody Jetton wallet and budgets a real notification',()=>{
 const t={id:'a'.repeat(64),owner:a('1'),wallet:a('2'),amount:'80',queryId:'73',state:'dispatching',validUntil:Math.floor(Date.now()/1000)+600}as ReserveFunding;
 const s={owner:t.owner,jettonWallet:a('3'),payoutInFlight:'reserve:'+t.id}as MoneySystem;
 const tx=reserveFundingTransaction(t,s);expect(tx.network).toBe('-239');expect(tx.from).toBe(t.owner);expect(tx.messages).toHaveLength(1);
 expect(Address.parse(tx.messages[0].address).toRawString()).toBe(s.jettonWallet);expect(tx.messages[0].amount).toBe('200000000');
 const body=Cell.fromBase64(tx.messages[0].payload).beginParse();expect(body.loadUint(32)).toBe(0x0f8a7ea5);expect(body.loadUintBig(64)).toBe(73n);expect(body.loadCoins()).toBe(80n);
 expect(body.loadAddress().toRawString()).toBe(t.wallet);expect(body.loadAddress().toRawString()).toBe(t.owner);expect(body.loadBit()).toBe(false);expect(body.loadCoins()).toBe(100000000n);expect(body.loadBit()).toBe(false);
 for(const wrong of [{...t,state:'submitted' as const},{...t,validUntil:1}])expect(()=>reserveFundingTransaction(wrong,s)).toThrow('reserve_signing_window_closed');
 expect(()=>reserveFundingTransaction(t,{...s,payoutInFlight:'ordinary-withdrawal'})).toThrow();
});
