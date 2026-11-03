import {it,expect} from 'vitest';
import {escrowPendingKey,readEscrowPending,withEscrowOperation,type PendingEscrowOperation} from './escrowOperations';
const task='0:'+'11'.repeat(32);
const operation=(id='one'):PendingEscrowOperation=>({id,task,action:'deploy',role:0,since:1,payer:'0',total:'0',balance:'0',native:'0'});
function environment(){
 const values=new Map<string,string>();
 const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
 const held=new Set<string>();
 const locks={async request<T>(name:string,options:{mode:'exclusive';ifAvailable:true},run:(lock:object|null)=>Promise<T>):Promise<T>{
  expect(options).toEqual({mode:'exclusive',ifAvailable:true});
  if(held.has(name))return run(null);
  held.add(name);try{return await run({});}finally{held.delete(name);}
 }};
 return{values,storage,locks};
}
it('rejects a concurrent tab immediately without opening a queued wallet prompt',async()=>{
 const x=environment();let release!:()=>void,entered!:()=>void;
 const ready=new Promise<void>(r=>{entered=r;}),wallet=new Promise<void>(r=>{release=r;});
 const first=withEscrowOperation(x.storage,x.locks,task,async op=>{op.begin(operation());entered();await wallet;});
 await ready;let secondPrompt=false;
 await expect(withEscrowOperation(x.storage,x.locks,task,async()=>{secondPrompt=true;})).rejects.toThrow('operation_pending');
 expect(secondPrompt).toBe(false);release();await first;
 // Lock release is not evidence that a signed/uncertain transaction failed.
 await expect(withEscrowOperation(x.storage,x.locks,task,async op=>op.begin(operation('two')))).rejects.toThrow('operation_pending');
});
it('a stale confirmation cannot remove another operation; definite rejection permits an explicit new action',async()=>{
 const x=environment();
 await withEscrowOperation(x.storage,x.locks,task,async op=>{op.begin(operation('one'));expect(op.clear('one')).toBe(true);});
 await withEscrowOperation(x.storage,x.locks,task,async op=>{op.begin(operation('two'));expect(op.clear('one')).toBe(false);expect(op.current()?.id).toBe('two');});
 expect(readEscrowPending(x.storage,task)?.id).toBe('two');
});
it('preserves old pending drafts across upgrade and rejects corrupted saved state',()=>{
 const x=environment(),old:any=operation();delete old.id;x.storage.setItem(escrowPendingKey(task),JSON.stringify(old));
 expect(readEscrowPending(x.storage,task)?.id).toBe('legacy:1:deploy:0');
 x.storage.setItem(escrowPendingKey(task),JSON.stringify({...old,task:'0:'+'22'.repeat(32)}));
 expect(()=>readEscrowPending(x.storage,task)).toThrow('invalid_batch');
});
it('fails before wallet access when locking or durable browser storage is unavailable',async()=>{
 const x=environment();let walletOpened=false;
 await expect(withEscrowOperation(x.storage,undefined,task,async()=>{walletOpened=true;})).rejects.toThrow('browser_lock_unavailable');
 const broken={...x.storage,setItem:()=>{throw Error('storage_denied');}};
 await expect(withEscrowOperation(broken,x.locks,task,async op=>{op.begin(operation());walletOpened=true;})).rejects.toThrow('storage_denied');
 expect(walletOpened).toBe(false);
});
it('releases the browser lock after failure and prevents an escaped controller from writing later',async()=>{
 const x=environment();let escaped:any;
 await expect(withEscrowOperation(x.storage,x.locks,task,async op=>{escaped=op;throw Error('wallet_failed');})).rejects.toThrow('wallet_failed');
 expect(()=>escaped.begin(operation())).toThrow('operation_pending');
 await withEscrowOperation(x.storage,x.locks,task,async op=>op.begin(operation('new')));
 expect(readEscrowPending(x.storage,task)?.id).toBe('new');
});

it('persists wallet diagnostic stages without clearing or mutating the financial operation',async()=>{
 const x=environment();
 await withEscrowOperation(x.storage,x.locks,task,async op=>{
  op.begin({...operation(),validUntil:1000,requestSent:false});
  const sent=op.annotate('one',{requestSent:true});expect(sent?.requestSent).toBe(true);
  const failed=op.annotate('one',{failureCode:'wallet_unknown'});
  expect(failed).toMatchObject({id:'one',task,action:'deploy',requestSent:true,validUntil:1000,failureCode:'wallet_unknown'});
  expect(op.annotate('stale',{signed:true})).toBe(null);
  expect(op.current()?.id).toBe('one');
 });
 expect(readEscrowPending(x.storage,task)?.failureCode).toBe('wallet_unknown');
});
it('rejects corrupted diagnostic fields rather than dropping a pending operation',()=>{
 const x=environment();
 for(const fields of [{validUntil:1.5},{requestSent:'yes'},{signed:1},{failureCode:'arbitrary message'}]){
  x.storage.setItem(escrowPendingKey(task),JSON.stringify({...operation(),...fields}));
  expect(()=>readEscrowPending(x.storage,task)).toThrow('invalid_batch');
 }
});
