import {createHash} from 'node:crypto';
import {matchesSecret} from './secretAuth';

const ORIGIN='https://app.gstdtoken.xyz';
export const TELEGRAM_DOMAIN_MAINTENANCE_PATH='/api/v1/telegram/admin/canonical-domain';
type Environment=Record<string,unknown>;

/** Fixed, operator-authenticated repair. Credentials remain inside the production Worker. */
export async function repairTelegramDomain(request:Request,env:Environment,transport:typeof fetch=fetch):Promise<Response>{
 const reply=(body:Record<string,unknown>,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 const url=new URL(request.url);
 if(env.GSTD_PRIVATE_PREVIEW!==undefined||url.origin!==ORIGIN||url.pathname!==TELEGRAM_DOMAIN_MAINTENANCE_PATH)return reply({error:'not_found'},404);
 if(request.method!=='POST')return new Response(null,{status:405,headers:{Allow:'POST','Cache-Control':'no-store'}});
 const authorization=request.headers.get('authorization')||'';
 const expected=typeof env.OPEN_INTELLIGENCE_CRON_SECRET==='string'?env.OPEN_INTELLIGENCE_CRON_SECRET:undefined;
 if(authorization.length>520||!authorization.startsWith('Bearer ')||!matchesSecret(authorization.slice(7),expected))return reply({error:'operator_auth_required'},403);
 if(request.headers.has('origin')||request.body!==null||request.headers.get('x-gstd-maintenance')!=='canonical-domain-v1')return reply({error:'invalid_maintenance_request'},400);
 const token=typeof env.TELEGRAM_BOT_TOKEN==='string'?env.TELEGRAM_BOT_TOKEN:'';
 if(!token)return reply({error:'telegram_not_configured'},503);
 try{
  const call=async(method:string,body:Record<string,unknown>={})=>{
   const response=await transport('https://api.telegram.org/bot'+token+'/'+method,{
    method:'POST',redirect:'manual',signal:AbortSignal.timeout(5000),headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
   });
   if(!response.ok)throw Error('telegram_setup_failed');
   const data=await response.json() as {ok?:boolean;result?:any};
   if(data.ok!==true||data.result===undefined)throw Error('telegram_setup_failed');
   return data.result;
  };
  const identity=await call('getMe');
  if(identity.is_bot!==true||identity.username!=='gstdaibot')throw Error('telegram_setup_failed');
  const webhook=ORIGIN+'/api/v1/telegram/webhook',app=ORIGIN+'/tma';
  const secret=createHash('sha256').update('gstd-tg-webhook:'+token).digest('hex');
  if(await call('setWebhook',{url:webhook,secret_token:secret,allowed_updates:['message','callback_query','inline_query'],drop_pending_updates:false})!==true)throw Error('telegram_setup_failed');
  if(await call('setChatMenuButton',{menu_button:{type:'web_app',text:'GSTD',web_app:{url:app}}})!==true)throw Error('telegram_setup_failed');
  const [registered,menu]=await Promise.all([call('getWebhookInfo'),call('getChatMenuButton')]);
  if(registered.url!==webhook||!Number.isSafeInteger(registered.pending_update_count)||registered.pending_update_count<0||
   !Array.isArray(registered.allowed_updates)||!['message','callback_query'].every(kind=>registered.allowed_updates.includes(kind))||
   menu.type!=='web_app'||menu.web_app?.url!==app)throw Error('telegram_setup_failed');
  return reply({success:true,canonical_webhook:true,canonical_menu:true,pending_updates_preserved:true},200);
 }catch{return reply({error:'telegram_setup_failed'},502);}
}
