import {afterEach,expect,it,vi} from 'vitest';
import {createHmac} from 'node:crypto';
vi.hoisted(()=>{for(const name of ['KV_REST_API_URL','KV_REST_API_TOKEN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN'])process.env[name]='';vi.stubEnv('NODE_ENV','test');});
import {kvGet,kvSet} from './kv';
import {verifiedTelegramWallet} from './telegramWallet';
import link from '../pages/api/v1/telegram/link-wallet';
import legacyLink from '../pages/api/v1/telegram/bot/link';
import balance from '../pages/api/v1/telegram/bot/balance';
import claim from '../pages/api/v1/telegram/bot/claim_reward';
const owner='0:'+'a1'.repeat(32),victim='0:'+'b1'.repeat(32),token='123456:test-only-token';
function signed(id:number){
 const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id})});
 const check=[...p.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+'='+v).join('\n');
 const secret=createHmac('sha256','WebAppData').update(token).digest();
 p.set('hash',createHmac('sha256',secret).update(check).digest('hex'));return p.toString();
}
async function call(handler:any,method:string,body:any={},headers:any={},query:any={}){
 let status=200,value:any;await handler({method,body,headers,query},{setHeader(){},status(n:number){status=n;return this;},json(v:any){value=v;return this;}});
 return{status,value};
}
afterEach(()=>vi.unstubAllEnvs());
it('does not trust a chat address or legacy association to read or claim another account',async()=>{
 vi.stubEnv('TELEGRAM_BOT_TOKEN',token);
 await kvSet('tg_wallet:811',victim);
 expect(await verifiedTelegramWallet(811)).toBeNull();
 const headers={'x-bot-token':token};
 expect((await call(legacyLink,'POST',{telegram_id:811,wallet_address:victim},headers)).status).toBe(403);
 const result=await call(balance,'GET',{},headers,{telegram_id:'811'});
 expect(result.value.wallet).toBeUndefined();expect(result.value.pending_gstd).toBe(0);
 expect((await call(claim,'POST',{telegram_id:811},headers)).status).toBe(404);
 expect(await kvGet('tg_wallet_verified:811')).toBeNull();
});
it('binds the signed Telegram identity to the verified TON session, rejecting either mismatch',async()=>{
 vi.stubEnv('TELEGRAM_BOT_TOKEN',token);await kvSet('ton-auth:session:wallet-proof-fixture',owner);
 const headers={'x-session-token':'wallet-proof-fixture'};
 expect((await call(link,'POST',{telegram_id:812,wallet_address:owner,telegram_init_data:'hash=forged'},headers)).status).toBe(403);
 expect((await call(link,'POST',{telegram_id:813,wallet_address:owner,telegram_init_data:signed(812)},headers)).status).toBe(403);
 expect((await call(link,'POST',{telegram_id:812,wallet_address:victim,telegram_init_data:signed(812)},headers)).status).toBe(403);
 expect(await verifiedTelegramWallet(812)).toBeNull();
 const valid={telegram_id:812,wallet_address:owner,telegram_init_data:signed(812)};
 expect((await call(link,'POST',valid,headers)).status).toBe(200);
 expect(await verifiedTelegramWallet(812)).toBe(owner);
 expect((await call(link,'POST',valid,headers)).status).toBe(200);
});
