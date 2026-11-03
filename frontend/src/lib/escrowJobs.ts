import {randomBytes} from 'node:crypto';
import {batchPreview,rawAddress,type BatchInput} from './batchEscrow';
import {getActiveNodes} from './nodes';
import {testnetNodePayout} from './testnetNodePayout';
import {getModelPrice} from './modelPricing';
import {nano,units} from './money';
import {kvGet,kvSetNX,kvMoneyCAS} from './kv';
import {canonicalModelId} from './modelId';
import {pilotJobHash,validatePilotJob,pilotJobKey,pilotQueueTaskId,pilotPrompt,pilotResultHash} from './escrowJobManifest';
export interface EscrowPilotReceipt{result:string;result_hash:string;model:string;node_id:string;latency_ms:number;completed_at:string;settlement_mode:'testnet_contract';ledger_credited:false}
export interface EscrowPilotRecord{task:string;queue_task:string;input:BatchInput;state:'prepared'|'queued'|'computed';created_at:number;funded_at?:number;receipt?:EscrowPilotReceipt}
const TTL=3600;
export async function pilotRecord(input:BatchInput):Promise<{raw:string;record:EscrowPilotRecord}|null>{validatePilotJob(input);const raw=await kvGet(pilotJobKey(input.taskId));if(!raw)return null;const record:EscrowPilotRecord=JSON.parse(raw);if(record.task!==input.taskId||pilotJobHash(record.input)!==input.taskId)throw Error('invalid_escrow_job');return{raw,record};}
export async function preparePilotJob(payerValue:string,model:string){
 const payer=rawAddress(payerValue);if(typeof model!=='string'||model==='auto'||model.length>160)throw Error('invalid_escrow_job');
 const candidates=await getActiveNodes(model);let target:typeof candidates[number]|undefined,payout:Awaited<ReturnType<typeof testnetNodePayout>>=null;
 for(const node of candidates.filter(n=>n.models.some(m=>canonicalModelId(m)===canonicalModelId(model)))){const value=await testnetNodePayout(node.nodeId);if(value?.address===payer){target=node;payout=value;break;}}
 // This free-token pilot is operator-only. Public test coins must not buy arbitrary live-node CPU.
 if(!target||!payout)throw Error('testnet_executor_not_bound');
 const price=units(nano(getModelPrice(model)));if(BigInt(nano(price))<=0n)throw Error('invalid_escrow_job');
 const input:BatchInput={payer,worker:payout.address,protocol:payer,reserve:payer,budget:price,requests:1,taskId:'0'.repeat(64),deadline:Math.floor(Date.now()/1000)+1800,testAssetVersion:2,
  job:{version:1,kind:'arithmetic',node_id:target.nodeId,model,a:17,b:23,nonce:randomBytes(32).toString('hex'),payout_revision:payout.revision}};
 input.taskId=pilotJobHash(input);const preview=await batchPreview(input);
 const record:EscrowPilotRecord={task:input.taskId,queue_task:pilotQueueTaskId(input.taskId),input,state:'prepared',created_at:Date.now()};
 if(!await kvSetNX(pilotJobKey(input.taskId),JSON.stringify(record),TTL))throw Error('escrow_job_conflict');return{input,preview,job:record};
}
export async function queuePilotJob(input:BatchInput,fundedAt:number){
 const found=await pilotRecord(input);if(!found)throw Error('escrow_job_expired');const {raw,record}=found;if(record.state!=='prepared')return record;
 if(input.deadline*1000-Date.now()<120_000)throw Error('escrow_job_expired');
 const candidates=await getActiveNodes(input.job!.model);if(!candidates.some(n=>n.nodeId===input.job!.node_id&&n.models.some(m=>canonicalModelId(m)===canonicalModelId(input.job!.model))))throw Error('testnet_executor_unavailable');
 const next:EscrowPilotRecord={...record,state:'queued',funded_at:fundedAt};
 const task={task_id:record.queue_task,type:'inference',settlement_mode:'testnet_contract',escrow_task_id:input.taskId,payload:{model:input.job!.model,prompt:pilotPrompt(input.job!),max_tokens:32,temperature:0}};
 const key=pilotJobKey(input.taskId);if(!await kvMoneyCAS({[key]:raw},{[key]:JSON.stringify(next)},undefined,{key:'tasks:inference:'+input.job!.node_id,value:JSON.stringify(task)},{[key]:TTL})){
  const current=await pilotRecord(input);if(!current)throw Error('escrow_job_expired');return current.record;
 }return next;
}
export async function pilotAssignment(task:Record<string,any>,nodeId:string){
 if(task.settlement_mode!=='testnet_contract'||typeof task.escrow_task_id!=='string'||!/^[a-f0-9]{64}$/.test(task.escrow_task_id))return null;
 const raw=await kvGet(pilotJobKey(task.escrow_task_id));if(!raw)return null;const record:EscrowPilotRecord=JSON.parse(raw),input=record.input;validatePilotJob(input);
 if(record.state!=='queued'||record.queue_task!==task.task_id||input.job!.node_id!==nodeId||input.taskId!==task.escrow_task_id||input.deadline*1000-Date.now()<90_000||!record.funded_at||Date.now()-record.funded_at>90_000||await kvGet('task_completed:'+task.task_id))return null;
 if(task.payload?.model!==input.job!.model||task.payload?.prompt!==pilotPrompt(input.job!)||task.payload?.max_tokens!==32||task.payload?.temperature!==0)return null;
 return{escrow_job:input.taskId,payout_wallet:input.worker,expected_model:input.job!.model};
}
export async function completePilotJob(task:string,nodeId:string,model:unknown,result:unknown,latency:unknown):Promise<EscrowPilotReceipt>{
 if(!/^[a-f0-9]{64}$/.test(task))throw Error('invalid_escrow_job');const key=pilotJobKey(task);
 for(let attempt=0;attempt<3;attempt++){
  const raw=await kvGet(key);if(!raw)throw Error('escrow_job_expired');const record:EscrowPilotRecord=JSON.parse(raw),input=record.input;validatePilotJob(input);
  if(record.state==='prepared'||input.job!.node_id!==nodeId||typeof model!=='string'||canonicalModelId(model)!==canonicalModelId(input.job!.model)||typeof result!=='string'||result.trim()!==String(input.job!.a*input.job!.b))throw Error('invalid_escrow_job_result');
  const receipt:EscrowPilotReceipt={result:result.trim(),result_hash:pilotResultHash(result),model,node_id:nodeId,latency_ms:typeof latency==='number'&&Number.isFinite(latency)?Math.max(0,Math.min(latency,300000)):0,completed_at:new Date().toISOString(),settlement_mode:'testnet_contract',ledger_credited:false};
  if(record.receipt){if(record.receipt.result_hash!==receipt.result_hash||record.receipt.node_id!==nodeId)throw Error('escrow_receipt_conflict');return record.receipt;}
  if(!await kvMoneyCAS({[key]:raw},{[key]:JSON.stringify({...record,state:'computed',receipt})},undefined,undefined,{[key]:TTL}))continue;return receipt;
 }throw Error('escrow_job_conflict');
}
export async function requirePilotReceipt(input:BatchInput){const found=await pilotRecord(input);if(!found||found.record.state!=='computed'||!found.record.receipt)throw Error('escrow_job_not_completed');return found.record.receipt;}
