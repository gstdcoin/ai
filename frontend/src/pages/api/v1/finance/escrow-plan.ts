import type {NextApiRequest,NextApiResponse} from 'next';
import {batchPreview,batchTransaction,rawAddress,type BatchAction,type BatchInput} from '../../../../lib/batchEscrow';
import {batchStatus} from '../../../../lib/batchEscrowStatus';
import {kvRateLimit} from '../../../../lib/kv';
import {getClientIp} from '../../../../lib/ratelimit';
export const config={api:{bodyParser:{sizeLimit:'8kb'}}};
const actions=new Set(['mint','deploy','fund','accept','expire','sync','withdraw','refund','reclaim','report']);
export default async function handler(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-GSTD-Escrow-RPC','6');
 if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
 try{
  if(!await kvRateLimit('escrow:plan:'+getClientIp(req.headers),12,60_000))return res.status(429).json({error:'rate_limited'});
  if(req.body?.network!==undefined&&req.body.network!=='-3')return res.status(409).json({error:'wrong_network'});
  const {input,action='preview',actor,role=0}=req.body||{};
  const preview=await batchPreview(input as BatchInput);
  if(action==='preview')return res.status(200).json({preview});
  const needsChain=action==='status'||['fund','accept','withdraw','refund'].includes(action);
  let status;
  if(needsChain){
   if(!await kvRateLimit('escrow:testnet:status',3,60_000))return res.status(429).json({error:'rate_limited'});
   status=await batchStatus(input);
   if(action==='status')return res.status(200).json({status});
  }
  if(!actions.has(action))return res.status(400).json({error:'invalid_action'});
  if(action==='fund'&&(!status?.deployed||status.state!==0||status.shares.length!==3))throw Error('state_not_ready');
  if(action==='accept'&&(!status?.deployed||status.state!==0||status.mask!==7))throw Error('state_not_ready');
  if(action==='withdraw'){
   if(!status?.deployed||status.state!==1||status.shares[role]?.state!==1||BigInt(status.shares[role]?.balance_nano||'0')<=0n)throw Error('state_not_ready');
  }
  if(action==='refund'&&(!status?.deployed||status.state!==2||status.shares.some(s=>s.state!==2)))throw Error('state_not_ready');
  const transaction=await batchTransaction(input,action as BatchAction,rawAddress(actor),role,
   action==='fund'?status!.shares.map(s=>BigInt(s.missing_nano)):undefined,
   action==='withdraw'?BigInt(status!.shares[role].balance_nano):undefined,
   action==='refund'?status!.shares.map(s=>BigInt(s.balance_nano)):undefined);
  return res.status(200).json({preview,transaction,network:'-3',test_only:true});
 }catch(error:any){
  const allowed=['invalid_address','invalid_budget','invalid_batch','invalid_role','wrong_signer','already_funded','invalid_action','state_not_ready','testnet_unavailable','testnet_state_mismatch'];
  return res.status(allowed.includes(error?.message)?409:503).json({error:allowed.includes(error?.message)?error.message:'escrow_unavailable',...(error?.message==='testnet_unavailable'&&typeof error.provider_diagnostic==='string'?{provider_diagnostic:error.provider_diagnostic.slice(0,300)}:{})});
 }
}
