import {getCloudflareContext} from '@opennextjs/cloudflare';
import approved from './nodeReleaseApproved.json';

// Must match gstdbot/src/lib/platform-auth.ts. Never accept a caller's trust key.
export const RELEASE_PUBLIC_KEY='82a7b29cca0bff9cdd7ac285277af45287bce77066cf40548ca16ab34a63f30e';
export const APPROVED_NODE_RELEASE=Object.freeze(approved);
export async function signApprovedRelease(seed:string|undefined,now=Date.now(),expectedKey=RELEASE_PUBLIC_KEY){
 if(!seed||!/^[a-fA-F0-9]{64}$/.test(seed)||!Number.isSafeInteger(now))throw Error('release_signing_unavailable');
 const encoded=Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.from(seed,'hex')]);
 try{
  const key=await crypto.subtle.importKey('pkcs8',encoded,{name:'Ed25519'},true,['sign']);
  const exported=await crypto.subtle.exportKey('jwk',key);
  if(!exported.x||Buffer.from(exported.x,'base64url').toString('hex')!==expectedKey)throw Error('release_signing_unavailable');
  const manifest={...APPROVED_NODE_RELEASE,timestamp:now};
  if(!/^[a-f0-9]{40}$/.test(manifest.commit)||manifest.branch!=='main'||!/^\d+\.\d+\.\d+$/.test(manifest.version))throw Error('release_not_approved');
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${manifest.commit}:${manifest.branch}:${manifest.version}:${manifest.timestamp}`));
  return{...manifest,sig:Buffer.from(await crypto.subtle.sign('Ed25519',key,hash)).toString('hex')};
 }finally{encoded.fill(0);}
}
export function releaseSeed():string|undefined{
 try{
  const value=(getCloudflareContext().env as Record<string,unknown>).PLATFORM_RELEASE_SIGNING_SEED;
  return typeof value==='string'?value.trim():undefined;
 }catch{return process.env.PLATFORM_RELEASE_SIGNING_SEED?.trim();}
}
