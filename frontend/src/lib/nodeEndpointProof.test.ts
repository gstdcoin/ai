import {it,expect,vi,beforeEach} from 'vitest';
import {createHash} from 'node:crypto';
import {keyPairFromSeed,sign} from '@ton/crypto';
import {kvSet} from './kv';
import {nodeKeyRedisKey} from './nodeAuth';
import {attestNodeEndpoint,ensureNodeEndpoint} from './nodeEndpointProof';
import {endpointVerified} from './nodeEndpointStatus';
const state=vi.hoisted(()=>({fetch:vi.fn()}));
vi.mock('./nodeFetch',()=>({fetchNode:(...a:any[])=>state.fetch(...a)}));
const honest=keyPairFromSeed(Buffer.alloc(32,31)),attacker=keyPairFromSeed(Buffer.alloc(32,32)),url='https://honest.example.com/base';
function respond(pair=honest,id='honest-node'){
 state.fetch.mockImplementation(async(target:string)=>{
  const p=new URL(target).searchParams,expires=Number(p.get('expires_at')),nonce=p.get('nonce'),endpoint=p.get('url');
  const hash=createHash('sha256').update(JSON.stringify(['gstd:endpoint:v1',id,endpoint,nonce,expires])).digest();
  return Response.json({node_id:id,url:endpoint,nonce,expires_at:expires,public_key:pair.publicKey.toString('hex'),signature:sign(hash,pair.secretKey).toString('hex')});
 });
}
beforeEach(async()=>{state.fetch.mockReset();await kvSet(nodeKeyRedisKey('honest-node'),honest.publicKey.toString('hex'));await kvSet(nodeKeyRedisKey('attacker-node'),attacker.publicKey.toString('hex'));});
it('accepts matching endpoint key and reuses its bounded proof only for the same identity and URL',async()=>{
 respond();const record:any={node_id:'honest-node',node_url:url};expect(await attestNodeEndpoint('honest-node',record)).toBe(true);expect(endpointVerified(record)).toBe(true);
 const next={...record};expect(await ensureNodeEndpoint('honest-node',next,record)).toBe(true);expect(state.fetch).toHaveBeenCalledTimes(1);
 expect(endpointVerified({...record,node_url:'https://changed.example.com'})).toBe(false);
 expect(endpointVerified({...record,endpoint_verified_at:Date.now()-86400001})).toBe(false);
});
it('rejects attacker alias pointing to honest endpoint even when it relays a valid honest signature',async()=>{
 respond();const record:any={node_id:'attacker-node',node_url:url};expect(await attestNodeEndpoint('attacker-node',record)).toBe(false);expect(endpointVerified(record)).toBe(false);
});
it('does not grandfather an unproved record or preserve proof after endpoint rotation',async()=>{
 respond(attacker,'attacker-node');const previous:any={node_id:'honest-node',node_url:url};
 expect(await ensureNodeEndpoint('honest-node',{...previous},previous)).toBe(false);
 respond();await attestNodeEndpoint('honest-node',previous);
 state.fetch.mockResolvedValue(Response.json({error:'wrong proof'}));
 const changed:any={...previous,node_url:'https://changed.example.com'};expect(await ensureNodeEndpoint('honest-node',changed,previous)).toBe(false);expect(endpointVerified(changed)).toBe(false);
});
