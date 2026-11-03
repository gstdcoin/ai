import {Address,beginCell,Cell,contractAddress,storeStateInit} from '@ton/core';
import {randomBytes} from 'node:crypto';
import {validatePilotJob,type EscrowPilotJob} from './escrowJobManifest';
import {GstdTaskEscrow,storeSyncTask,storeAcceptFundedTask,storeRefundExpiredTask,storeReclaimEscrowTon} from './escrow-generated/GstdTaskEscrow';
import {GstdEscrowShare,storeWithdrawAcceptedShare,storeRefundExpiredShare} from './escrow-generated/GstdEscrowShare';
import {TestGstdMaster,storeMintTestGstd} from './escrow-generated/TestGstdMaster';
import {TestGstdMasterV2} from './escrow-generated/TestGstdMasterV2';
import walletArtifact from './escrow-generated/wallet-code.json';

export const ESCROW_NETWORK='-3' as const;
export interface BatchInput {payer:string;worker:string;protocol:string;reserve:string;budget:string;taskId:string;deadline:number;requests:number;testAssetVersion?:1|2;job?:EscrowPilotJob}
export type BatchAction='mint'|'deploy'|'fund'|'accept'|'expire'|'sync'|'withdraw'|'refund'|'reclaim'|'report';
export function amountNano(value:string):bigint {
 if(!/^(0|[1-9]\d{0,3})(\.\d{1,9})?$/.test(value))throw Error('invalid_budget');
 const [whole,decimals='']=value.split('.'),amount=BigInt(whole)*1_000_000_000n+BigInt(decimals.padEnd(9,'0'));
 if(amount<100n||amount>1_000_000_000_000n)throw Error('invalid_budget');return amount;
}
export function rawAddress(value:string):string{
 try{const address=Address.parse(value);if(address.workChain!==0||address.hash.equals(Buffer.alloc(32)))throw Error();return address.toRawString();}
 catch{throw Error('invalid_address');}
}
const serialize=(body:Cell)=>body.toBoc().toString('base64');
const queryId=()=>BigInt('0x'+randomBytes(8).toString('hex'));
export async function batchContext(input:BatchInput){
 if(!input||(input.testAssetVersion!==undefined&&input.testAssetVersion!==1&&input.testAssetVersion!==2)||typeof input.budget!=='string'||typeof input.taskId!=='string'||!/^[a-f0-9]{64}$/.test(input.taskId)||
  !Number.isSafeInteger(input.deadline)||input.deadline<=0||input.deadline>Math.floor(Date.now()/1000)+7*86400||
  !Number.isSafeInteger(input.requests)||input.requests<1||input.requests>10_000)throw Error('invalid_batch');
 if(input.job!==undefined)validatePilotJob(input);
 const payer=Address.parse(rawAddress(input.payer)),recipients=[input.worker,input.protocol,input.reserve].map(a=>Address.parse(rawAddress(a)));
 const budget=amountNano(input.budget),amounts=[budget*85n/100n,budget*10n/100n,budget-budget*85n/100n-budget*10n/100n];
 const code=Cell.fromBoc(Buffer.from(walletArtifact.code_hex,'hex'))[0];if(code.hash().toString('hex')!==walletArtifact.code_hash)throw Error('invalid_artifact');
 // Missing version means the original asset: never silently rebind a saved task.
 const master=input.testAssetVersion===2?await TestGstdMasterV2.fromInit(code):await TestGstdMaster.fromInit(code);
 const task=await GstdTaskEscrow.fromInit(payer,...recipients as [Address,Address,Address],BigInt('0x'+input.taskId),budget,BigInt(input.deadline),code,master.address,-3n);
 const shares=await Promise.all(recipients.map((recipient,i)=>GstdEscrowShare.fromInit(task.address,payer,recipient,BigInt(i),amounts[i],code,master.address,-3n)));
 const tokenWallet=(owner:Address)=>contractAddress(0,{code,data:beginCell().storeCoins(0).storeAddress(owner).storeAddress(master.address).storeBit(false).endCell()});
 return{payer,recipients,budget,amounts,code,master,task,shares,tokenWallet};
}
export async function batchPreview(input:BatchInput){
 const c=await batchContext(input);
 return{network:ESCROW_NETWORK,test_only:true,test_asset_version:input.testAssetVersion??1,asset:'valueless test token',master:c.master.address.toRawString(),task:c.task.address.toRawString(),
  payer:c.payer.toRawString(),payerTokenWallet:c.tokenWallet(c.payer).toRawString(),budget_nano:String(c.budget),requests:input.requests,deadline:input.deadline,
  shares:c.shares.map((s,i)=>({role:i,owner:c.recipients[i].toRawString(),amount_nano:String(c.amounts[i]),address:s.address.toRawString(),tokenWallet:c.tokenWallet(s.address).toRawString()})),
  // Attached execution budgets are not a claim about consumed gas.
  budgets_ton:{mint:'0.20',deploy:'0.40',fund:'0.30',accept:'0.30',withdraw_each:'0.08',expire:'0.30',refund_all:'0.24',sync:'0.30'},
  minimum_storage_ton:'0.08',normal_path_attached_ton:'1.24',normal_path_attached_ton_per_request:1.24/input.requests,
 };
}
export async function batchTransaction(input:BatchInput,action:BatchAction,actor:string,role=0,funding?:bigint[],withdrawal?:bigint,refunds?:bigint[]){
 const c=await batchContext(input);actor=rawAddress(actor);
 if(!Number.isInteger(role)||role<0||role>2)throw Error('invalid_role');
 const expected=action==='withdraw'?c.recipients[role].toRawString():c.payer.toRawString();
 if(actor!==expected)throw Error('wrong_signer');
 const message=(address:Address,amount:string,payload:Cell,init?:{code:Cell;data:Cell})=>({address:address.toString({bounceable:false,testOnly:true}),amount,payload:serialize(payload),
  ...(init?{stateInit:serialize(beginCell().store(storeStateInit(init)).endCell())}:{})});
 let messages;
 if(action==='mint')messages=[message(c.master.address,'200000000',beginCell().store(storeMintTestGstd({$$type:'MintTestGstd',amount:1_000_000_000_000n,queryId:queryId()})).endCell(),c.master.init)];
 else if(action==='deploy')messages=[message(c.task.address,'400000000',beginCell().store(storeSyncTask({$$type:'SyncTask'})).endCell(),c.task.init)];
 else if(action==='fund')messages=c.shares.flatMap((s,i)=>{const amount=funding?.[i]??c.amounts[i];if(amount<0n||amount>c.amounts[i])throw Error('invalid_funding');if(amount===0n)return[];return[message(c.tokenWallet(c.payer),'100000000',
  beginCell().storeUint(0x0f8a7ea5,32).storeUint(queryId(),64).storeCoins(amount).storeAddress(s.address).storeAddress(c.payer)
   .storeBit(false).storeCoins(10_000_000n).storeBit(false).endCell())];});
 else if(action==='accept')messages=[message(c.task.address,'300000000',beginCell().store(storeAcceptFundedTask({$$type:'AcceptFundedTask'})).endCell())];
 else if(action==='expire')messages=[message(c.task.address,'300000000',beginCell().store(storeRefundExpiredTask({$$type:'RefundExpiredTask'})).endCell())];
 else if(action==='sync')messages=[message(c.task.address,'300000000',beginCell().store(storeSyncTask({$$type:'SyncTask'})).endCell())];
 else if(action==='withdraw')messages=[message(c.shares[role].address,'80000000',beginCell().store(storeWithdrawAcceptedShare({$$type:'WithdrawAcceptedShare',amount:withdrawal??c.amounts[role],queryId:queryId()})).endCell())];
 else if(action==='refund')messages=c.shares.flatMap((s,i)=>{const amount=refunds?.[i]??c.amounts[i];return amount>0n?[message(s.address,'80000000',beginCell().store(storeRefundExpiredShare({$$type:'RefundExpiredShare',amount,queryId:queryId()})).endCell())]:[];});
 else if(action==='reclaim')messages=[c.task.address,...c.shares.map(s=>s.address)].map(a=>message(a,'30000000',beginCell().store(storeReclaimEscrowTon({$$type:'ReclaimEscrowTon'})).endCell()));
 else if(action==='report')messages=c.shares.map(a=>message(a.address,'30000000',beginCell().storeUint(0x47544508,32).endCell()));
 else throw Error('invalid_action');
 if(!messages.length)throw Error('already_funded');
 return{network:ESCROW_NETWORK,from:actor,validUntil:Math.floor(Date.now()/1000)+300,messages};
}
