import { beforeEach,expect,it,vi } from 'vitest';
vi.mock('./kv',()=>({kvRateLimit:vi.fn(async()=>true),kvSet:vi.fn()}));
vi.mock('../pages/api/v1/enterprise/keys',()=>({validateEnterpriseKey:vi.fn(async()=>({id:'fixture',org:'Test',tier:'standard',rpm_limit:1,allowed_models:['allowed:small']}))}));
vi.mock('../pages/api/v1/enterprise/usage',()=>({recordEnterpriseUsage:vi.fn()}));
vi.mock('./nodes',()=>({getActiveNodes:vi.fn(async()=>[])}));
vi.mock('./walletSession',()=>({sessionWallet:vi.fn(async()=>null)}));
import batch from '../pages/api/v1/chat/batch';
import {kvRateLimit} from './kv';
import {getActiveNodes} from './nodes';
beforeEach(()=>vi.clearAllMocks());
async function call(body:any,headers:any={authorization:'Bearer gstd_fixture','idempotency-key':'batch-test-key'}) {
 let status=200,value:any;
 await batch(Object.create({get method(){return 'POST';},get body(){return body;},get headers(){return headers;}}) as any,{status(n:number){status=n;return this;},json(v:any){value=v;return this;}} as any);
 return{status,value};
}
it('enforces the canonical enterprise model restriction without contacting a node',async()=>{
 const r=await call({prompts:['private question'],model:'forbidden:large'});
 expect(r.status).toBe(403);expect(r.value.errors[0].error).toBe('model_not_allowed');expect(getActiveNodes).not.toHaveBeenCalled();
});
it('counts each item against the key quota and stops work when it is exhausted',async()=>{
 vi.mocked(kvRateLimit).mockResolvedValue(false);
 const r=await call({prompts:['one','two'],model:'allowed:small'});
 expect(r.status).toBe(429);expect(kvRateLimit).toHaveBeenCalledTimes(2);
 expect(getActiveNodes).not.toHaveBeenCalled();vi.mocked(kvRateLimit).mockResolvedValue(true);
});
it('requires retry identity and limits fanout before authorization or compute',async()=>{
 expect((await call({prompts:['one']},{authorization:'Bearer gstd_fixture'})).status).toBe(400);
 expect((await call({prompts:['one','two','three','four']})).status).toBe(400);
 expect(kvRateLimit).not.toHaveBeenCalled();
});
