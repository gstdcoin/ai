import type {NextApiRequest,NextApiResponse} from 'next';
import {authenticateAgent} from '../../../../lib/agentGrants';
import {paidInference} from '../../../../lib/paidInference';
import {getModelPrice} from '../../../../lib/modelPricing';
import {MoneyError,digest,moneyJob,nano,publicGrant} from '../../../../lib/money';
import {kvGet,kvRateLimit} from '../../../../lib/kv';
export default async function handler(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','no-store');
 try{
  const grant=await authenticateAgent(req.headers);
  if(!await kvRateLimit('agent-grants:use:'+grant.id,20,60000)){res.setHeader('Retry-After','60');return res.status(429).json({error:'rate_limited'});}
  if(req.method==='GET'){
   const requestId=req.query.request_id;
   if(requestId===undefined)return res.status(200).json({grant:publicGrant(grant)});
   if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(requestId))return res.status(400).json({error:'invalid_request_id'});
   const paymentId='chat:'+digest([grant.wallet,grant.id,requestId]),job=await moneyJob(paymentId);
   if(!job)return res.status(404).json({error:'request_not_found',payment_id:paymentId,automatic_retry:false});
   const cached=job.state==='captured'?await kvGet('money:v2:response:'+paymentId):null;
   return res.status(200).json({payment_id:paymentId,state:job.state,amount_nano:job.amount,
    response:cached?JSON.parse(cached):null,charged_again:false});
  }
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).end();}
  if(grant.revokedAt||grant.expiresAt<=Date.now())return res.status(403).json({error:'grant_inactive'});
  const b=req.body;
  if(!b||typeof b!=='object'||Object.keys(b).some(k=>!['model','prompt','max_tokens','allow_network','max_cost_gstd','request_id'].includes(k))||
   b.allow_network!==true||typeof b.model!=='string'||!grant.models.includes(b.model)||b.model==='auto'||
   typeof b.prompt!=='string'||!b.prompt.trim()||b.prompt.length>4000||Buffer.byteLength(b.prompt)>16000||
   !Number.isSafeInteger(b.max_tokens)||b.max_tokens<1||b.max_tokens>grant.maxTokens||
   typeof b.request_id!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(b.request_id)||
   typeof b.max_cost_gstd!=='string')return res.status(400).json({error:'invalid_paid_agent_request'});
  const price=getModelPrice(b.model);
  if(!(price>0))return res.status(400).json({error:'use_free_inference_endpoint'});
  const amount=nano(price),cap=nano(b.max_cost_gstd);
  if(amount>cap||amount>BigInt(grant.perRequestNano))return res.status(402).json({error:'price_exceeds_permission',price_gstd:price});
  // Grant bearer is deliberately not a broad wallet session or enterprise API key.
  req.headers['idempotency-key']=b.request_id;
  req.body={stream:false};
  const scoped=req;
  return await paidInference(scoped,res,{wallet:grant.wallet,price,model:b.model,
   messages:[{role:'user',content:b.prompt}],maxTokens:b.max_tokens,surface:'api',grant});
 }catch(e){return res.status(e instanceof MoneyError?(e.code==='agent_auth_required'?401:400):503)
  .json({error:e instanceof MoneyError?e.code:'agent_service_unavailable',automatic_retry:false});}
}
export const config={api:{bodyParser:{sizeLimit:'24kb'}}};
