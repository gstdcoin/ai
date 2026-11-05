import type {NextApiRequest,NextApiResponse} from 'next';
import {sessionWallet} from '../../../../lib/walletSession';
import {creditProtocolFund,MoneyError,walletId} from '../../../../lib/money';
import {MAINNET_ESCROW} from '../../../../lib/mainnetEscrowManifest';
import {publicFinance} from '../../../../lib/publicFinance';
import {kvRateLimit} from '../../../../lib/kv';
export default async function handler(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','private, no-store');
 try{
  const session=await sessionWallet(req.headers);
  if(!session)return res.status(401).json({error:'auth_required'});
  const wallet=walletId(session);
  if(wallet!==MAINNET_ESCROW.protocol)return res.status(403).json({error:'protocol_beneficiary_required'});
  if(req.method==='GET')return res.status(200).json(await publicFinance());
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).end();}
  if(!await kvRateLimit('protocol-credit:'+wallet,10,60000)){res.setHeader('Retry-After','60');return res.status(429).json({error:'rate_limited'});}
  if(req.body?.action!=='credit_protocol'||Object.keys(req.body).some(k=>k!=='action'))return res.status(400).json({error:'invalid_action'});
  const key=req.headers['idempotency-key'];
  if(typeof key!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(key))throw new MoneyError('idempotency_key_required');
  return res.status(200).json({...await creditProtocolFund(wallet,key),chain_transfer:false});
 }catch(e){return res.status(e instanceof MoneyError?409:503).json({error:e instanceof MoneyError?e.code:'protocol_income_unavailable'});}
}
