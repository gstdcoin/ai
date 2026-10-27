import {it,expect,vi,afterEach} from 'vitest';
vi.mock('./nodes',()=>({NODE_MODEL:'auto',resolveNodeUrl:vi.fn(),streamNodeChat:vi.fn(),callNodeChat:vi.fn().mockResolvedValue({content:'answer',model:'free:small'})}));
vi.mock('./billing',()=>({getModelPrice:(id:string)=>id==='paid:large'?1:0}));
vi.mock('./paidInference',()=>({paidInference:vi.fn()}));
import handler from '../pages/api/chat';
import {callNodeChat} from './nodes';
import {paidInference} from './paidInference';
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
