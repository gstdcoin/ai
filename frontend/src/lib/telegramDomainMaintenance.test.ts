import {expect,it,vi} from 'vitest';
import {repairTelegramDomain,TELEGRAM_DOMAIN_MAINTENANCE_PATH as path} from './telegramDomainMaintenance';
const env={OPEN_INTELLIGENCE_CRON_SECRET:'operator-fixture',TELEGRAM_BOT_TOKEN:'token-fixture'};
const req=(headers:Record<string,string>={},url='https://app.gstdtoken.xyz'+path,method='POST',body?:string)=>new Request(url,{method,headers:{Authorization:'Bearer operator-fixture','x-gstd-maintenance':'canonical-domain-v1',...headers},body});
const transport=()=>vi.fn<typeof fetch>(async(input)=>{
 const method=String(input).split('/').pop();
 const results:Record<string,unknown>={getMe:{is_bot:true,username:'gstdaibot'},setWebhook:true,setChatMenuButton:true,
  getWebhookInfo:{url:'https://app.gstdtoken.xyz/api/v1/telegram/webhook',pending_update_count:2,allowed_updates:['message','callback_query','inline_query']},
  getChatMenuButton:{type:'web_app',web_app:{url:'https://app.gstdtoken.xyz/tma'}}};
 return Response.json({ok:true,result:results[method!]});
});
it('requires production origin, operator authentication, explicit intent and an empty request',async()=>{
 const send=transport();
 for(const [r,e,status] of [
  [req({Authorization:'Bearer wrong'}),env,403],[req(),{},403],
  [req(),{...env,GSTD_PRIVATE_PREVIEW:'1'},404],[req({},'https://preview.example'+path),env,404],
  [req({},undefined,'GET'),env,405],[req({'x-gstd-maintenance':'wrong'}),env,400],
  [req({Origin:'https://attacker.invalid'}),env,400],[req({},undefined,'POST','{"url":"https://attacker.invalid"}'),env,400],
 ] as const)expect((await repairTelegramDomain(r,e,send)).status).toBe(status);
 expect(send).not.toHaveBeenCalled();
});
it('repairs only fixed canonical URLs, preserves queued updates and never sends user messages',async()=>{
 const send=transport(),r=await repairTelegramDomain(req(),env,send),body=await r.json();
 expect(r.status).toBe(200);expect(body).toEqual({success:true,canonical_webhook:true,canonical_menu:true,pending_updates_preserved:true});
 expect(r.headers.get('Cache-Control')).toBe('no-store');
 const calls=send.mock.calls.map(([url,init])=>({method:String(url).split('/').pop(),body:JSON.parse(String(init?.body)),redirect:init?.redirect}));
 expect(calls.map(x=>x.method).sort()).toEqual(['getChatMenuButton','getMe','getWebhookInfo','setChatMenuButton','setWebhook'].sort());
 expect(calls.find(x=>x.method==='setWebhook')?.body).toMatchObject({url:'https://app.gstdtoken.xyz/api/v1/telegram/webhook',drop_pending_updates:false});
 expect(calls.every(x=>x.redirect==='manual')).toBe(true);
 expect(JSON.stringify(body)).not.toContain(env.TELEGRAM_BOT_TOKEN);expect(JSON.stringify(body)).not.toContain(env.OPEN_INTELLIGENCE_CRON_SECRET);
});
it('checks bot identity before mutations and sanitizes failed API responses',async()=>{
 const send=vi.fn<typeof fetch>(async()=>Response.json({ok:true,result:{is_bot:true,username:'another_bot',private:env.TELEGRAM_BOT_TOKEN}}));
 const r=await repairTelegramDomain(req(),env,send);expect(r.status).toBe(502);expect(send).toHaveBeenCalledTimes(1);
 expect(await r.text()).toBe('{"error":"telegram_setup_failed"}');
});
it('stops after a failed webhook write and does not claim success',async()=>{
 const send=transport();send.mockImplementationOnce(async()=>Response.json({ok:true,result:{is_bot:true,username:'gstdaibot'}}));
 send.mockImplementationOnce(async()=>Response.json({ok:false,description:env.TELEGRAM_BOT_TOKEN},{status:400}));
 const r=await repairTelegramDomain(req(),env,send);expect(r.status).toBe(502);expect(send).toHaveBeenCalledTimes(2);expect(await r.text()).not.toContain(env.TELEGRAM_BOT_TOKEN);
});
