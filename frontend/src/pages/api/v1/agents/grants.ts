import type {NextApiRequest,NextApiResponse} from 'next';
import {sessionWallet} from '../../../../lib/walletSession';
import {createAgentGrant,listAgentGrants,revokeAgentGrant,walletId,MoneyError} from '../../../../lib/money';
import {grantChallenge,readGrantChallenge} from '../../../../lib/agentGrants';
import {getActiveNodes} from '../../../../lib/nodes';
import {kvGet,kvRateLimit} from '../../../../lib/kv';
import {executorPayout} from '../../../../lib/nodePayout';
import {getModelPrice} from '../../../../lib/modelPricing';
import {verifyPilotAuthorization} from '../../../../lib/escrowJobAuth';
export default async function handler(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 try{
  const session=await sessionWallet(req.headers);if(!session)return res.status(401).json({error:'auth_required'});
  const wallet=walletId(session);
  if(!await kvRateLimit('agent-grants:owner:'+wallet,30,60000)){res.setHeader('Retry-After','60');return res.status(429).json({error:'rate_limited'});}
  if(req.method==='GET'&&req.query.model!==undefined){
   const model=req.query.model;
   if(typeof model!=='string'||model==='auto'||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(model))return res.status(400).json({error:'invalid_model'});
   const candidates=await getActiveNodes(model),executors=[];
   for(const node of candidates.slice(0,20)){
    try{const record=JSON.parse(await kvGet('node:'+node.nodeId)||'{}');
     executors.push({nodeId:node.nodeId,wallet:await executorPayout(node.nodeId,record.wallet_address)});
    }catch{continue;}
   }
   return res.status(200).json({model,price_gstd:getModelPrice(model),executors});
  }
  if(req.method==='GET')return res.status(200).json({grants:await listAgentGrants(wallet)});
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).end();}
  const body=req.body||{};
  if(body.action==='challenge')return res.status(200).json(await grantChallenge(wallet,body.policy));
  if(body.action==='create'){
   const {raw,value}=await readGrantChallenge(body.nonce,wallet);
   if(!verifyPilotAuthorization(body.authorization,body.stateInit,wallet,value.text))return res.status(403).json({error:'grant_signature_invalid'});
   return res.status(201).json(await createAgentGrant(wallet,value.policy,body.nonce,raw));
  }
  if(body.action==='revoke'&&typeof body.id==='string')return res.status(200).json({grant:await revokeAgentGrant(wallet,body.id)});
  return res.status(400).json({error:'invalid_action'});
 }catch(e){return res.status(e instanceof MoneyError?400:503).json({error:e instanceof MoneyError?e.code:'grant_service_unavailable'});}
}
export const config={api:{bodyParser:{sizeLimit:'24kb'}}};
