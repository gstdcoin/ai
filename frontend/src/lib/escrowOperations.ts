import type {BatchAction} from './batchEscrow';
import {escrowWalletErrorCodes,type EscrowWalletErrorCode} from './escrowWalletErrors';
export const escrowStoragePrefix='gstd_escrow_testnet_v1:';
export const escrowPendingKey=(task:string)=>escrowStoragePrefix+'pending:'+task;
type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
interface BrowserLocks{
 request<T>(name:string,options:{mode:'exclusive';ifAvailable:true},callback:(lock:object|null)=>Promise<T>):Promise<T>;
}
export interface PendingEscrowOperation{
 id:string;task:string;action:BatchAction;role:number;since:number;
 payer:string;total:string;balance:string;native:string;
 validUntil?:number;requestSent?:boolean;signed?:boolean;failureCode?:EscrowWalletErrorCode;
}
const actions=new Set(['mint','deploy','fund','accept','expire','withdraw','refund','sync','report','reclaim']);
function checkTask(task:string){if(!/^0:[a-f0-9]{64}$/.test(task))throw Error('invalid_batch');}
export function readEscrowPending(storage:StorageLike,task:string):PendingEscrowOperation|null{
 checkTask(task);const raw=storage.getItem(escrowPendingKey(task));if(!raw)return null;
 if(raw.length>4096)throw Error('invalid_batch');
 const v=JSON.parse(raw);
 if(!v||v.task!==task||!Number.isSafeInteger(v.since)||v.since<=0||!actions.has(v.action)||![0,1,2].includes(v.role)||
  !['payer','total','balance','native'].every(k=>typeof v[k]==='string'&&/^\d{1,78}$/.test(v[k])))throw Error('invalid_batch');
 if((v.validUntil!==undefined&&(!Number.isSafeInteger(v.validUntil)||v.validUntil<=0))||
  (v.requestSent!==undefined&&typeof v.requestSent!=='boolean')||(v.signed!==undefined&&typeof v.signed!=='boolean')||
  (v.failureCode!==undefined&&!escrowWalletErrorCodes.includes(v.failureCode)))throw Error('invalid_batch');
 // Old drafts stay blocked after upgrading; absence of a new ID never clears them.
 const id=v.id===undefined?'legacy:'+v.since+':'+v.action+':'+v.role:v.id;
 if(typeof id!=='string'||!/^[a-zA-Z0-9:_-]{1,200}$/.test(id))throw Error('invalid_batch');
 return{...v,id};
}
interface OperationControl{
 current():PendingEscrowOperation|null;
 begin(value:PendingEscrowOperation):void;
 annotate(id:string,patch:Pick<PendingEscrowOperation,'requestSent'|'signed'|'failureCode'>):PendingEscrowOperation|null;
 clear(id:string):boolean;
}
/** All writes/clears use this same origin-scoped lock. It is not a cross-device or chain lock. */
export async function withEscrowOperation<T>(storage:StorageLike,locks:BrowserLocks|undefined,task:string,
 run:(control:OperationControl)=>Promise<T>):Promise<T>{
 checkTask(task);
 if(!locks?.request)throw Error('browser_lock_unavailable');
 // Never queue a second wallet prompt to run after the first user interaction finishes.
 return locks.request('gstd-escrow:'+task,{mode:'exclusive',ifAvailable:true},async lock=>{
  if(!lock)throw Error('operation_pending');
  let active=true;
  const ensure=()=>{if(!active)throw Error('operation_pending');};
  const control:OperationControl={
   current:()=>{ensure();return readEscrowPending(storage,task);},
   begin:value=>{
    ensure();if(readEscrowPending(storage,task))throw Error('operation_pending');
    if(value.task!==task||!value.id)throw Error('invalid_batch');
    storage.setItem(escrowPendingKey(task),JSON.stringify(value));
    // Fail before opening the wallet if persistence was unavailable or inconsistent.
    if(readEscrowPending(storage,task)?.id!==value.id)throw Error('operation_pending');
   },
   annotate:(id,patch)=>{
    ensure();const current=readEscrowPending(storage,task);if(current?.id!==id)return null;
    const next={...current,requestSent:patch.requestSent??current.requestSent,signed:patch.signed??current.signed,failureCode:patch.failureCode??current.failureCode};
    storage.setItem(escrowPendingKey(task),JSON.stringify(next));return readEscrowPending(storage,task);
   },
   clear:id=>{
    ensure();if(readEscrowPending(storage,task)?.id!==id)return false;
    storage.removeItem(escrowPendingKey(task));return true;
   },
  };
  try{return await run(control);}finally{active=false;}
 });
}
