import{expect,it}from 'vitest';
import{Address,Cell,beginCell,loadTransaction,storeTransaction}from '@ton/core';
import fixture from '../../tests/fixtures/gstd-money-rehearsal.json';
import{parseReserveNotification}from './reserveFundingReceipt';
import type{ReserveFunding}from './reserveFunding';
const t:ReserveFunding={id:'a'.repeat(64),policy:'sandbox-only',owner:fixture.custody,wallet:'0:'+'2'.repeat(64),jettonWallet:'0:'+'3'.repeat(64),amount:'80',queryId:'73',state:'dispatching',dispatchedAt:fixture.time*1000,validUntil:fixture.time+600,walletSeqno:'7',reserveAtDispatch:'1000'};
function notification(options:{amount?:string;query?:string;sender?:string;wallet?:string;bounced?:boolean;aborted?:boolean}={}){
 const tx=loadTransaction(Cell.fromBoc(Buffer.from(fixture.deposit.raw,'hex'))[0].beginParse());
 tx.address=BigInt('0x'+t.wallet.split(':')[1]);tx.now=fixture.time;
 const msg=tx.inMessage!;if(msg.info.type!=='internal'||tx.description.type!=='generic')throw Error('fixture shape');
 msg.info.src=Address.parse(options.wallet||t.jettonWallet);msg.info.dest=Address.parse(t.wallet);msg.info.bounced=options.bounced||false;
 tx.description.aborted=options.aborted||false;
 msg.body=beginCell().storeUint(0x7362d09c,32).storeUint(BigInt(options.query||t.queryId),64).storeCoins(BigInt(options.amount||t.amount)).storeAddress(Address.parse(options.sender||t.owner)).endCell();
 const cell=beginCell().store(storeTransaction(tx)).endCell();return{raw:cell.toBoc().toString('hex'),hash:cell.hash().toString('hex')};
}
it('accepts a successful hashed notification from the exact canonical vault token wallet',()=>{
 const n=notification();expect(parseReserveNotification(n.raw,n.hash,t)).toMatchObject({amount:'80',queryId:'73',vault:t.wallet,sender:t.owner});
});
it('rejects changed hash, wallet provenance, amount, query, sender, bounce and aborted transaction',()=>{
 const n=notification();expect(()=>parseReserveNotification(n.raw,'0'.repeat(64),t)).toThrow();
 for(const patch of [{wallet:'0:'+'4'.repeat(64)},{amount:'81'},{query:'74'},{sender:'0:'+'5'.repeat(64)},{bounced:true},{aborted:true}]){
  const forged=notification(patch);expect(()=>parseReserveNotification(forged.raw,forged.hash,t)).toThrow();
 }
 expect(()=>parseReserveNotification(n.raw,n.hash,{...t,wallet:'0:'+'6'.repeat(64)})).toThrow();
 expect(()=>parseReserveNotification(n.raw,n.hash,{...t,dispatchedAt:(fixture.time+1)*1000})).toThrow();
});
