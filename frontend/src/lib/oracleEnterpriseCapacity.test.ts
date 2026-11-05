import {it,expect,vi,afterEach} from 'vitest';
import {kvSet} from './kv';
const state=vi.hoisted(()=>({id:'oracle-capacity-fixture',fetch:vi.fn()}));
vi.mock('../pages/api/v1/enterprise/keys',()=>({validateEnterpriseKey:async()=>({id:state.id,rpm_limit:100,monthly_limit_tokens:100000,allowed_models:['llama3.2:3b']})}));
vi.mock('./nodeFetch',()=>({fetchNode:(...args:any[])=>state.fetch(...args)}));
import evaluate from '../pages/api/v1/oracle/evaluate';
afterEach(()=>vi.unstubAllEnvs());
async function call(id:string){const res:any={code:200,status(n:number){this.code=n;return this;},json(v:any){this.value=v;return this;}};await evaluate({method:'POST',headers:{authorization:'Bearer gstd_fixture','idempotency-key':id},body:{symbol:'BTCUSDT',side:'LONG'}} as any,res);return res;}
it('shares admission with enterprise completions and retains explicit operator-local routing',async()=>{
 vi.stubEnv('GSTD_NODE_URL','http://127.0.0.1:11434');
 const month=new Date().toISOString().slice(0,7);await kvSet('enterprise:capacity:v1:'+state.id+':'+month,JSON.stringify({used:100000}));
 expect((await call('oracle-exhausted')).code).toBe(429);expect(state.fetch).not.toHaveBeenCalled();
 state.id='oracle-capacity-control-'+crypto.randomUUID();state.fetch.mockResolvedValue(Response.json({model:'llama3.2:3b',choices:[{message:{content:'ENTER: NO confidence 0'}}]}));
 expect((await call('oracle-control')).code).toBe(200);expect(state.fetch.mock.calls[0][2]).toBe(true);expect(JSON.parse(state.fetch.mock.calls[0][1].body).max_tokens).toBe(512);
});
