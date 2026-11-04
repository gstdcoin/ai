import {Address,beginCell,Cell,contractAddress,storeStateInit} from '@ton/core';
import {randomBytes,createHash} from 'node:crypto';
import {amountNano,rawAddress,type BatchAction} from './batchEscrow';
import {GstdTaskEscrow,storeSyncTask,storeAcceptFundedTask,storeRefundExpiredTask,storeReclaimEscrowTon} from './escrow-generated/GstdTaskEscrow';
import {GstdEscrowShare,storeWithdrawAcceptedShare,storeRefundExpiredShare} from './escrow-generated/GstdEscrowShare';
import walletArtifact from './escrow-generated/wallet-code.json';
import {MAINNET_ESCROW as policy} from './mainnetEscrowManifest';
import {mainnetRpc,readEscrowStatus,type Rpc} from './batchEscrowStatus';
import {kvGet,kvSetNX,kvMoneyCAS} from './kv';
export interface MainnetExecution{version:1;node_id:string;model:string;prompt_hash:string;max_tokens:number;nonce:string;payout_revision:number}
export interface MainnetRecoveryInput{manifest_version:1;network:'-239';payer:string;worker:string;protocol:string;reserve:string;budget:string;taskId:string;deadline:number;requests:1}
export interface MainnetInput extends MainnetRecoveryInput{execution:MainnetExecution}
export const validMainnetModel=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=160&&value!=='auto'&&Array.from(value).every(c=>c.charCodeAt(0)>=33&&c.charCodeAt(0)<=126);
export function mainnetJobHash(input:MainnetInput):string{
 const j=input?.execution;if(input?.manifest_version!==1||input?.network!=='-239'||input.requests!==1||!j||j.version!==1||typeof j.node_id!=='string'||!/^[A-Za-z0-9_.-]{4,64}$/.test(j.node_id)||!validMainnetModel(j.model)||!/^[a-f0-9]{64}$/.test(j.prompt_hash)||!/^[a-f0-9]{64}$/.test(j.nonce)||!Number.isSafeInteger(j.max_tokens)||j.max_tokens<1||j.max_tokens>policy.maxTokens||!Number.isSafeInteger(j.payout_revision)||j.payout_revision<1)throw Error('invalid_mainnet_job');
 if(rawAddress(input.protocol)!==policy.protocol||rawAddress(input.reserve)!==policy.reserve)throw Error('invalid_mainnet_recipients');
 return createHash('sha256').update(JSON.stringify(['gstd:mainnet-job:v1',policy.version,policy.network,policy.master,rawAddress(input.payer),rawAddress(input.worker),policy.protocol,policy.reserve,input.budget,input.deadline,j.node_id,j.model,j.prompt_hash,j.max_tokens,j.nonce,j.payout_revision])).digest('hex');
}
export async function mainnetContext(input:MainnetRecoveryInput|MainnetInput){
 if(input?.manifest_version!==1||input.network!=='-239'||input.requests!==1||typeof input.taskId!=='string'||!/^[a-f0-9]{64}$/.test(input.taskId)||rawAddress(input.protocol)!==policy.protocol||rawAddress(input.reserve)!==policy.reserve||(input as any)?.testAssetVersion!==undefined||(input as any)?.job!==undefined||!Number.isSafeInteger(input?.deadline)||input.deadline<=0||input.deadline>Math.floor(Date.now()/1000)+86400||((input as MainnetInput).execution!==undefined&&mainnetJobHash(input as MainnetInput)!==input.taskId))throw Error('invalid_mainnet_job');
 const payer=Address.parse(rawAddress(input.payer)),recipients=[input.worker,input.protocol,input.reserve].map(a=>Address.parse(rawAddress(a))),budget=amountNano(input.budget);
 if(budget>BigInt(policy.maxBudgetNano))throw Error('mainnet_budget_limit');
 const amounts=[budget*85n/100n,budget*10n/100n,budget-budget*85n/100n-budget*10n/100n],code=Cell.fromBoc(Buffer.from(walletArtifact.code_hex,'hex'))[0],master={address:Address.parse(policy.master)};
 if(code.hash().toString('hex')!==policy.walletCodeHash)throw Error('invalid_artifact');
 const task=await GstdTaskEscrow.fromInit(payer,...recipients as [Address,Address,Address],BigInt('0x'+input.taskId),budget,BigInt(input.deadline),code,master.address,-239n);
 const shares=await Promise.all(recipients.map((recipient,i)=>GstdEscrowShare.fromInit(task.address,payer,recipient,BigInt(i),amounts[i],code,master.address,-239n)));
 if(task.init!.code.hash().toString('hex')!==policy.coordinatorCodeHash||shares.some(s=>s.init!.code.hash().toString('hex')!==policy.shareCodeHash))throw Error('invalid_artifact');
 const tokenWallet=(owner:Address)=>contractAddress(0,{code,data:beginCell().storeCoins(0).storeAddress(owner).storeAddress(master.address).storeBit(false).endCell()});
 return{payer,recipients,budget,amounts,code,master,task,shares,tokenWallet};
}
export async function mainnetPreview(input:MainnetRecoveryInput|MainnetInput){
 const c=await mainnetContext(input);
 return{network:policy.network,test_only:false,asset:'GSTD',manifest_version:policy.version,mode:policy.mode,master:policy.master,task:c.task.address.toRawString(),payer:c.payer.toRawString(),payerTokenWallet:c.tokenWallet(c.payer).toRawString(),budget_nano:String(c.budget),deadline:input.deadline,
 shares:c.shares.map((s,i)=>({role:i,owner:c.recipients[i].toRawString(),amount_nano:String(c.amounts[i]),address:s.address.toRawString(),tokenWallet:c.tokenWallet(s.address).toRawString()})),
 budgets_ton:{deploy:'0.40',fund:'0.30',accept:'0.30',withdraw_each:'0.08',expire:'0.30',refund_all:'0.24',sync:'0.30'},minimum_storage_ton:'0.08',normal_path_attached_ton:'1.24',fees_are_attached_budgets:true};
}
export async function verifyMainnetMaster(rpc:Rpc=mainnetRpc()){
 const key='escrow:mainnet:master-code:'+policy.master+':'+policy.walletCodeHash;
 if(await kvGet(key)==='verified')return;
 const r=await rpc.get('blockchain/accounts/'+encodeURIComponent(policy.master)+'/methods/get_jetton_data');
 const value=r?.decoded?.jetton_wallet_code;if(!r?.success||typeof value!=='string')throw Error('mainnet_master_unverified');
 let cell:Cell;try{const raw=value.replace(/^0x/,'');cell=Cell.fromBoc(Buffer.from(raw,/^[a-f0-9]+$/i.test(raw)?'hex':'base64'))[0];}catch{throw Error('mainnet_master_unverified');}
 if(cell.hash().toString('hex')!==policy.walletCodeHash)throw Error('mainnet_master_mismatch');
 await kvSetNX(key,'verified',300);
}
export async function mainnetStatus(input:MainnetRecoveryInput|MainnetInput,rpc:Rpc=mainnetRpc(),pace?:()=>Promise<void>){
 const context=await mainnetContext(input);await verifyMainnetMaster(rpc);
 await verifyMainnetWallet(context.payer,context.tokenWallet(context.payer),rpc);
 for(const share of context.shares)await verifyMainnetWallet(share.address,context.tokenWallet(share.address),rpc);
 try{return await readEscrowStatus(context,rpc,pace);}catch(e:any){if(e.message==='testnet_state_mismatch')throw Error('mainnet_state_mismatch');if(e.message==='testnet_unavailable')throw Error('mainnet_unavailable');throw e;}
}
const queryId=()=>BigInt('0x'+randomBytes(8).toString('hex'));
export async function mainnetTransaction(input:MainnetRecoveryInput|MainnetInput,action:BatchAction,actor:string,role=0,funding?:bigint[],withdrawal?:bigint,refunds?:bigint[]){
 const c=await mainnetContext(input);actor=rawAddress(actor);
 if(!Number.isInteger(role)||role<0||role>2)throw Error('invalid_role');
 if(actor!==(action==='withdraw'?c.recipients[role].toRawString():c.payer.toRawString()))throw Error('wrong_signer');
 const message=(address:Address,amount:string,payload:Cell,init?:{code:Cell;data:Cell})=>({address:address.toString({bounceable:!init,testOnly:false}),amount,payload:payload.toBoc().toString('base64'),...(init?{stateInit:beginCell().store(storeStateInit(init)).endCell().toBoc().toString('base64')}:{})});
 let messages;
 if(action==='deploy')messages=[message(c.task.address,'400000000',beginCell().store(storeSyncTask({$$type:'SyncTask'})).endCell(),c.task.init)];
 else if(action==='fund')messages=c.shares.flatMap((s,i)=>{const amount=funding?.[i]??c.amounts[i];if(amount<0n||amount>c.amounts[i])throw Error('invalid_funding');return amount===0n?[]:[message(c.tokenWallet(c.payer),'100000000',beginCell().storeUint(0x0f8a7ea5,32).storeUint(queryId(),64).storeCoins(amount).storeAddress(s.address).storeAddress(c.payer).storeBit(false).storeCoins(10_000_000n).storeBit(false).endCell())];});
 else if(action==='accept')messages=[message(c.task.address,'300000000',beginCell().store(storeAcceptFundedTask({$$type:'AcceptFundedTask'})).endCell())];
 else if(action==='expire')messages=[message(c.task.address,'300000000',beginCell().store(storeRefundExpiredTask({$$type:'RefundExpiredTask'})).endCell())];
 else if(action==='sync')messages=[message(c.task.address,'300000000',beginCell().store(storeSyncTask({$$type:'SyncTask'})).endCell())];
 else if(action==='withdraw')messages=[message(c.shares[role].address,'80000000',beginCell().store(storeWithdrawAcceptedShare({$$type:'WithdrawAcceptedShare',amount:withdrawal??c.amounts[role],queryId:queryId()})).endCell())];
 else if(action==='refund')messages=c.shares.flatMap((s,i)=>{const amount=refunds?.[i]??c.amounts[i];return amount>0n?[message(s.address,'80000000',beginCell().store(storeRefundExpiredShare({$$type:'RefundExpiredShare',amount,queryId:queryId()})).endCell())]:[];});
 else if(action==='reclaim')messages=[c.task.address,...c.shares.map(s=>s.address)].map(a=>message(a,'30000000',beginCell().store(storeReclaimEscrowTon({$$type:'ReclaimEscrowTon'})).endCell()));
 else if(action==='report')messages=c.shares.map(s=>message(s.address,'30000000',beginCell().storeUint(0x47544508,32).endCell()));
 else throw Error('invalid_action');
 if(!messages.length)throw Error('already_funded');
 return{network:policy.network,from:actor,validUntil:Math.floor(Date.now()/1000)+300,messages};
}

/** Compare local jetton derivation with the canonical master's own getter before any funding. */
export async function verifyMainnetWallet(owner:Address,expected:Address,rpc:Rpc){
 const key='escrow:mainnet:wallet:'+policy.master+':'+owner.toRawString()+':'+policy.walletCodeHash;
 if(await kvGet(key)===expected.toRawString())return;
 if(!rpc.walletAddress)throw Error('mainnet_master_unverified');
 await new Promise(r=>setTimeout(r,1100));
 if(await rpc.walletAddress(policy.master,owner.toRawString())!==expected.toRawString())throw Error('mainnet_master_mismatch');
 await kvSetNX(key,expected.toRawString(),300);
}
/** One mainnet chain journey at a time, avoiding overlapping free-provider request bursts. */
export async function withMainnetRpc<T>(run:(rpc:Rpc)=>Promise<T>):Promise<T>{
 const key='escrow:mainnet:rpc-lease',token=randomBytes(32).toString('hex');
 if(!await kvSetNX(key,token,90))throw Error('mainnet_rpc_busy');
 const deadline=Date.now()+55000,rpc=mainnetRpc();
 const check=()=>{if(Date.now()>=deadline)throw Error('mainnet_unavailable');};
 try{return await run({get:async path=>{check();return rpc.get(path);},walletAddress:async(master,owner)=>{check();return rpc.walletAddress!(master,owner);}});}
 finally{await kvMoneyCAS({[key]:token},{[key]:'released:'+token},undefined,undefined,{[key]:1});}
}
export async function mainnetPreflight(rpc:Rpc){
 await verifyMainnetMaster(rpc);
 const owner=Address.parse(policy.protocol),code=Cell.fromBoc(Buffer.from(walletArtifact.code_hex,'hex'))[0];
 const wallet=contractAddress(0,{code,data:beginCell().storeCoins(0).storeAddress(owner).storeAddress(Address.parse(policy.master)).storeBit(false).endCell()});
 await verifyMainnetWallet(owner,wallet,rpc);
 await new Promise(r=>setTimeout(r,1100));const account=await rpc.get('blockchain/accounts/'+encodeURIComponent(owner.toRawString()));
 await new Promise(r=>setTimeout(r,1100));const tokenAccount=await rpc.get('blockchain/accounts/'+encodeURIComponent(wallet.toRawString()));
 let balance='0';if(tokenAccount?.status==='frozen')throw Error('mainnet_state_mismatch');
 if(tokenAccount?.status==='active'){
  await new Promise(r=>setTimeout(r,1100));const data=await rpc.get('blockchain/accounts/'+encodeURIComponent(wallet.toRawString())+'/methods/get_wallet_data');
  if(!data?.success||data.decoded?.owner!==owner.toRawString()||data.decoded?.jetton!==policy.master||!/^\d+$/.test(String(data.decoded.balance)))throw Error('mainnet_state_mismatch');balance=String(data.decoded.balance);
 }
 return{network:policy.network,master:policy.master,wallet_code_verified:true,wallet_derivation_verified:true,operator:owner.toRawString(),operator_gstd_nano:balance,operator_ton_nano:String(account?.balance||'0'),checked_at:Date.now(),read_only:true};
}
