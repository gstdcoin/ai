import {createHash} from 'node:crypto';
import {kvMGet,kvMoneyCAS} from './kv';
/** Capacity units, not a claim of measured model tokens. No GSTD movements. */
export async function admitEnterpriseCapacity(keyId:string,limit:number,messages:{role:string;content:string}[],maxTokens:number,requestId:string){
 if(!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(maxTokens)||maxTokens<1||maxTokens>16384||
 !/^[A-Za-z0-9_-]{8,100}$/.test(requestId)||!Array.isArray(messages)||!messages.length||messages.length>200||
 messages.some(m=>!m||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string'))throw Error('invalid_enterprise_capacity_request');
 const bytes=messages.reduce((n,m)=>n+Buffer.byteLength(m.content),0);
 if(bytes>262144)throw Error('invalid_enterprise_capacity_request');
 const units=bytes+1024*messages.length+maxTokens,month=new Date().toISOString().slice(0,7);
 const budget='enterprise:capacity:v1:'+keyId+':'+month;
 const receipt='enterprise:capacity-request:v1:'+createHash('sha256').update(JSON.stringify([keyId,requestId])).digest('hex');
 for(let attempt=0;attempt<12;attempt++){
  const [raw,seen]=await kvMGet([budget,receipt]);if(seen)throw Error('enterprise_request_already_admitted');
  const used=raw?JSON.parse(raw).used:0;if(!Number.isSafeInteger(used)||used<0)throw Error('enterprise_capacity_unavailable');
  if(used+units>limit)throw Error('enterprise_monthly_capacity_exceeded');
  if(await kvMoneyCAS({[budget]:raw,[receipt]:seen},{[budget]:JSON.stringify({used:used+units}),[receipt]:JSON.stringify({month,units,admitted_at:Date.now()})},undefined,undefined,{[receipt]:3600}))
   return{month,units,remaining:limit-used-units,accounting:'reserved_capacity_units',refund_policy:'no_refund_after_dispatch',token_measurement:false,request_identity_ttl_seconds:3600};
 }
 throw Error('enterprise_capacity_unavailable');
}
