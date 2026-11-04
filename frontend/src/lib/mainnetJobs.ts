import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {getActiveNodes} from './nodes';
import {nodePayout} from './nodePayout';
import {getModelPrice} from './modelPricing';
import {nano,units} from './money';
import {kvGet,kvSetNX,kvMoneyCAS} from './kv';
import {extractVerifiedWalletPublicKey} from './tonProof';
import {canonicalModelId} from './modelId';
import {rawAddress} from './batchEscrow';
import {mainnetJobHash,mainnetPreview,validMainnetModel,type MainnetInput} from './mainnetEscrow';
import {MAINNET_ESCROW as policy} from './mainnetEscrowManifest';
export const mainnetJobKey=(id:string)=>'escrow:mainnet:job:'+id;
const TTL=3600;
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export interface MainnetReceipt{result:string;result_hash:string;model:string;node_id:string;latency_ms:number;completed_at:string;settlement_mode:'mainnet_contract';ledger_credited:false}
export interface MainnetJobRecord{task:string;queue_task:string;input:MainnetInput;prompt:string;access_hash:string;state:'prepared'|'queued'|'computed';created_at:number;funded_at?:number;receipt?:MainnetReceipt}
export function mainnetRpcConfigured(){return !!process.env.ESCROW_MAINNET_TONCENTER_API_KEY?.trim();}
export function requirePilotPayer(address:string){if(!policy.pilotPayers.includes(rawAddress(address)))throw Error('mainnet_pilot_wallet_required');}
export async function mainnetCatalog(){
 const nodes=await getActiveNodes();const offers=[];
 for(const node of nodes){const payout=await nodePayout(node.nodeId);if(!payout)continue;
  for(const model of node.models){if(!validMainnetModel(model))continue;const price=units(nano(getModelPrice(model)));if(BigInt(nano(price))<=0n||BigInt(nano(price))>BigInt(policy.maxBudgetNano))continue;
   offers.push({node_id:node.nodeId,model,price,worker:payout.address,payout_revision:payout.revision});
  }
 }return offers;
}
export async function prepareMainnetJob(value:{payer:string;node_id:string;model:string;prompt:string;max_tokens:number;consent:boolean;wallet_state_init:string}){
 const payer=rawAddress(value.payer);requirePilotPayer(payer);
 if(!extractVerifiedWalletPublicKey(payer,value.wallet_state_init))throw Error('unsupported_mainnet_wallet');
 if(value.consent!==true||typeof value.prompt!=='string'||!value.prompt.trim()||value.prompt.length>4000||Buffer.byteLength(value.prompt)>16000||Array.from(value.prompt).some(c=>{const n=c.charCodeAt(0);return n<32&&![9,10,13].includes(n)||n===127;})||!Number.isSafeInteger(value.max_tokens)||value.max_tokens<1||value.max_tokens>policy.maxTokens)throw Error('invalid_mainnet_job');
 const offer=(await mainnetCatalog()).find(o=>o.node_id===value.node_id&&o.model===value.model);if(!offer)throw Error('mainnet_executor_unavailable');
 const input:MainnetInput={manifest_version:1,network:'-239',payer,worker:offer.worker,protocol:policy.protocol,reserve:policy.reserve,budget:offer.price,taskId:'0'.repeat(64),deadline:Math.floor(Date.now()/1000)+1800,requests:1,
 execution:{version:1,node_id:offer.node_id,model:offer.model,prompt_hash:hash(value.prompt),max_tokens:value.max_tokens,nonce:randomBytes(32).toString('hex'),payout_revision:offer.payout_revision}};
 input.taskId=mainnetJobHash(input);const access_token=randomBytes(32).toString('hex');
 const record:MainnetJobRecord={task:input.taskId,queue_task:'escrow_mainnet_'+input.taskId,input,prompt:value.prompt,access_hash:hash(access_token),state:'prepared',created_at:Date.now()};
 if(!await kvSetNX(mainnetJobKey(input.taskId),JSON.stringify(record),TTL))throw Error('mainnet_job_conflict');
 return{input,preview:await mainnetPreview(input),access_token,job:privateMainnetJobView(record)};
}
export async function readMainnetJob(input:MainnetInput){
 if(!input?.execution)return null;
 if(mainnetJobHash(input)!==input.taskId)throw Error('invalid_mainnet_job');
 const raw=await kvGet(mainnetJobKey(input.taskId));if(!raw)return null;
 const record:MainnetJobRecord=JSON.parse(raw);if(record.task!==input.taskId||mainnetJobHash(record.input)!==input.taskId||hash(record.prompt)!==input.execution.prompt_hash)throw Error('invalid_mainnet_job');
 return{raw,record};
}
export function hasMainnetAccess(record:MainnetJobRecord,token:unknown){return typeof token==='string'&&/^[a-f0-9]{64}$/.test(token)&&timingSafeEqual(Buffer.from(hash(token),'hex'),Buffer.from(record.access_hash,'hex'));}
// Includes a private answer after completion: return only to the capability holder.
export function privateMainnetJobView(record:MainnetJobRecord){return{task:record.task,queue_task:record.queue_task,input:record.input,state:record.state,created_at:record.created_at,funded_at:record.funded_at,receipt:record.receipt};}
export async function authorizedMainnetJob(input:MainnetInput,token:unknown){const found=await readMainnetJob(input);if(!found||!hasMainnetAccess(found.record,token))throw Error('mainnet_job_access_denied');return found;}
export async function queueMainnetJob(input:MainnetInput,fundedAt:number){
 const found=await readMainnetJob(input);if(!found)throw Error('mainnet_job_expired');const {raw,record}=found;if(record.state!=='prepared')return privateMainnetJobView(record);
 if(input.deadline*1000-Date.now()<policy.minExecutionWindowSeconds*1000)throw Error('mainnet_job_expired');
 const node=(await getActiveNodes(input.execution.model)).find(n=>n.nodeId===input.execution.node_id&&n.models.some(m=>canonicalModelId(m)===canonicalModelId(input.execution.model)));
 if(!node)throw Error('mainnet_executor_unavailable');
 const next={...record,state:'queued' as const,funded_at:fundedAt},task={task_id:record.queue_task,type:'inference',settlement_mode:'mainnet_contract',escrow_task_id:input.taskId,payload:{model:input.execution.model,prompt_hash:input.execution.prompt_hash,max_tokens:input.execution.max_tokens,temperature:0}};
 const key=mainnetJobKey(input.taskId);
 if(!await kvMoneyCAS({[key]:raw},{[key]:JSON.stringify(next)},undefined,{key:'tasks:inference:'+input.execution.node_id,value:JSON.stringify(task)},{[key]:TTL})){
  const current=await readMainnetJob(input);if(!current)throw Error('mainnet_job_expired');return privateMainnetJobView(current.record);
 }return privateMainnetJobView(next);
}
export async function mainnetAssignment(task:Record<string,any>,nodeId:string){
 if(task.settlement_mode!=='mainnet_contract'||typeof task.escrow_task_id!=='string'||!/^[a-f0-9]{64}$/.test(task.escrow_task_id))return null;
 const raw=await kvGet(mainnetJobKey(task.escrow_task_id));if(!raw)return null;const record:MainnetJobRecord=JSON.parse(raw),input=record.input;
 if(mainnetJobHash(input)!==task.escrow_task_id||record.state!=='queued'||record.queue_task!==task.task_id||input.execution.node_id!==nodeId||input.deadline*1000-Date.now()<180000||!record.funded_at||Date.now()-record.funded_at>90000||await kvGet('task_completed:'+task.task_id))return null;
 const p=task.payload;if(p?.model!==input.execution.model||p?.prompt_hash!==input.execution.prompt_hash||p?.prompt!==undefined||hash(record.prompt)!==input.execution.prompt_hash||p?.max_tokens!==input.execution.max_tokens||p?.temperature!==0)return null;
 // Queue entries retain only a commitment. Plaintext exists only in the expiring private record and the authenticated response.
 task.payload={model:input.execution.model,prompt:record.prompt,max_tokens:input.execution.max_tokens,temperature:0};
 return{escrow_job:input.taskId,payout_wallet:input.worker,expected_model:input.execution.model};
}
export async function completeMainnetJob(task:string,nodeId:string,model:unknown,result:unknown,latency:unknown){
 if(!/^[a-f0-9]{64}$/.test(task)||typeof model!=='string'||typeof result!=='string'||!result.trim()||Buffer.byteLength(result)>65536)throw Error('invalid_mainnet_result');
 const key=mainnetJobKey(task);
 for(let attempt=0;attempt<3;attempt++){
  const raw=await kvGet(key);if(!raw)throw Error('mainnet_job_expired');const record:MainnetJobRecord=JSON.parse(raw),input=record.input;
  if(mainnetJobHash(input)!==task||record.state==='prepared'||input.execution.node_id!==nodeId||canonicalModelId(model)!==canonicalModelId(input.execution.model))throw Error('invalid_mainnet_result');
  const receipt:MainnetReceipt={result,result_hash:hash(result),model,node_id:nodeId,latency_ms:typeof latency==='number'&&Number.isFinite(latency)?Math.max(0,Math.min(latency,300000)):0,completed_at:new Date().toISOString(),settlement_mode:'mainnet_contract',ledger_credited:false};
  if(record.receipt){if(record.receipt.result_hash!==receipt.result_hash||record.receipt.node_id!==nodeId)throw Error('mainnet_receipt_conflict');return record.receipt;}
  if(await kvMoneyCAS({[key]:raw},{[key]:JSON.stringify({...record,state:'computed',receipt})},undefined,undefined,{[key]:TTL}))return receipt;
 }throw Error('mainnet_job_conflict');
}
export async function requireMainnetReceipt(input:MainnetInput,token:unknown){const found=await authorizedMainnetJob(input,token);if(found.record.state!=='computed'||!found.record.receipt)throw Error('mainnet_job_not_completed');return found.record.receipt;}
