import{RESERVE_LIQUIDITY}from './reserveLiquidity';
import{walletId}from './money';
export const LIQUIDITY_LIMITS=Object.freeze({maximumGasBps:100,maximumImpactBps:100,maximumSlippageBps:100,maximumDeviationBps:200,
 minimumBatchUsdNano:'10000000000',minimumReferenceDepthUsdNano:'1000000000000',maximumQuoteAgeMs:15000,maximumReferenceAgeMs:60000});
export type LiquidityAssessmentInput={amountNano:string;availableReserveNano:string;payloadHash:string;tonBalanceNano:string;recoveryTonNano:string;
 reference:{gstdUsdNano:string;goldUsdNano:string;tonUsdNano:string;observedAt:number;sourcePool:string;liquidityUsdNano:string};
 simulation:{amountNano:string;pool:string;payloadHash:string;observedAt:number;success:boolean;expectedLp:string;minimumLp:string;attachedTonNano:string;priceImpactBps:number;poolGstdNano:string;poolGoldMicro:string;lpUnderlyingGstdNano:string;lpUnderlyingGoldMicro:string}};
const uint=(s:string)=>{if(typeof s!=='string'||! /^(0|[1-9]\d{0,29})$/.test(s))throw Error('invalid');return BigInt(s);};
/** Server-owned normalized evidence only. This is not an oracle or authorization to spend.
 * The reference must come from a verified independent market, never the target pool's own price.
 * Use the attached TON budget as the conservative fee bound, not an optimistic simulated net fee. */
export function assessLiquidityBatch(i:LiquidityAssessmentInput,now=Date.now()){
 const reasons:string[]=[];
 try{
  const ref=i.reference,q=i.simulation,amount=uint(i.amountNano),available=uint(i.availableReserveNano),gstd=uint(ref.gstdUsdNano),gold=uint(ref.goldUsdNano),ton=uint(ref.tonUsdNano),attached=uint(q.attachedTonNano);
  if(amount===0n||amount>available)reasons.push('insufficient_reserve');
  if(gstd===0n||gold===0n||ton===0n)reasons.push('market_reference_unavailable');
  if(walletId(ref.sourcePool)===walletId(RESERVE_LIQUIDITY.pool)||uint(ref.liquidityUsdNano)<uint(LIQUIDITY_LIMITS.minimumReferenceDepthUsdNano))reasons.push('independent_liquid_reference_required');
  const fresh=(t:number,age:number)=>Number.isSafeInteger(t)&&t<=now+5000&&t>=now-age;
  if(!fresh(ref.observedAt,LIQUIDITY_LIMITS.maximumReferenceAgeMs))reasons.push('stale_market_reference');
  if(!fresh(q.observedAt,LIQUIDITY_LIMITS.maximumQuoteAgeMs))reasons.push('stale_simulation');
  if(!q.success||q.amountNano!==i.amountNano||walletId(q.pool)!==walletId(RESERVE_LIQUIDITY.pool)||! /^(?:[a-f0-9]{64})$/.test(i.payloadHash)||q.payloadHash!==i.payloadHash)reasons.push('simulation_mismatch');
  if(!Number.isSafeInteger(q.priceImpactBps)||q.priceImpactBps<0||q.priceImpactBps>LIQUIDITY_LIMITS.maximumImpactBps)reasons.push('price_impact_limit');
  const expected=uint(q.expectedLp),minimum=uint(q.minimumLp),floor=(expected*BigInt(10000-LIQUIDITY_LIMITS.maximumSlippageBps)+9999n)/10000n;
  if(expected===0n||minimum===0n||minimum<floor||minimum>expected)reasons.push('minimum_lp_limit');
  const value=amount*gstd/1000000000n,cost=attached*ton/1000000000n;
  const poolGstd=uint(q.poolGstdNano),poolGold=uint(q.poolGoldMicro);
  if(poolGstd===0n||poolGold===0n)reasons.push('empty_pool');
  else{
   const implied=poolGold*gold*1000n/poolGstd,difference=implied>gstd?implied-gstd:gstd-implied;
   if(difference*10000n>gstd*BigInt(LIQUIDITY_LIMITS.maximumDeviationBps))reasons.push('pool_reference_deviation');
  }
  const lpValue=uint(q.lpUnderlyingGstdNano)*gstd/1000000000n+uint(q.lpUnderlyingGoldMicro)*gold/1000000n;
  if(lpValue*10000n<value*BigInt(10000-LIQUIDITY_LIMITS.maximumDeviationBps))reasons.push('lp_value_loss_limit');
  if(value<uint(LIQUIDITY_LIMITS.minimumBatchUsdNano))reasons.push('batch_value_too_small');
  if(attached===0n||cost*10000n>value*BigInt(LIQUIDITY_LIMITS.maximumGasBps))reasons.push('gas_fraction_limit');
  if(uint(i.recoveryTonNano)<1000000000n||uint(i.tonBalanceNano)<attached+uint(i.recoveryTonNano)+200000000n)reasons.push('ton_recovery_budget_required');
  return{ok:reasons.length===0,reasons,batchUsdNano:String(value),conservativeGasUsdNano:String(cost),
   expiresAt:Math.min(q.observedAt+LIQUIDITY_LIMITS.maximumQuoteAgeMs,ref.observedAt+LIQUIDITY_LIMITS.maximumReferenceAgeMs)};
 }catch{return{ok:false,reasons:['invalid_economic_evidence']};}
}
