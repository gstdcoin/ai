import {it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({calls:[] as any[],fail:false}));
vi.mock('../pages/api/v1/chat/completions',()=>({default:async(req:any,res:any)=>{if(state.fail)throw Error('private-backend-detail');state.calls.push(req);return res.status(200).json({model:'local:small',choices:[{message:{content:'fixture'}}]});}}));
import handler from '../pages/api/v1/agents/infer';
import {validateAgentInference} from './agentAccess';
const good=()=>({model:'auto',messages:[{role:'user',content:'Test prompt'}],allow_network:true,max_cost_gstd:0,max_tokens:32});
async function call(body:any,headers:any={},method='POST'){
 const res={code:200,value:null as any,setHeader(){},status(n:number){this.code=n;return this;},json(v:any){this.value=v;return this;}};
 await handler({method,body,headers,cookies:{session:'must-not-forward'},query:{key:'must-not-forward'}} as any,res as any);return res;
}
it('denies paid models, missing consent, credentials and oversized payloads before calling inference',async()=>{
 state.calls=[];
 for(const [patch,error] of [[{allow_network:false},'network_consent_required'],[{max_cost_gstd:1},'zero_cost_limit_required'],[{model:'qwen2.5:0.5b'},'paid_model_requires_wallet'],[{max_tokens:257},'invalid_max_tokens'],[{messages:[{role:'tool',content:'bad'}]},'invalid_messages'],[{stream:true},'unsupported_parameter'],[{messages:[{role:'user',content:'a'.repeat(4001)}]},'invalid_messages']] as const){
  expect((await call({...good(),...patch})).value.error).toBe(error);
 }
 for(const key of ['authorization','x-session-token','x-api-key','x-wallet-address','x-bot-token'])expect((await call(good(),{[key]:'fixture'})).value.error).toBe('credentials_not_supported');
 expect((await call(good(),{},'GET')).code).toBe(405);expect(state.calls).toEqual([]);
});
it('uses existing free inference and IP quotas without forwarding a spending identity or extra flags',async()=>{
 state.calls=[];const res=await call(good(),{'cf-connecting-ip':'192.0.2.1',cookie:'fixture','x-other':'fixture'});
 expect(res.code).toBe(200);expect(state.calls).toHaveLength(1);
 expect(state.calls[0].headers).toEqual({'content-type':'application/json','cf-connecting-ip':'192.0.2.1'});
 expect(state.calls[0].cookies).toEqual({});expect(state.calls[0].query).toEqual({});
 expect(state.calls[0].body).toMatchObject({model:'auto',stream:false,max_tokens:32});
 expect(validateAgentInference({...good(),model:'llama3.2:1b'}).model).toBe('llama3.2:1b');
});

it('sanitizes asynchronous upstream failures rather than leaking backend details',async()=>{
 state.fail=true;try{const res=await call(good());expect(res.code).toBe(503);expect(res.value).toEqual({error:'agent_service_unavailable'});}finally{state.fail=false;}
});
