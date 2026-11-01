import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'crypto';
import { validateTelegramInitData } from './telegramAuth';
afterEach(()=>vi.unstubAllEnvs());
const token='123456:local-test-fixture';
function signed(extra:Record<string,string>={}) {
 const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:123,first_name:'100% ready'}),...extra});
 const check=[...p.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+'='+v).join('\n');
 const secret=createHmac('sha256','WebAppData').update(token).digest();
 p.set('hash',createHmac('sha256',secret).update(check).digest('hex'));return p;
}
describe('Telegram Mini App identity',()=>{
 it('fails closed with missing configuration even for otherwise signed data',()=>{
  vi.stubEnv('TELEGRAM_BOT_TOKEN','');expect(validateTelegramInitData(signed().toString())).toBeNull();
 });
 it('accepts signed identities and literal percent characters without double decoding',()=>{
  vi.stubEnv('TELEGRAM_BOT_TOKEN',token);expect(validateTelegramInitData(signed().toString())).toBe('123');
 });
 it('rejects forged, stale, future, duplicate and malformed identities',()=>{
  vi.stubEnv('TELEGRAM_BOT_TOKEN',token);
  const forged=signed();forged.set('user',JSON.stringify({id:456}));
  for(const p of [forged,signed({auth_date:'1'}),signed({auth_date:String(Math.floor(Date.now()/1000)+3600)}),
    signed({user:JSON.stringify({id:'123'})}),signed({user:JSON.stringify({id:-1})})])
    expect(validateTelegramInitData(p.toString())).toBeNull();
  expect(validateTelegramInitData(signed().toString()+'&user=%7B%22id%22%3A456%7D')).toBeNull();
 });
});
