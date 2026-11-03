import {createHash} from 'node:crypto';
import {Address} from '@ton/core';
import type {BatchInput} from './batchEscrow';
export interface EscrowPilotJob{version:1;kind:'arithmetic';node_id:string;model:string;a:number;b:number;nonce:string;payout_revision:number}
export function pilotJobHash(input:BatchInput):string{
 const j=input.job;if(!j||j.version!==1||j.kind!=='arithmetic'||input.testAssetVersion!==2||input.requests!==1||
  !/^[A-Za-z0-9_.-]{4,64}$/.test(j.node_id)||typeof j.model!=='string'||!j.model.trim()||j.model==='auto'||j.model.length>160||
  ![j.a,j.b].every(n=>Number.isSafeInteger(n)&&n>=2&&n<=99)||!Number.isSafeInteger(j.payout_revision)||j.payout_revision<1||!/^[a-f0-9]{64}$/.test(j.nonce))throw Error('invalid_escrow_job');
 const address=(s:string)=>{try{return Address.parse(s).toRawString();}catch{throw Error('invalid_escrow_job');}};
 return createHash('sha256').update(JSON.stringify(['gstd:escrow:testnet-job:v1','-3',address(input.payer),address(input.worker),address(input.protocol),address(input.reserve),input.budget,input.deadline,input.testAssetVersion,input.requests,j.version,j.kind,j.node_id,j.model,j.a,j.b,j.nonce,j.payout_revision])).digest('hex');
}
export function validatePilotJob(input:BatchInput){if(pilotJobHash(input)!==input.taskId)throw Error('invalid_escrow_job');}
export const pilotQueueTaskId=(task:string)=>'escrow_testnet_'+task;
export const pilotJobKey=(task:string)=>'escrow:testnet:job:'+task;
export const pilotPrompt=(job:EscrowPilotJob)=>`Calculate ${job.a} multiplied by ${job.b}. Reply with only the integer.`;
export const pilotResultHash=(text:string)=>createHash('sha256').update(text.trim()).digest('hex');
