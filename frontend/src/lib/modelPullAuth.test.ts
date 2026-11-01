import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({wallet:null as string|null,node:null as string|null,writes:vi.fn()}));
vi.mock('./walletSession',()=>({sessionWallet:async()=>state.wallet}));
vi.mock('./kv',()=>({kvGet:async(key:string)=>key.endsWith(':pull_queue')?null:state.node,kvSet:state.writes}));
import pull from '../pages/api/v1/models/pull';
beforeEach(()=>{state.wallet=null;state.node=null;state.writes.mockClear();});
async function call(body:any) {let status=200,value:any;await pull({method:'POST',body,headers:{}} as any,
 {status(n:number){status=n;return this;},json(v:any){value=v;return this;}} as any);return{status,value};}
it('does not contact a caller-selected URL and rejects unauthenticated pulls',async()=>{
 const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('network must not be used'));
 try{expect((await call({model_id:'llama3.2:3b',node_url:'https://example.com'})).status).toBe(401);expect(network).not.toHaveBeenCalled();}
 finally{network.mockRestore();}
});
it('requires ownership and preserves the bounded owner queue',async()=>{
 state.wallet='owner';state.node=JSON.stringify({wallet_address:'other',last_seen:new Date().toISOString()});
 expect((await call({node_id:'node',model_id:'llama3.2:3b'})).status).toBe(403);
 state.node=JSON.stringify({wallet_address:'owner',last_seen:new Date().toISOString()});
 // A fresh node starts with an empty bounded queue.
 const result=await call({node_id:'node',model_id:'llama3.2:3b'});
 expect(result.status).toBe(200);expect(state.writes).toHaveBeenCalledWith('node:node:pull_queue',JSON.stringify(['llama3.2:3b']),86400);
});
