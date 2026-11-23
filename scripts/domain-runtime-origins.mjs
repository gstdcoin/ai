// Read-only configuration inspection. No values of secret bindings are returned.
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token)throw Error('missing_cloudflare_configuration');
const allowed=new Set(['GSTD_SWARM_URL','GSTD_API_URL','NEXT_PUBLIC_APP_URL','APP_URL','WEBHOOK_URL','TMA_URL']);
for(const service of ['gstd-web','gstd-ai-platform']){
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+service+'/settings',{headers:{Authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(15000)});
 const d=await r.json().catch(()=>null);if(!r.ok||d?.success!==true)throw Error('runtime_origin_inspection_failed_http_'+r.status);
 const origins=(d.result.bindings||[]).filter(b=>allowed.has(b.name)).map(b=>{
  let classification='opaque_binding';
  if(b.type==='plain_text')try{const u=new URL(b.text);classification=u.username||u.password||u.search||u.hash?'invalid_origin':['gstdtoken.xyz','www.gstdtoken.xyz','app.gstdtoken.xyz'].includes(u.hostname)?'canonical_new_domain':['gstdtoken.com','www.gstdtoken.com','app.gstdtoken.com','platform.gstdtoken.com'].includes(u.hostname)?'legacy_domain':'custom_domain';}catch{classification='invalid_origin';}
  return{name:b.name,type:b.type,classification};
 });
 console.log(JSON.stringify({service,origins,unset_values_use_source_defaults:true}));
}
