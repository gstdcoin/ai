import {test} from 'node:test';import assert from 'node:assert/strict';
import {createRelay,expiresAt} from './telegram-private-preview.mjs';
const env={OPEN_INTELLIGENCE_CRON_SECRET:'operator-fixture',TELEGRAM_BOT_TOKEN:'bot-fixture'};
const request=(path='/__gstd_apply',method='POST',host='gstd-telegram-maintenance.invalid',headers={'x-gstd-maintenance':'canonical-domain-v1'})=>new Request('https://'+host+path,{method,headers});
test('public hosts, missing intent and expired tools cannot trigger a mutation',async()=>{
 let calls=0;const relay=createRelay(async()=>{calls++;throw Error('must not send')},()=>expiresAt-1000);
 assert.equal((await relay.fetch(request(undefined,undefined,'app.gstdtoken.xyz'),env)).status,404);
 assert.equal((await relay.fetch(request(undefined,undefined,undefined,{}),env)).status,400);
 assert.equal((await relay.fetch(request(),{})).status,503);
 assert.equal((await createRelay(async()=>{calls++},()=>expiresAt+1).fetch(request(),env)).status,410);
 assert.equal(calls,0);
});
test('probe never returns credentials; apply uses only the fixed canonical operation',async()=>{
 let calls=0;const relay=createRelay(async(url,init)=>{calls++;assert.equal(url,'https://app.gstdtoken.xyz/api/v1/telegram/admin/canonical-domain');assert.equal(init.headers.Authorization,'Bearer operator-fixture');assert.equal(init.body,undefined);assert.equal(init.redirect,'manual');return Response.json({success:true,canonical_webhook:true,canonical_menu:true,pending_updates_preserved:true,secret:'must omit'})},()=>expiresAt-1000);
 const probe=await relay.fetch(request('/__gstd_probe','GET'),env);assert.deepEqual(await probe.json(),{operator_binding:true,bot_binding:true});
 const r=await relay.fetch(request(),env);assert.equal(r.status,200);const text=await r.text();assert.equal(text.includes('fixture'),false);assert.equal(text.includes('must omit'),false);assert.equal(r.headers.get('Cache-Control'),'no-store');
 assert.equal((await relay.fetch(request(),env)).status,409);assert.equal(calls,1);
});
test('upstream rejection never claims success or reflects arbitrary errors',async()=>{
 const relay=createRelay(async()=>Response.json({error:'private-credential'},{status:403}),()=>expiresAt-1000);
 const r=await relay.fetch(request(),env);assert.equal(r.status,502);const b=await r.json();assert.equal(b.success,false);assert.equal(b.upstream_status,403);assert.equal(JSON.stringify(b).includes('private-credential'),false);
});
