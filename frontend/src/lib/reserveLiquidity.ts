import {Address} from '@ton/core';
import {MAINNET_ESCROW} from './mainnetEscrowManifest';
export const RESERVE_LIQUIDITY=Object.freeze({
 network:'-239',pool:'EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp',
 router:'EQAiv3IuxYA6ZGEunOgZSTuMBzbpjwRbWw09-WsE-iqKKMrK',
 gstdMaster:MAINNET_ESCROW.master,goldMaster:'EQA1R_LuQCLHlMgOo1S4G7Y7W1cd0FrAkbA10Zq7rddKxi9k',
 goldSymbol:'XAUt0',goldDecimals:6,gstdDecimals:9,
 goldDocumentation:'https://usdt0.gitbook.io/xaut0/technical-documentation/developer',
 poolUrl:'https://app.ston.fi/pools/EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp',
 // Operational review threshold, not authorization to spend or an assertion of guaranteed safety.
 reviewMinimumLiquidityUsd:1000,
});
const raw=(s:string)=>Address.parse(s).toRawString();
export function inspectReservePool(pool:any){
 if(!pool||raw(pool.address)!==raw(RESERVE_LIQUIDITY.pool)||raw(pool.router_address)!==raw(RESERVE_LIQUIDITY.router)||
  pool.deprecated!==false)throw Error('unexpected_liquidity_pool');
 const expected=[raw(RESERVE_LIQUIDITY.gstdMaster),raw(RESERVE_LIQUIDITY.goldMaster)].sort();
 const actual=[raw(pool.token0_address),raw(pool.token1_address)].sort();
 if(actual[0]!==expected[0]||actual[1]!==expected[1])throw Error('unexpected_pool_assets');
 const gstdFirst=raw(pool.token0_address)===raw(RESERVE_LIQUIDITY.gstdMaster);
 const gstdNano=gstdFirst?pool.reserve0:pool.reserve1,goldMicro=gstdFirst?pool.reserve1:pool.reserve0;
 if(typeof gstdNano!=='string'||!/^\d+$/.test(gstdNano)||typeof goldMicro!=='string'||!/^\d+$/.test(goldMicro))throw Error('invalid_pool_reserves');
 const n=typeof pool.lp_total_supply_usd==='string'?Number(pool.lp_total_supply_usd):NaN;
 const liquidityUsd=Number.isFinite(n)&&n>=0?n:null;
 const blockers=['liquidity_executor_not_deployed'];
 if(liquidityUsd===null)blockers.push('liquidity_value_unavailable');
 else if(liquidityUsd<RESERVE_LIQUIDITY.reviewMinimumLiquidityUsd)blockers.push('pool_liquidity_below_review_threshold');
 if(BigInt(gstdNano)===0n||BigInt(goldMicro)===0n)blockers.push('empty_pool_side');
 return{target:RESERVE_LIQUIDITY,asset_pair_verified:true,reported_liquidity_usd:liquidityUsd,
  reserves:{gstd_nano:gstdNano,gold_micro:goldMicro},automatic_execution_enabled:false,blockers,
  requirements:['backed reserve released through verified chain settlement','funded TON execution budget',
   'independent price reference and fresh exact-amount simulation','bounded slippage, price impact and gas fraction',
   'allowlisted router/pool and protected LP-token beneficiary','on-chain LP receipt or refund reconciliation'],
  note:'Read-only market observation. Not a quote, oracle, transfer, LP receipt or permission to spend.',observed_at:Date.now()};
}
