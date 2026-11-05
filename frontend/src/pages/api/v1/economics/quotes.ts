import type {NextApiRequest,NextApiResponse} from 'next';
import {sessionWallet} from '../../../../lib/walletSession';
import {authenticateAgent} from '../../../../lib/agentGrants';
import {createWorkQuote,validateQuotedWork} from '../../../../lib/workEconomics';
import {kvRateLimit} from '../../../../lib/kv';
import {walletId,MoneyError} from '../../../../lib/money';
export default async function handler(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).end();}
 try{
  const grant=req.headers.authorization?await authenticateAgent(req.headers):undefined;
  const wallet=grant?.wallet||await sessionWallet(req.headers);
  if(!wallet)return res.status(401).json({error:'auth_required'});
  if(!await kvRateLimit('economics:quotes:'+walletId(wallet),20,60000)){res.setHeader('Retry-After','60');return res.status(429).json({error:'rate_limited'});}
  const b=req.body||{};
  if(Object.keys(b).some(k=>!['model','messages','max_tokens','allow_network'].includes(k))||b.allow_network!==true)throw new MoneyError('network_consent_required');
  const work=validateQuotedWork(b.model,b.messages,b.max_tokens);
  return res.status(200).json({quote:await createWorkQuote(wallet,work.model,work.messages,work.maxTokens,grant)});
 }catch(e){const code=e instanceof MoneyError?e.code:'pricing_unavailable';
  return res.status(code==='agent_auth_required'?401:code==='no_priced_executor'?409:e instanceof MoneyError?400:503).json({error:code,charged:false});}
}
export const config={api:{bodyParser:{sizeLimit:'280kb'}}};
