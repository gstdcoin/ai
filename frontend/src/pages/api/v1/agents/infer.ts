import type {NextApiRequest,NextApiResponse} from 'next';
import completion from '../chat/completions';
import {AgentAccessError,validateAgentInference} from '../../../../lib/agentAccess';
export const config={api:{bodyParser:{sizeLimit:'32kb'}},maxDuration:115};
/** Anonymous free-only facade. No wallet, enterprise key, token signer or new ledger. */
export default async function handler(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
 try{
  if(['authorization','x-session-token','x-api-key','x-wallet-address','x-bot-token'].some(k=>req.headers[k]!==undefined))
   return res.status(400).json({error:'credentials_not_supported',payment_url:'https://app.gstdtoken.com/payments'});
  const body=validateAgentInference(req.body);
  // Forward only IP attribution to the existing rate/quota checks. No credentials or cookies.
  const headers:NextApiRequest['headers']={'content-type':'application/json'};
  for(const key of ['cf-connecting-ip','x-forwarded-for','x-real-ip'])if(req.headers[key]!==undefined)headers[key]=req.headers[key];
  return await completion({...req,method:'POST',body,headers,cookies:{},query:{}} as NextApiRequest,res);
 }catch(e){
  if(e instanceof AgentAccessError)return res.status(e.status).json({error:e.message,...(e.status===402?{payment_url:'https://app.gstdtoken.com/escrow-mainnet'}:{})});
  return res.status(503).json({error:'agent_service_unavailable'});
 }
}
