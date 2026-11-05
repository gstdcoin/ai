import {fetchNode} from '../../../../lib/nodeFetch';
import type {NextApiRequest,NextApiResponse} from 'next';
import {sessionWallet} from '../../../../lib/walletSession';
import {getActiveNodes} from '../../../../lib/nodes';
import {executorPayout} from '../../../../lib/nodePayout';
import {kvGet,kvSetNX} from '../../../../lib/kv';
import {walletId,MoneyError} from '../../../../lib/money';
import {canonicalModelId} from '../../../../lib/modelId';
export default async function handler(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).end();}
 try{
  const wallet=await sessionWallet(req.headers);if(!wallet)return res.status(401).json({error:'auth_required'});
  const {node_id,model,allow_network}=req.body||{};
  if(allow_network!==true||typeof node_id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(node_id)||
    typeof model!=='string'||model==='auto'||model.length>160)throw new MoneyError('invalid_benchmark_request');
  const n=JSON.parse(await kvGet('node:'+node_id)||'{}');
  if(await executorPayout(node_id,String(n.wallet_address||''))!==walletId(wallet))return res.status(403).json({error:'node_payout_owner_required'});
  const target=(await getActiveNodes(model)).find(x=>x.nodeId===node_id);
  if(!target)throw new MoneyError('node_unavailable');
  if(!await kvSetNX('economics:benchmark:'+node_id,'1',90)){res.setHeader('Retry-After','90');return res.status(429).json({error:'benchmark_cooldown'});}
  const start=Date.now(),r=await fetchNode(target.url+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({model,messages:[{role:'user',content:'Write the integers from 1 to 100, separated by spaces. No explanation.'}],max_tokens:64,stream:false,temperature:0}),
   signal:AbortSignal.timeout(55000)});
  if(!r.ok)throw new MoneyError('benchmark_failed');
  const reader=r.body?.getReader();if(!reader)throw new MoneyError('benchmark_failed');
  let size=0;const chunks:Uint8Array[]=[];
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>262144)throw new MoneyError('benchmark_failed');chunks.push(part.value);}}finally{await reader.cancel().catch(()=>undefined);}
  const d=JSON.parse(Buffer.concat(chunks).toString('utf8')),content=d.choices?.[0]?.message?.content;
  if(typeof d.model!=='string'||canonicalModelId(d.model)!==canonicalModelId(model)||
   typeof content!=='string'||!content.trim()||content.length>65536||d._gstd?.error||d._gstd?.tier==='fallback')throw new MoneyError('benchmark_failed');
  return res.status(200).json({model,wall_ms:Date.now()-start,output_characters:content.length,
   reported_completion_tokens:Number.isSafeInteger(d.usage?.completion_tokens)?d.usage.completion_tokens:null,
   output_budget:64,measured_at:Date.now(),scope:'one_timing_sample_including_network_not_cost_or_quality_proof',reward_gstd:0});
 }catch(e){return res.status(e instanceof MoneyError?409:503).json({error:e instanceof MoneyError?e.code:'benchmark_failed'});}
}
export const config={api:{bodyParser:{sizeLimit:'2kb'}}};
