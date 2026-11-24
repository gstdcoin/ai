// One-off operator tool for an authenticated Cloudflare Quick Edit session.
// Never deploy this tool. Discard the draft after use; production code stays unchanged.
export const expiresAt=Date.parse('2026-11-24T05:40:00Z');
export function createRelay(transport=fetch,clock=Date.now){
 let applied=false;
 const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 return{async fetch(request,env){
  const url=new URL(request.url);
  if(clock()>expiresAt)return reply({error:'maintenance_expired'},410);
  // This synthetic hostname has no public route. Only the authenticated request simulator supplies it.
  if(url.hostname!=='gstd-telegram-maintenance.invalid')return reply({error:'not_found'},404);
  if(url.pathname==='/__gstd_probe'&&request.method==='GET')return reply({operator_binding:typeof env.OPEN_INTELLIGENCE_CRON_SECRET==='string'&&!!env.OPEN_INTELLIGENCE_CRON_SECRET,bot_binding:typeof env.TELEGRAM_BOT_TOKEN==='string'&&!!env.TELEGRAM_BOT_TOKEN});
  if(url.pathname!=='/__gstd_apply'||request.method!=='POST'||request.headers.get('x-gstd-maintenance')!=='canonical-domain-v1')return reply({error:'invalid_maintenance_request'},400);
  if(applied)return reply({error:'already_applied'},409);
  if(typeof env.OPEN_INTELLIGENCE_CRON_SECRET!=='string'||!env.OPEN_INTELLIGENCE_CRON_SECRET)return reply({error:'operator_binding_unavailable'},503);
  try{
   const r=await transport('https://app.gstdtoken.xyz/api/v1/telegram/admin/canonical-domain',{
    method:'POST',redirect:'manual',signal:AbortSignal.timeout(30000),
    headers:{Authorization:'Bearer '+env.OPEN_INTELLIGENCE_CRON_SECRET,'x-gstd-maintenance':'canonical-domain-v1'},
   });
   const d=await r.json().catch(()=>null);
   applied=r.ok&&d?.success===true&&d.canonical_webhook===true&&d.canonical_menu===true&&d.pending_updates_preserved===true;
   const reason=['invalid_maintenance_request','operator_auth_required','telegram_not_configured','telegram_setup_failed'].includes(d?.error)?d.error:undefined;
   return reply({success:applied,upstream_status:r.status,canonical_webhook:applied,canonical_menu:applied,pending_updates_preserved:applied,...(reason?{reason}:{})},applied?200:502);
  }catch{return reply({error:'maintenance_unavailable'},502);}
 }};
}
export default createRelay();
