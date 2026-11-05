import {afterEach,beforeEach,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({nodes:vi.fn(),charge:vi.fn()}));
vi.mock('./nodes',()=>({getActiveNodes:(model:string)=>state.nodes(model)}));
vi.mock('./kv',()=>({kvRateLimit:async()=>true,kvSet:async()=>{},kvGet:async()=>null}));
vi.mock('./walletSession',()=>({sessionWallet:async()=>null}));
vi.mock('./billing',async()=>({...await vi.importActual<typeof import('./modelPricing')>('./modelPricing'),chargeFee:(...args:any[])=>state.charge(...args),refundFee:vi.fn()}));
vi.mock('../pages/api/v1/enterprise/keys',()=>({validateEnterpriseKey:async()=>null}));
vi.mock('../pages/api/v1/enterprise/usage',()=>({recordEnterpriseUsage:async()=>{}}));
import handler from '../pages/api/v1/chat/completions';
function response(){return{code:200,body:null as any,status(c:number){this.code=c;return this;},json(b:any){this.body=b;return this;}};}
beforeEach(()=>{state.nodes.mockReset();state.charge.mockReset();state.charge.mockResolvedValue({ok:true,free:true,remaining:49});});
afterEach(()=>vi.unstubAllGlobals());
it('omitted model uses auto and an actually installed model instead of requiring a removed default',async()=>{
 state.nodes.mockResolvedValue([{nodeId:'node',url:'https://worker.example'}]);
 const request=vi.fn(async(_url:any,options:any)=>{
  expect(JSON.parse(options.body).model).toBe('auto');
  return {ok:true,json:async()=>({model:'qwen2.5:0.5b',choices:[{message:{content:'OK'}}]})};
 });vi.stubGlobal('fetch',request);
 const res=response();await handler({method:'POST',headers:{},body:{messages:[{role:'user',content:'Reply OK'}],max_tokens:4}} as any,res as any);
 expect(res.code).toBe(200);expect(res.body.model).toBe('qwen2.5:0.5b');
 expect(state.nodes).toHaveBeenCalledWith('auto');expect(state.charge).toHaveBeenCalledWith(null,'auto',null,expect.any(String));
});
it('an explicitly requested unavailable free model still fails without silently substituting auto',async()=>{
 state.nodes.mockResolvedValue([]);const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const res=response();await handler({method:'POST',headers:{},body:{model:'llama3.2:3b',messages:[{role:'user',content:'Hello'}]}} as any,res as any);
 expect(res.code).toBe(503);expect(res.body._gstd.error).toBe('model_unavailable');
 expect(state.nodes).toHaveBeenCalledWith('llama3.2:3b');expect(fetcher).not.toHaveBeenCalled();
});

// Consumer fixture: outbound transport is validated separately in nodeFetch.test.ts.
vi.mock('./nodeFetch',()=>({fetchNode:(url:string,init:RequestInit)=>fetch(url,init)}));
