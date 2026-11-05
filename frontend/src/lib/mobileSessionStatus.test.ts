import {it,expect,vi} from 'vitest';
import {kvSet} from './kv';
vi.mock('./telegramAuth',()=>({validateTelegramInitData:(s:string)=>s==='valid-fixture'?123:null}));
import status from '../pages/api/v1/mobile/node/status';
async function call(proof:unknown,query:any={device_id:'device-fixture'}){
 const headers:any={};const res:any={code:200,setHeader(k:string,v:string){headers[k]=v;},status(n:number){this.code=n;return this;},json(v:any){this.value=v;return this;}};
 await status({method:'GET',headers:{'x-telegram-init-data':proof},query} as any,res);return{...res,headers};
}
it('authenticates before returning the Telegram owner device, never fabricating presence income',async()=>{
 await kvSet('mobile_node:123:device-fixture',JSON.stringify({wallet_address:'fixture-wallet',last_heartbeat_ts:Date.now()-1000,started_at:new Date().toISOString(),rate_per_hour:0,accumulated_gstd:999,battery_pct:50}));
 for(const proof of [undefined,'forged','expired',['valid-fixture']])expect((await call(proof)).code).toBe(401);
 expect((await call('valid-fixture',{device_id:'device-fixture',tg_user_id:'999'})).code).toBe(403);
 const r=await call('valid-fixture');expect(r.code).toBe(200);expect(r.value.wallet_address).toBe('fixture-wallet');expect(r.value.accumulated_gstd).toBe(0);expect(r.value.rate_per_hour).toBe(0);expect(r.headers['Cache-Control']).toBe('private, no-store');
});
