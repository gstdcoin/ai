import {randomBytes,createHash} from 'node:crypto';
import {kvGet} from './kv';
import {nodeKeyRedisKey} from './nodeAuth';
import {verifyEd25519} from './ed25519';
import {safeNodeUrl} from './safeNodeUrl';
import {fetchNode} from './nodeFetch';
import {endpointVerified} from './nodeEndpointStatus';
export async function attestNodeEndpoint(nodeId:string,record:any){
 delete record.endpoint_verified_url;delete record.endpoint_verified_key;delete record.endpoint_verified_at;
 const url=safeNodeUrl(record.node_url||record.multiaddrs?.[0]||'');if(!url)return false;
 const key=await kvGet(nodeKeyRedisKey(nodeId));if(!key)return false;
 const nonce=randomBytes(32).toString('hex'),expires=Date.now()+60000;
 const target=new URL(url+'/.well-known/gstd-node');target.search=new URLSearchParams({url,nonce,expires_at:String(expires)}).toString();
 try{
  const r=await fetchNode(target.toString(),{signal:AbortSignal.timeout(4000)});
  if(!r.ok||Number(r.headers.get('content-length')||0)>4096)return false;
  const reader=r.body?.getReader();if(!reader)return false;const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const v=await reader.read();if(v.done)break;size+=v.value.byteLength;if(size>4096)return false;chunks.push(v.value);}}finally{await reader.cancel().catch(()=>undefined);}
  const proof=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(proof.node_id!==nodeId||proof.url!==url||proof.nonce!==nonce||proof.expires_at!==expires||proof.public_key!==key||typeof proof.signature!=='string'||!/^[a-f0-9]{128}$/.test(proof.signature))return false;
  const message=createHash('sha256').update(JSON.stringify(['gstd:endpoint:v1',nodeId,url,nonce,expires])).digest();
  if(!verifyEd25519(message,Buffer.from(proof.signature,'hex'),Buffer.from(key,'hex')))return false;
  Object.assign(record,{endpoint_verified_url:url,endpoint_verified_key:key,endpoint_verified_at:Date.now()});return true;
 }catch{return false;}
}

export async function ensureNodeEndpoint(nodeId:string,record:any,previous:any){
 const url=safeNodeUrl(record.node_url||record.multiaddrs?.[0]||'');
 if(previous?.node_id===nodeId&&endpointVerified(previous)&&url===previous.endpoint_verified_url){
  Object.assign(record,{endpoint_verified_url:previous.endpoint_verified_url,endpoint_verified_key:previous.endpoint_verified_key,endpoint_verified_at:previous.endpoint_verified_at});return true;
 }
 return attestNodeEndpoint(nodeId,record);
}
