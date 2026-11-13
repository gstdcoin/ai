import type {PendingEscrowOperation} from './escrowOperations';
interface ShareState{state:number|null;balance_nano:string;missing_nano:string;native_nano:string;beneficiary_remaining?:string;payer_surplus?:string;transfer_pending?:boolean}
interface ChainState{checked_at:number;deployed:boolean;state:number|null;mask:number;payer_balance:string;native_nano:string;shares:ShareState[]}
const amount=(value:unknown)=>{if(typeof value!=='string'||!/^\d{1,78}$/.test(value))throw Error('invalid_snapshot');return BigInt(value);};
const incomingActions = new Set(['deploy', 'fund', 'accept']);

/** Expiry can supersede an unresolved incoming operation without retrying a Jetton transfer. */
export function canExpirePendingEscrow(p: PendingEscrowOperation, chain: ChainState | null, deadline: number, now: number): boolean {
 return incomingActions.has(p.action) && !!chain?.deployed && chain.state === 0 && now > deadline * 1000;
}

/** The irreversible expiry decision makes a prior incoming operation irrelevant to refund eligibility. */
export function isExpiredIncomingEscrow(p: PendingEscrowOperation, chain: ChainState): boolean {
 return incomingActions.has(p.action) && chain.checked_at > p.since && chain.deployed && chain.state === 2;
}

export function canSyncPendingEscrow(p: PendingEscrowOperation, chain: ChainState | null): boolean {
 return !!chain?.deployed&&chain.checked_at>p.since&&(chain.state===1||chain.state===2)&&
  chain.shares.length===3&&chain.shares.some(share=>share.state!==chain.state);
}

/** Expired shares pay only the original payer, from their own on-chain balance. */
export function canRecoverPendingRefund(p: PendingEscrowOperation, chain: ChainState | null, chainTime: number): boolean {
 try {
  return p.action==='refund'&&!!p.validUntil&&Number.isSafeInteger(chainTime)&&chainTime>p.validUntil+120&&
   !!chain?.deployed&&chain.checked_at>p.since&&chain.state===2&&
   chain.shares.length===3&&chain.shares.every(share=>share.state===2)&&
   chain.shares.some(share=>amount(share.balance_nano)>0n);
 } catch { return false; }
}

/** V2 debits the immutable entitlement on-chain and rejects overlapping transfers. */
export function canRecoverPendingPayout(p: PendingEscrowOperation, chain: ChainState | null, chainTime: number): boolean {
 try {
  if((p.action!=='withdraw'&&p.action!=='surplus')||!p.validUntil||!Number.isSafeInteger(chainTime)||chainTime<=p.validUntil+120||
     !chain?.deployed||chain.state!==1||chain.checked_at<=p.since)return false;
  const share=chain.shares[p.role];
  const remaining=p.action==='withdraw'?share?.beneficiary_remaining:share?.payer_surplus;
  return share?.state===1&&share.transfer_pending===false&&amount(remaining)>0n&&amount(share.balance_nano)>0n;
 } catch { return false; }
}
/** Expected state is not a transaction receipt. Partial progress never authorizes a financial retry. */
export function hasExpectedEscrowState(p:PendingEscrowOperation,s:ChainState):boolean{
 try{
  if(!Number.isSafeInteger(s.checked_at)||s.checked_at<=p.since)return false;
  const shares=s.shares,all=Array.isArray(shares)&&shares.length===3;
  switch(p.action){
   case'mint':return amount(s.payer_balance)>amount(p.payer);
   case'deploy':return s.deployed&&all&&shares.every(x=>x.state!==null&&[0,1,2].includes(x.state));
   case'fund':return s.deployed&&all&&s.mask===7&&shares.every(x=>amount(x.missing_nano)===0n);
   case'accept':return s.state===1; // Irreversible parent decision; Sync can safely repeat delivery.
   case'expire':return s.state===2;
   case'withdraw':return s.state===1&&all&&shares[p.role].state===1&&!shares[p.role].transfer_pending&&
    (amount(shares[p.role].balance_nano)===0n||shares[p.role].beneficiary_remaining==='0')&&amount(p.balance)>0n;
   case'surplus':return s.state===1&&all&&shares[p.role].state===1&&!shares[p.role].transfer_pending&&shares[p.role].payer_surplus==='0';
   case'refund':return s.state===2&&all&&shares.every(x=>x.state===2&&amount(x.balance_nano)===0n);
   case'sync':return all&&s.state!==null&&[0,1,2].includes(s.state)&&shares.every(x=>x.state===s.state);
   case'report':return s.mask===7;
   case'reclaim':{
    if(!s.deployed||!all||shares.some(x=>x.state===null))return false;
    const native=amount(s.native_nano)+shares.reduce((n,x)=>n+amount(x.native_nano),0n);
    return native<=80_000_000n&&native<amount(p.native); // Four contract storage floors, not token-wallet reserves.
   }
   default:return false;
  }
 }catch{return false;}
}

/** A fresh batch may replace only a terminal batch whose three shares are empty and synchronized. */
export function isSettledEscrow(s:ChainState|null|undefined):boolean{
 try{return !!s&&s.deployed&&[1,2].includes(s.state as number)&&s.shares.length===3&&s.shares.every(x=>x.state===s.state&&amount(x.balance_nano)===0n);}
 catch{return false;}
}
