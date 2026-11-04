import {getModelPrice} from './modelPricing';
export class AgentAccessError extends Error {
 constructor(public status:number,code:string){super(code);}
}
export function validateAgentInference(body:unknown){
 const fail=(status:number,code:string):never=>{throw new AgentAccessError(status,code);};
 if(!body||typeof body!=='object'||Array.isArray(body))return fail(400,'invalid_request');
 const b=body as Record<string,unknown>;
 if(Object.keys(b).some(k=>!['model','messages','max_tokens','allow_network','max_cost_gstd'].includes(k)))return fail(400,'unsupported_parameter');
 if(b.allow_network!==true)return fail(400,'network_consent_required');
 if(b.max_cost_gstd!==0)return fail(400,'zero_cost_limit_required');
 const model=b.model===undefined?'auto':b.model;
 if(typeof model!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(model))return fail(400,'invalid_model');
 if(getModelPrice(model)!==0)return fail(402,'paid_model_requires_wallet');
 const max_tokens=b.max_tokens===undefined?128:b.max_tokens;
 if(!Number.isSafeInteger(max_tokens)||Number(max_tokens)<1||Number(max_tokens)>256)return fail(400,'invalid_max_tokens');
 if(!Array.isArray(b.messages)||!b.messages.length||b.messages.length>12)return fail(400,'invalid_messages');
 let bytes=0;
 const messages=b.messages.map(m=>{
  if(!m||typeof m!=='object'||Array.isArray(m)||Object.keys(m).some(k=>!['role','content'].includes(k))||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string'||!m.content.trim()||m.content.length>4000)return fail(400,'invalid_messages');
  bytes+=Buffer.byteLength(m.content);
  if(bytes>16000)return fail(400,'messages_too_large');
  return{role:m.role as string,content:m.content as string};
 });
 return{model,messages,max_tokens:Number(max_tokens),stream:false,temperature:0.2};
}
