import type {NextApiRequest,NextApiResponse} from 'next';
import {kvGet,kvSet,kvSetNX} from '../../../../lib/kv';
import {RESERVE_LIQUIDITY,inspectReservePool} from '../../../../lib/reserveLiquidity';
const KEY='reserve-liquidity:observation:v1';
export default async function handler(req:NextApiRequest,res:NextApiResponse){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'read_only'});}
 res.setHeader('Cache-Control','public, max-age=60, s-maxage=300');
 try{
  const cached=await kvGet(KEY);if(cached)return res.status(200).json(JSON.parse(cached));
  if(!await kvSetNX(KEY+':refresh','1',15)){res.setHeader('Cache-Control','no-store');res.setHeader('Retry-After','15');return res.status(503).json({error:'market_refresh_in_progress'});}
  const response=await fetch('https://api.ston.fi/v1/pools/'+RESERVE_LIQUIDITY.pool,{signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error('market_unavailable');
  const status=inspectReservePool((await response.json()).pool);
  await kvSet(KEY,JSON.stringify(status),300);
  return res.status(200).json(status);
 }catch{res.setHeader('Cache-Control','no-store');return res.status(503).json({error:'liquidity_observation_unavailable',automatic_execution_enabled:false});}
}
