// Capture native fetch before OpenNext installs request-context wrappers.
export const nativePublicFetch=globalThis.fetch.bind(globalThis);
/** Lightweight public discovery path: no Next.js rendering or ledger imports. */
import {dedupeNodeRecords,isNodeOnline,parseNodeRecords} from './src/lib/node-status';
import {safeNodeUrl} from './src/lib/safeNodeUrl';
import {canonicalModelId} from './src/lib/modelId';
import {getModelPrice} from './src/lib/modelPricing';
type Env=Record<string,unknown>;
const counters=['stats:total_registered','stats:total_tasks_completed','stats:total_gstd_paid','treasury:balance','stats:total_users','stats:total_burned','market:gstd_price_usd','stats:probe_verified','stats:probe_failed'];
async function commands(env:Env,body:unknown[][],transport:typeof fetch):Promise<any[]>{
 const endpoint=String(env.KV_REST_API_URL||env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL||''),token=String(env.KV_REST_API_TOKEN||env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN||'');
 if(!endpoint||!token||new URL(endpoint).protocol!=='https:')throw Error('registry_configuration_unavailable');
 const r=await transport(endpoint.replace(/\/$/,'')+'/pipeline',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(5000),redirect:'error'});
 if(!r.ok)throw Error('registry_http_'+r.status);
 const rows=await r.json() as any[];
 if(!Array.isArray(rows)||rows.length!==body.length||rows.some(x=>x.error))throw Error('registry_command_failed');
 return rows.map(x=>Array.isArray(x.result)?x.result.map(decode):decode(x.result));
}
const decode=(v:unknown)=>{if(typeof v!=='string')return v;try{return JSON.parse(v);}catch{return v;}};
const strings=(v:unknown)=>v==null?null:typeof v==='string'?v:JSON.stringify(v);
async function keyFor(node:string,model:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([node,canonicalModelId(model)])));return 'economics:offer:v1:'+Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');}
export async function publicNetworkResponse(req:Request,env:Env,transport:typeof fetch=fetch):Promise<Response|null>{
 const path=new URL(req.url).pathname;
 if(!['/api/v1/network/stats','/api/v1/models/available'].includes(path))return null;
 const headers={'Content-Type':'application/json','Cache-Control':'public, max-age=30, s-maxage=30','X-GSTD-Discovery':'native-v1'};
 if(req.method!=='GET')return Response.json({error:'Method not allowed'},{status:405,headers:{...headers,Allow:'GET'}});
 try{
  const stats=path.endsWith('/stats');
  const first=await commands(env,stats?[['KEYS','node:*'],['MGET',...counters],['LLEN','tasks:queue']]:[['KEYS','node:*']],transport);
  if(!Array.isArray(first[0]))throw Error('registry_unavailable');
  const keys=first[0].filter((k:unknown)=>typeof k==='string'&&!k.slice(5).includes(':'));
  if(keys.length>1000)throw Error('registry_capacity_exceeded');
  const values=keys.length?(await commands(env,[['MGET',...keys]],transport))[0]:[];
  const records=dedupeNodeRecords(parseNodeRecords<any>(values.map(strings)));
  if(stats){
   const [registered,done,paid,treasury,users,burned,price,ok,fail]=first[1].map((v:unknown)=>Number(v)||0),online=records.filter(n=>isNodeOnline(n)).length;
   return Response.json({nodes_online:online,active_nodes:online,active_workers:online,total_nodes:records.length,total_registered:records.length,registration_events:registered,total_users:users,total_tasks:done,probes_verified:ok,probes_failed:fail,tasks_24h:null,tasks_completed:done,queue_depth:Number(first[2])||0,total_gstd_paid:paid,protocol_treasury_gstd:treasury,total_burned:burned,gstd_price_usd:price,timestamp:Date.now()},{headers});
  }
  const counts=new Map<string,{count:number;lat:number[]}>(),refs:{model:string;node:string;key:string}[]=[];
  for(const n of records){
   if(!isNodeOnline(n)||!safeNodeUrl(n.node_url||n.multiaddrs?.[0]||''))continue;
   for(const model of [...new Set<string>((Array.isArray(n.capabilities)?n.capabilities:[]).filter((s:unknown)=>typeof s==='string'))]){
    if(refs.length>=200)throw Error('registry_capacity_exceeded');
    const row=counts.get(model)||{count:0,lat:[]};row.count++;if(Number.isFinite(n.avg_latency_ms)&&n.avg_latency_ms>0)row.lat.push(n.avg_latency_ms);counts.set(model,row);
    refs.push({model,node:n.node_id,key:await keyFor(n.node_id,model)});
   }
  }
  const offers=refs.length?(await commands(env,[['MGET',...refs.map(r=>r.key)]],transport))[0]:[];
  const models=Array.from(counts,([model_id,row])=>{
   const profiles=refs.flatMap((r,i)=>{if(r.model!==model_id||!offers[i])return[];const o=typeof offers[i]==='string'?JSON.parse(offers[i]):offers[i];return canonicalModelId(o.model)===canonicalModelId(model_id)&&o.nodeId===r.node?[o]:[];});
   const active=profiles.filter(o=>o.active),price=getModelPrice(model_id);
   const net=active.length?active.reduce((a,o)=>BigInt(o.netUsdMicro)<a?BigInt(o.netUsdMicro):a,BigInt(active[0].netUsdMicro)):null;
   return {model_id,display_name:model_id,nodes_count:row.count,price_gstd:price,is_free:price===0,avg_latency_ms:row.lat.length?Math.round(row.lat.reduce((a,b)=>a+b,0)/row.lat.length):null,category:model_id.startsWith('codellama')?'code':model_id.startsWith('deepseek-r1')?'reasoning':model_id.startsWith('odysseus-research')?'research':model_id.startsWith('odysseus')?'workspace':'chat',pricing:price===0?'free':profiles.length?'quote_required':'legacy_fixed_gstd',operator_offers_count:active.length,paid_paused:profiles.length===row.count&&profiles.every(o=>!o.active),min_executor_usd:net===null?null:String(net/1000000n)+'.'+String(net%1000000n).padStart(6,'0')};
  }).sort((a,b)=>Number(b.is_free)-Number(a.is_free)||b.nodes_count-a.nodes_count||a.price_gstd-b.price_gstd);
  return Response.json({models,updated_at:new Date().toISOString()},{headers});
 }catch(e){const reason=e instanceof Error&&/^(registry_[a-z_]+|registry_http_[0-9]{3})$/.test(e.message)?e.message:'registry_response_invalid';return Response.json({error:'network_registry_unavailable',reason,error_kind:e instanceof Error?e.name:'UnknownError'},{status:503,headers:{...headers,'Cache-Control':'no-store'}});}
}
