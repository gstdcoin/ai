import type {NextApiRequest,NextApiResponse} from 'next';
import {kvKeys,kvMGet,kvRateLimit} from '../../../../lib/kv';
import {sessionWallet} from '../../../../lib/walletSession';
import {walletId,MoneyError} from '../../../../lib/money';
import {saveNodeOffer,offerKey} from '../../../../lib/workEconomics';
export default async function handler(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','private, no-store');
 try{
  const session=await sessionWallet(req.headers);if(!session)return res.status(401).json({error:'auth_required'});
  const wallet=walletId(session);
  if(!await kvRateLimit('economics:owner:'+wallet,20,60000)){res.setHeader('Retry-After','60');return res.status(429).json({error:'rate_limited'});}
  if(req.method==='POST')return res.status(200).json({offer:await saveNodeOffer(wallet,req.body)});
  if(req.method!=='GET'){res.setHeader('Allow','GET, POST');return res.status(405).end();}
  const keys=(await kvKeys('node:')).filter(k=>!k.slice(5).includes(':')),values=keys.length?await kvMGet(keys):[];
  const records=values.flatMap(v=>{try{return v?[JSON.parse(v)]:[];}catch{return[];}});
  const overrides=records.length?await kvMGet(records.map(n=>'node_payout:'+n.node_id)):[];
  const owned=records.filter((n,i)=>{try{return walletId(overrides[i]?JSON.parse(overrides[i]!).address:n.wallet_address)===wallet;}catch{return false;}}).slice(0,20);
  const refs=owned.flatMap(n=>(Array.isArray(n.capabilities)?n.capabilities.filter((m:unknown)=>typeof m==='string').slice(0,20):[]).map((model:string)=>({nodeId:n.node_id,model,key:offerKey(n.node_id,model)})));
  const rawOffers=refs.length?await kvMGet(refs.map(r=>r.key)):[];
  const nodes=owned.map(n=>({node_id:n.node_id,models:refs.filter(r=>r.nodeId===n.node_id).map(r=>r.model),
   offers:refs.flatMap((r,i)=>r.nodeId===n.node_id&&rawOffers[i]?[JSON.parse(rawOffers[i]!)]:[])}));
  return res.status(200).json({wallet,nodes});
 }catch(e){return res.status(e instanceof MoneyError?400:503).json({error:e instanceof MoneyError?e.code:'economics_unavailable'});}
}
export const config={api:{bodyParser:{sizeLimit:'8kb'}}};
