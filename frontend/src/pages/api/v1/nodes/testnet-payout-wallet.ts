import type {NextApiRequest,NextApiResponse} from 'next';
import {requireNodeSignature} from '../../../../lib/nodeAuth';
import {kvRateLimit} from '../../../../lib/kv';
import {testnetNodePayout,setTestnetNodePayout} from '../../../../lib/testnetNodePayout';
export default async function handler(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
 const id=req.method==='GET'?req.query.node_id:req.body?.node_id;if(typeof id!=='string'||!/^[A-Za-z0-9_.-]{4,64}$/.test(id))return res.status(400).json({error:'invalid_node_id'});
 if(req.method==='POST'&&req.body?.network!=='-3')return res.status(409).json({error:'wrong_network'});
 try{const auth=await requireNodeSignature(id,req.headers as any);if(!auth.ok)return res.status(auth.status).json({error:auth.error});
  if(req.method==='GET')return res.status(200).json({payout:await testnetNodePayout(id)});
  if(!await kvRateLimit('testnet-payout-change:'+id,5,60_000))return res.status(429).json({error:'rate_limited'});
  const payout=await setTestnetNodePayout({nodeId:id,address:req.body.address,revision:req.body.revision,timestamp:req.body.timestamp,signature:req.body.signature});
  return res.status(200).json({payout,mainnet_payout_changed:false});
 }catch(e:any){const code=e.code||e.message;const allowed=['invalid_payout_signature','payout_revision_conflict','invalid_wallet'];return res.status(code==='invalid_payout_signature'?403:409).json({error:allowed.includes(code)?code:'testnet_payout_unavailable'});}
}
