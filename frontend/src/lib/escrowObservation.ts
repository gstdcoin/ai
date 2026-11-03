import type {PendingEscrowOperation} from './escrowOperations';
interface ShareState{state:number|null;balance_nano:string;missing_nano:string;native_nano:string}
interface ChainState{checked_at:number;deployed:boolean;state:number|null;mask:number;payer_balance:string;native_nano:string;shares:ShareState[]}
const amount=(value:unknown)=>{if(typeof value!=='string'||!/^\d{1,78}$/.test(value))throw Error('invalid_snapshot');return BigInt(value);};
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
   case'withdraw':return s.state===1&&all&&shares[p.role].state===1&&amount(shares[p.role].balance_nano)===0n&&amount(p.balance)>0n;
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
