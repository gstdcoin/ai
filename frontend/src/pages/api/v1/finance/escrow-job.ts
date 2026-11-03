import type {NextApiRequest,NextApiResponse} from 'next';
import {randomBytes} from 'node:crypto';
import {rawAddress} from '../../../../lib/batchEscrow';
import {batchStatus} from '../../../../lib/batchEscrowStatus';
import {kvGet,kvSetNX,kvRateLimit} from '../../../../lib/kv';
import {getClientIp} from '../../../../lib/ratelimit';
import {preparePilotJob,pilotRecord,queuePilotJob} from '../../../../lib/escrowJobs';
import {pilotAuthorizationText,verifyPilotAuthorization} from '../../../../lib/escrowJobAuth';
export const config={api:{bodyParser:{sizeLimit:'16kb'}}};
export default async function handler(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
 try{
  if(req.body?.network!=='-3')return res.status(409).json({error:'wrong_network'});
  if(!await kvRateLimit('escrow:job:'+getClientIp(req.headers),10,60_000))return res.status(429).json({error:'rate_limited'});
  const {action,input}=req.body;
  if(action==='prepare')return res.status(200).json(await preparePilotJob(req.body.payer,req.body.model));
  const found=await pilotRecord(input);if(!found)throw Error('escrow_job_expired');
  if(action==='status')return res.status(200).json({job:found.record});
  if(action==='challenge'){
   if(found.record.state!=='prepared')return res.status(200).json({job:found.record});
   const nonce=randomBytes(32).toString('hex'),text=pilotAuthorizationText(input.taskId,input.job.node_id,nonce);
   if(!await kvSetNX('escrow:testnet:challenge:'+nonce,JSON.stringify({task:input.taskId,payer:input.payer,text}),300))throw Error('escrow_job_conflict');
   return res.status(200).json({nonce,text});
  }
  if(action!=='execute')throw Error('invalid_action');
  if(found.record.state!=='prepared')return res.status(200).json({job:found.record});
  const nonce=req.body.nonce;if(typeof nonce!=='string'||!/^[a-f0-9]{64}$/.test(nonce))throw Error('invalid_authorization');
  const raw=await kvGet('escrow:testnet:challenge:'+nonce),challenge=raw?JSON.parse(raw):null;
  if(!challenge||challenge.task!==input.taskId||challenge.payer!==rawAddress(input.payer)||!verifyPilotAuthorization(req.body.authorization,req.body.stateInit,challenge.payer,challenge.text))throw Error('invalid_authorization');
  if(!await kvRateLimit('escrow:testnet:status',3,60_000))return res.status(429).json({error:'rate_limited'});
  const status=await batchStatus(input);
  if(!status.deployed||status.state!==0||status.mask!==7||status.shares.length!==3||status.shares.some(s=>BigInt(s.missing_nano)!==0n))throw Error('state_not_ready');
  if(!await kvSetNX('escrow:testnet:authorization-used:'+nonce,'1',3600))throw Error('authorization_used');
  return res.status(200).json({job:await queuePilotJob(input,Date.now()),network:'-3',ledger_credited:false});
 }catch(error:any){
  const allowed=['invalid_address','invalid_escrow_job','testnet_executor_not_bound','testnet_executor_unavailable','escrow_job_expired','escrow_job_conflict','invalid_action','invalid_authorization','authorization_used','state_not_ready','testnet_unavailable','testnet_state_mismatch'];
  return res.status(allowed.includes(error?.message)?409:503).json({error:allowed.includes(error?.message)?error.message:'escrow_job_unavailable'});
 }
}
