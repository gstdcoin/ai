import {getCloudflareContext} from '@opennextjs/cloudflare';
const supported=new Set(['ESCROW_TESTNET_TONAPI_KEY','ESCROW_TESTNET_TONCENTER_API_KEY','ESCROW_MAINNET_TONAPI_KEY','ESCROW_MAINNET_TONCENTER_API_KEY']);
/** Request-scoped Worker bindings are authoritative. Never expose the returned value. */
export function escrowRuntimeSecret(name:string):string|undefined{
 if(!supported.has(name))throw Error('unsupported_escrow_secret');
 let value:unknown;
 try{value=(getCloudflareContext().env as Record<string,unknown>)[name];}catch{/* Node tests/local development have no Worker context. */}
 if(typeof value!=='string')value=process.env[name];
 return typeof value==='string'?value.trim()||undefined:undefined;
}
