import type {NextApiRequest,NextApiResponse} from 'next';
import {requireNodeSignature} from '../../../../lib/nodeAuth';
import {nodePayout,setNodePayout} from '../../../../lib/nodePayout';
import {kvRateLimit} from '../../../../lib/kv';
export default async function handler(req:NextApiRequest,res:NextApiResponse){
 if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
 const nodeId=req.method==='GET'?req.query.node_id:req.body?.node_id;
 if(typeof nodeId!=='string'||!/^[A-Za-z0-9_.-]{4,64}$/.test(nodeId))return res.status(400).json({error:'invalid_node_id'});
 try{
  const auth=await requireNodeSignature(nodeId,req.headers as any);
  if(!auth.ok)return res.status(auth.status).json({error:auth.error});
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET')return res.status(200).json({payout:await nodePayout(nodeId)});
  if(!await kvRateLimit('payout-change:'+nodeId,5,60_000))return res.status(429).json({error:'too_many_requests'});
  const payout=await setNodePayout({nodeId,address:req.body.address,revision:req.body.revision,
   timestamp:req.body.timestamp,signature:req.body.signature});
  return res.status(200).json({payout,applies_to:'new_work_only',previous_balances_moved:false});
 }catch(error:any){
  const code=error.code||error.message;
  return res.status(code==='payout_revision_conflict'?409:code==='invalid_payout_signature'?403:code==='invalid_wallet'?400:503).json({error:['payout_revision_conflict','invalid_payout_signature','invalid_wallet'].includes(code)?code:'payout_service_unavailable'});
 }
}
