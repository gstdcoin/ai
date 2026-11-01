import { expect,it,vi } from 'vitest';
import { createHash } from 'node:crypto';
import { keyPairFromSeed,sign } from '@ton/crypto';
vi.hoisted(()=>{for(const name of ['KV_REST_API_URL','KV_REST_API_TOKEN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN'])process.env[name]='';vi.stubEnv('NODE_ENV','test');});
import { kvGet,kvSet } from './kv';
import deregister from '../pages/api/v1/nodes/deregister';
const key=keyPairFromSeed(Buffer.alloc(32,81));
async function call(id:string,signed=false){const ts=Date.now();let status=200;
 const headers:any={'x-wallet-address':'public-wallet'};
 if(signed)Object.assign(headers,{'x-gstd-node-ts':String(ts),'x-gstd-node-sig':sign(createHash('sha256').update(id+':'+ts).digest(),key.secretKey).toString('hex')});
 await deregister({method:'POST',body:{node_id:id},headers} as any,{status(n:number){status=n;return this;},json(){return this;}} as any);return status;
}
it('rejects public-wallet spoofing and namespace injection; permits signed shutdown',async()=>{
 const id='deregister-fixture';
 await kvSet('node_key:'+id,key.publicKey.toString('hex'));await kvSet('node:'+id,JSON.stringify({wallet_address:'public-wallet'}));
 await kvSet('node:'+id+':pull_queue',JSON.stringify(['llama3.2:3b']));
 expect(await call(id)).toBe(401);expect(await kvGet('node:'+id)).not.toBeNull();
 expect(await call(id+':pull_queue')).toBe(400);expect(await kvGet('node:'+id+':pull_queue')).not.toBeNull();
 expect(await call(id,true)).toBe(200);expect(await kvGet('node:'+id)).toBeNull();
 expect(await kvGet('node_key:'+id)).toBe(key.publicKey.toString('hex'));
});
