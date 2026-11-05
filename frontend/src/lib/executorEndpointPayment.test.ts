import {it,expect,vi} from 'vitest';
import {kvSet} from './kv';
import {reconcileMoney,moneyBalance,nano} from './money';
import {paidInference} from './paidInference';
const state=vi.hoisted(()=>({nodes:[] as any[],fetch:vi.fn()}));
vi.mock('./nodes',()=>({getActiveNodes:async()=>state.nodes}));
vi.mock('./nodeFetch',()=>({fetchNode:(...a:any[])=>state.fetch(...a)}));
const wallet='0:'+'91'.repeat(32),operator='0:'+'92'.repeat(32),owner='0:'+'93'.repeat(32);
it('does not pay a fresh identity alias for another endpoint or a URL changed after node selection',async()=>{
 await reconcileMoney({owner,jettonWallet:owner,reserve:nano('100').toString()},{manifest:'endpoint-payment',legacyHold:'0',migrationReviewed:true,allocations:[{wallet,amount_nano:nano('1').toString(),reference:'endpoint-payment'}]});
 state.nodes=[{nodeId:'alias-node',url:'https://honest.example.com',models:['exact:model']}];
 const record={node_id:'alias-node',node_url:'https://honest.example.com',wallet_address:operator,capabilities:['exact:model']};
 async function call(id:string){const response:any={code:200,status(n:number){this.code=n;return this;},json(v:any){this.value=v;return this;}};await paidInference({headers:{'idempotency-key':id},body:{}} as any,response,{wallet,price:0.005,model:'exact:model',messages:[{role:'user',content:'work'}],maxTokens:32,surface:'api'});return response;}
 await kvSet('node:alias-node',JSON.stringify(record));expect((await call('unproved-alias')).value.error).toBe('no_paid_executor');
 await kvSet('node:alias-node',JSON.stringify({...record,node_url:'https://attacker.example.com',endpoint_verified_url:'https://attacker.example.com',endpoint_verified_key:'aa'.repeat(32),endpoint_verified_at:Date.now()}));
 expect((await call('rotated-alias')).value.error).toBe('no_paid_executor');
 expect(state.fetch).not.toHaveBeenCalled();expect((await moneyBalance(wallet)).balance_gstd).toBe(1);
});
