import {createHash} from 'node:crypto';
import {keyPairFromSeed,sign} from '@ton/crypto';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import approved from './nodeReleaseApproved.json';

// Must match gstdbot/src/lib/platform-auth.ts. Never accept a caller's trust key.
export const RELEASE_PUBLIC_KEY='1451788de7861b5b2dc31073606bdbab337682fe7acb74b317ad34e60ecd2a75';
export const APPROVED_NODE_RELEASE=Object.freeze(approved);
export function signApprovedRelease(seed:string|undefined,now=Date.now(),expectedKey=RELEASE_PUBLIC_KEY){
 if(!seed||!/^[a-fA-F0-9]{64}$/.test(seed)||!Number.isSafeInteger(now))throw Error('release_signing_unavailable');
 const pair=keyPairFromSeed(Buffer.from(seed,'hex'));
 try{
  if(pair.publicKey.toString('hex')!==expectedKey)throw Error('release_signing_unavailable');
  const manifest={...APPROVED_NODE_RELEASE,timestamp:now};
  if(!/^[a-f0-9]{40}$/.test(manifest.commit)||manifest.branch!=='main'||!/^\d+\.\d+\.\d+$/.test(manifest.version))throw Error('release_not_approved');
  const hash=createHash('sha256').update(`${manifest.commit}:${manifest.branch}:${manifest.version}:${manifest.timestamp}`).digest();
  return{...manifest,sig:sign(hash,pair.secretKey).toString('hex')};
 }finally{pair.secretKey.fill(0);}
}
export function releaseSeed():string|undefined{
 try{
  const value=(getCloudflareContext().env as Record<string,unknown>).PLATFORM_RELEASE_SIGNING_SEED;
  return typeof value==='string'?value.trim():undefined;
 }catch{return process.env.PLATFORM_RELEASE_SIGNING_SEED?.trim();}
}
