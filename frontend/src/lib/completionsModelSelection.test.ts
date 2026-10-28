import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('./kv',()=>({kvSet:vi.fn(),kvRateLimit:vi.fn(async()=>true)}));
vi.mock('./nodes',()=>({getActiveNodes:vi.fn(async()=>[{url:'https://node.example'}])}));
vi.mock('./walletSession',()=>({sessionWallet:vi.fn(async()=>null)}));
vi.mock('./billing',()=>({getModelPrice:()=>0,chargeFee:vi.fn(async()=>({ok:true,free:true})),refundFee:vi.fn()}));
vi.mock('../pages/api/v1/enterprise/keys',()=>({validateEnterpriseKey:vi.fn()}));
vi.mock('../pages/api/v1/enterprise/usage',()=>({recordEnterpriseUsage:vi.fn()}));
import handler from '../pages/api/v1/chat/completions';
import { getActiveNodes } from './nodes';
import { validateEnterpriseKey } from '../pages/api/v1/enterprise/keys';
function response(){return{code:200,body:null as any,status(c:number){this.code=c;return this},json(b:any){this.body=b;return this}}}
async function invoke(model:string, headers:Record<string,string>={}){const res=response();await handler({method:'POST',headers,body:{model,messages:[{role:'user',content:'hello'}]}} as any,res as any);return res}
beforeEach(()=>{vi.clearAllMocks();vi.mocked(getActiveNodes).mockResolvedValue([{url:'https://node.example'}] as any);vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({model:'llama3.2:3b',choices:[{message:{content:'answer'}}]}))))});
afterEach(()=>vi.unstubAllGlobals());
it('keeps a requested model exact instead of silently aliasing a different provider model',async()=>{
 vi.mocked(getActiveNodes).mockResolvedValue([]);
 const res=await invoke('gpt-4');expect(res.code).toBe(503);expect(getActiveNodes).toHaveBeenCalledWith('gpt-4');expect(fetch).not.toHaveBeenCalled();expect(res.body._gstd.error).toBe('model_unavailable');
});
it('rejects a substituted model returned by a node',async()=>{
 const res=await invoke('phi3:mini');expect(res.code).toBe(502);expect(res.body.error).toBe('model_mismatch');
});
it('rejects forbidden enterprise models rather than choosing another',async()=>{
 vi.mocked(validateEnterpriseKey).mockResolvedValue({id:'test',rpm_limit:10,allowed_models:['phi3:mini']} as any);
 const res=await invoke('llama3.2:3b',{authorization:'Bearer gstd_test'});expect(res.code).toBe(403);expect(fetch).not.toHaveBeenCalled();expect(getActiveNodes).not.toHaveBeenCalled();
});
it('returns the requested available model',async()=>{expect((await invoke('llama3.2:3b')).code).toBe(200)});
