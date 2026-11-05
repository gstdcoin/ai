import {it,expect} from 'vitest';
import {Address} from '@ton/core';
import {readFileSync} from 'node:fs';
import {RESERVE_LIQUIDITY,inspectReservePool} from './reserveLiquidity';
import {GSTD_PURCHASE,gstdSwapLink} from './gstdPurchase';
const pool=()=>({address:RESERVE_LIQUIDITY.pool,router_address:RESERVE_LIQUIDITY.router,deprecated:false,
 token0_address:RESERVE_LIQUIDITY.goldMaster,token1_address:RESERVE_LIQUIDITY.gstdMaster,
 reserve0:'115',reserve1:'8368253320797',lp_total_supply_usd:'0.721238448'});
it('pins canonical GSTD, official XAUt0 deployment, router and pool; never claims execution readiness',()=>{
 expect(Address.parse(GSTD_PURCHASE.friendlyMaster).toRawString()).toBe(GSTD_PURCHASE.master);
 for(const source of ['TON','USDT'] as const){
  const url=new URL(gstdSwapLink(source));expect(url.origin).toBe('https://app.ston.fi');
  expect(Address.parse(url.searchParams.get('tt')!).toRawString()).toBe(GSTD_PURCHASE.master);
  expect(url.searchParams.has('referral')).toBe(false);
 }
 const status=inspectReservePool(pool());
 expect(status.automatic_execution_enabled).toBe(false);expect(status.reported_liquidity_usd).toBe(0.721238448);
 expect(status.reserves).toEqual({gstd_nano:'8368253320797',gold_micro:'115'});
 expect(status.blockers).toContain('pool_liquidity_below_review_threshold');
 for(const patch of [{token0_address:RESERVE_LIQUIDITY.gstdMaster},{router_address:RESERVE_LIQUIDITY.gstdMaster},{deprecated:true},{reserve0:'-1'}])expect(()=>inspectReservePool({...pool(),...patch})).toThrow();
 expect(inspectReservePool({...pool(),lp_total_supply_usd:'NaN'}).blockers).toContain('liquidity_value_unavailable');
});
it('has matching purchase and protocol-income localization keys and every page label',()=>{
 const en=JSON.parse(readFileSync('public/locales/en/common.json','utf8')),ru=JSON.parse(readFileSync('public/locales/ru/common.json','utf8'));
 for(const key of ['buy_gstd','protocol_income'])expect(Object.keys(en[key]).sort()).toEqual(Object.keys(ru[key]).sort());
 const source=readFileSync('src/pages/buy.tsx','utf8');
 for(const m of source.matchAll(/\bp\('([^']+)'\)/g)){expect(en.buy_gstd[m[1]]).toBeTruthy();expect(ru.buy_gstd[m[1]]).toBeTruthy();}
});
