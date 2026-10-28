import {it,expect,vi,afterEach} from 'vitest';
vi.mock('./nodes',()=>({NODE_MODEL:'auto',resolveNodeUrl:vi.fn(),streamNodeChat:vi.fn(),callNodeChat:vi.fn().mockResolvedValue({content:'answer',model:'free:small'})}));
vi.mock('./billing',()=>({getModelPrice:(id:string)=>id==='paid:large'?0.005:0,consumeFreeQuota:vi.fn(async()=>({allowed:true}))}));
vi.mock('./kv',()=>({kvGet:vi.fn(async()=> '0:'+'aa'.repeat(32))}));
vi.mock('./paidInference',()=>({paidInference:vi.fn()}));
import handler from '../pages/api/chat';
import {callNodeChat} from './nodes';
import {paidInference} from './paidInference';
import {consumeFreeQuota} from './billing';
afterEach(()=>{vi.clearAllMocks();vi.unstubAllGlobals()});
function response(){return{statusCode:200,body:null as any,status(code:number){this.statusCode=code;return this},json(body:any){this.body=body;return this}}}
it('does not execute or charge a paid model selected on a free tier',async()=>{
 const res=response();await handler({method:'POST',headers:{},body:{model:'paid:large',tier:'free',messages:[{role:'user',content:'hello'}]}} as any,res as any);
 expect(res.statusCode).toBe(402);expect(callNodeChat).not.toHaveBeenCalled();expect(paidInference).not.toHaveBeenCalled();
});
it('passes an explicitly selected free model to the node instead of ignoring it',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}')));
 const res=response();await handler({method:'POST',headers:{},body:{model:'free:small',tier:'free',stream:false,messages:[{role:'user',content:'hello'}]}} as any,res as any);
 expect(res.statusCode).toBe(200);expect(callNodeChat).toHaveBeenCalledWith(expect.any(Array),expect.objectContaining({model:'free:small'}));
});

it('uses catalogue model price on paid tiers instead of the auto tier price',async()=>{
 const res=response();await handler({method:'POST',headers:{'x-session-token':'test'},body:{model:'paid:large',tier:'pro',messages:[{role:'user',content:'hello'}]}} as any,res as any);
 expect(paidInference).toHaveBeenCalledWith(expect.anything(),expect.anything(),expect.objectContaining({price:0.005,model:'paid:large'}));
 expect(consumeFreeQuota).not.toHaveBeenCalled();
});
it('keeps the explicit auto tier price',async()=>{
 const res=response();await handler({method:'POST',headers:{},body:{model:'auto',tier:'standard',messages:[{role:'user',content:'hello'}]}} as any,res as any);
 expect(paidInference).toHaveBeenCalledWith(expect.anything(),expect.anything(),expect.objectContaining({price:0.05,model:'auto'}));
});
it('does not compute when the shared daily free quota is exhausted',async()=>{
 vi.mocked(consumeFreeQuota).mockResolvedValueOnce({allowed:false} as any);
 const res=response();await handler({method:'POST',headers:{},body:{tier:'free',messages:[{role:'user',content:'hello'}]}} as any,res as any);
 expect(res.statusCode).toBe(429);expect(callNodeChat).not.toHaveBeenCalled();
});
it('fails closed before computation if quota storage is unavailable',async()=>{
 vi.mocked(consumeFreeQuota).mockRejectedValueOnce(new Error('unavailable'));
 const res=response();await handler({method:'POST',headers:{},body:{tier:'free',messages:[{role:'user',content:'hello'}]}} as any,res as any);
 expect(res.statusCode).toBe(503);expect(callNodeChat).not.toHaveBeenCalled();
});
