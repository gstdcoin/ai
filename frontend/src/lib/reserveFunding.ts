/** Reserve-only custody journal. No private key, signing or arbitrary transfer destination. */
import{kvMGet,kvMoneyCAS,kvGet}from './kv';
import{digest,MoneyError,walletId,type MoneySystem}from './money';
const SYS='money:v2:system',FUND='money:v2:fund:reserve',MAX=1000000000000000000n;
export type ReserveFundingPolicy={id:string;owner:string;vault:string;vaultJettonWallet:string;maximumNano:string};
export type ReserveFunding={id:string;policy:string;owner:string;wallet:string;jettonWallet:string;amount:string;queryId:string;
 state:'dispatching'|'submitted'|'confirmed'|'cancelled';dispatchedAt:number;validUntil:number;walletSeqno:string;reserveAtDispatch:string;
 bocHash?:string;depositHash?:string;notificationHash?:string;confirmedAt?:number};
type Receipt={hash:string;amount:string;sender:string;queryId:string;utime:number};
export type VerifiedReserveReceipt={deposit:Receipt;notification:Receipt&{vault:string;jettonWallet:string}};
const key=(id:string)=>{if(!/^[a-f0-9]{64}$/.test(id))throw new MoneyError('invalid_reserve_transfer');return'money:v2:reserve-transfer:'+id;};
const integer=(v:string)=>{if(typeof v!=='string'||! /^(0|[1-9]\d{0,18})$/.test(v)||BigInt(v)>MAX)throw new MoneyError('invalid_reserve_amount');return BigInt(v);};
const hash=(v:string)=>{if(!/^[a-f0-9]{64}$/.test(v))throw new MoneyError('invalid_transaction_hash');return v;};
function policy(p:ReserveFundingPolicy){
 if(!p||!p.id||p.id.length>100||p.owner!==walletId(p.owner)||p.vault!==walletId(p.vault)||p.vaultJettonWallet!==walletId(p.vaultJettonWallet)||p.owner===p.vault||integer(p.maximumNano)<=0n)throw new MoneyError('invalid_reserve_policy');
}
async function atomic<T>(keys:string[],run:(old:Record<string,string|null>)=>{value:T;writes?:Record<string,string>}){
 keys=[...new Set(keys)];for(let n=0;n<12;n++){
  const values=await kvMGet(keys),old=Object.fromEntries(keys.map((k,i)=>[k,values[i]])),result=run(old);
  if(!result.writes||await kvMoneyCAS(old,result.writes))return result.value;
 }throw new MoneyError('ledger_busy');
}
function system(raw:string|null):MoneySystem{
 if(!raw)throw new MoneyError('backing_not_reconciled');return JSON.parse(raw);
}
export async function getReserveFunding(id:string):Promise<ReserveFunding|null>{const raw=await kvGet(key(id));return raw?JSON.parse(raw):null;}
/** Policy comes from a verified, pinned deployment configuration, never an HTTP body. */
export async function prepareReserveFunding(p:ReserveFundingPolicy,owner:string,amount:string,requestId:string,walletSeqno:string){
 policy(p);owner=walletId(owner);if(owner!==p.owner)throw new MoneyError('custody_owner_required');
 if(!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)||!/^\d{1,20}$/.test(walletSeqno))throw new MoneyError('invalid_reserve_request');
 const value=integer(amount);if(value<=0n||value>integer(p.maximumNano))throw new MoneyError('reserve_batch_cap');
 const id=digest(['reserve-funding:v1',p.id,owner,requestId]),jk=key(id);
 return atomic([SYS,FUND,jk],old=>{
  if(old[jk]){const previous:ReserveFunding=JSON.parse(old[jk]!);if(previous.amount!==amount||previous.wallet!==p.vault||previous.jettonWallet!==p.vaultJettonWallet)throw new MoneyError('idempotency_conflict');return{value:{...previous,acquired:false}};}
  const s=system(old[SYS]);
  if(s.owner!==owner||!s.migrationReviewed||s.validUntil<Date.now()||integer(s.reserve)<integer(s.allocated)+integer(s.legacyHold))throw new MoneyError('backing_not_reconciled');
  if(s.payoutInFlight)throw new MoneyError('another_payout_requires_reconciliation');
  const available=integer(old[FUND]?JSON.parse(old[FUND]!).nano:'0');
  if(value>available||value>integer(s.allocated))throw new MoneyError('insufficient_reserve_fund');
  const now=Date.now();
  const transfer:ReserveFunding={id,policy:p.id,owner,wallet:p.vault,jettonWallet:p.vaultJettonWallet,amount,queryId:String(BigInt('0x'+id.slice(0,16))),
   state:'dispatching',dispatchedAt:now,validUntil:Math.floor(now/1000)+600,walletSeqno,reserveAtDispatch:s.reserve};
  // Hold remains an allocated liability until chain settlement. Customer accounts are untouched.
  s.payoutInFlight='reserve:'+id;
  return{value:{...transfer,acquired:true},writes:{[SYS]:JSON.stringify(s),[FUND]:JSON.stringify({nano:String(available-value)}),[jk]:JSON.stringify(transfer)}};
 });
}
export async function noteReserveSubmission(id:string,owner:string,bocHash:string){
 const jk=key(id);hash(bocHash);return atomic([SYS,jk],old=>{
  const s=system(old[SYS]),t:ReserveFunding=JSON.parse(old[jk]||'null');
  if(s.owner!==walletId(owner)||!t||t.owner!==s.owner)throw new MoneyError('custody_owner_required');
  if(t.state==='confirmed')return{value:t};
  if(!['dispatching','submitted'].includes(t.state)||s.payoutInFlight!=='reserve:'+id)throw new MoneyError('invalid_reserve_state');
  if(t.bocHash&&t.bocHash!==bocHash)throw new MoneyError('idempotency_conflict');
  t.state='submitted';t.bocHash=bocHash;return{value:t,writes:{[jk]:JSON.stringify(t)}};
 });
}
/** Both hashed transactions must be independently parsed/verified by the chain adapter.
 * A token-wallet receipt alone is insufficient: the vault must accept its funding notification. */
export async function confirmReserveFunding(id:string,proof:VerifiedReserveReceipt,snapshot:{owner:string;jettonWallet:string;reserve:string}){
 const jk=key(id),depositKey='money:v2:reserve-receipt:'+hash(proof.deposit.hash),notifyKey='money:v2:reserve-receipt:'+hash(proof.notification.hash);
 if(depositKey===notifyKey)throw new MoneyError('reserve_receipt_mismatch');
 return atomic([SYS,jk,depositKey,notifyKey],old=>{
  const s=system(old[SYS]),t:ReserveFunding=JSON.parse(old[jk]||'null');if(!t)throw new MoneyError('reserve_transfer_not_found');
  if(t.state==='confirmed'){
   if(t.depositHash!==proof.deposit.hash||t.notificationHash!==proof.notification.hash)throw new MoneyError('idempotency_conflict');
   return{value:t};
  }
  if(!['dispatching','submitted'].includes(t.state)||s.payoutInFlight!=='reserve:'+id)throw new MoneyError('invalid_reserve_state');
  for(const r of [proof.deposit,proof.notification])if(r.sender!==t.owner||r.amount!==t.amount||r.queryId!==t.queryId||!Number.isSafeInteger(r.utime)||r.utime<Math.floor(t.dispatchedAt/1000))throw new MoneyError('reserve_receipt_mismatch');
  if(proof.notification.vault!==t.wallet||proof.notification.jettonWallet!==t.jettonWallet||snapshot.owner!==s.owner||snapshot.jettonWallet!==s.jettonWallet)throw new MoneyError('reserve_receipt_mismatch');
  if(old[depositKey]||old[notifyKey])throw new MoneyError('reserve_receipt_already_used');
  const amount=integer(t.amount);if(integer(s.allocated)<amount)throw new MoneyError('invalid_ledger');
  s.allocated=String(integer(s.allocated)-amount);
  const conservative=integer(t.reserveAtDispatch)-amount;
  s.reserve=String([integer(snapshot.reserve),integer(s.reserve),conservative].reduce((a,b)=>a<b?a:b));
  s.checkedAt=Date.now();s.validUntil=Date.now()+900000;delete s.payoutInFlight;
  t.state='confirmed';t.depositHash=proof.deposit.hash;t.notificationHash=proof.notification.hash;t.confirmedAt=Date.now();
  return{value:t,writes:{[SYS]:JSON.stringify(s),[jk]:JSON.stringify(t),[depositKey]:JSON.stringify({transfer:id}),[notifyKey]:JSON.stringify({transfer:id})}};
 });
}
/** No time-only unlock: expired signing window AND unchanged wallet seqno on chain. */
export async function recoverUnsentReserveFunding(id:string,evidence:{seqno:string;chainTime:number}){
 const jk=key(id);return atomic([SYS,FUND,jk],old=>{
  const s=system(old[SYS]),t:ReserveFunding=JSON.parse(old[jk]||'null');if(!t)throw new MoneyError('reserve_transfer_not_found');
  if(t.state==='cancelled')return{value:t};
  if(t.state!=='dispatching'||t.bocHash||s.payoutInFlight!=='reserve:'+id||Date.now()/1000<=t.validUntil+120||!Number.isSafeInteger(evidence.chainTime)||evidence.chainTime<=t.validUntil+120||evidence.seqno!==t.walletSeqno)throw new MoneyError('reserve_requires_chain_reconciliation');
  const fund=integer(old[FUND]?JSON.parse(old[FUND]!).nano:'0');t.state='cancelled';delete s.payoutInFlight;
  return{value:t,writes:{[SYS]:JSON.stringify(s),[FUND]:JSON.stringify({nano:String(fund+integer(t.amount))}),[jk]:JSON.stringify(t)}};
 });
}
