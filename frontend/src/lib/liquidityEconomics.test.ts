import{expect,it}from 'vitest';
import{assessLiquidityBatch,type LiquidityAssessmentInput}from './liquidityEconomics';
import{RESERVE_LIQUIDITY}from './reserveLiquidity';
const now=1800000000000;
function fixture():LiquidityAssessmentInput{return{amountNano:'1000000000000',availableReserveNano:'2000000000000',payloadHash:'a'.repeat(64),tonBalanceNano:'3000000000',recoveryTonNano:'1000000000',
 reference:{gstdUsdNano:'1000000000',goldUsdNano:'4000000000000',tonUsdNano:'2000000000',observedAt:now,sourcePool:'0:'+'7'.repeat(64),liquidityUsdNano:'100000000000000'},
 simulation:{amountNano:'1000000000000',pool:RESERVE_LIQUIDITY.pool,payloadHash:'a'.repeat(64),observedAt:now,success:true,expectedLp:'1000',minimumLp:'990',attachedTonNano:'1000000000',priceImpactBps:50,poolGstdNano:'100000000000000',poolGoldMicro:'25000000',lpUnderlyingGstdNano:'1000000000000',lpUnderlyingGoldMicro:'0'}};}
it('uses integer USD and the full attached TON budget; approval is bounded by quote expiry',()=>{
 const r=assessLiquidityBatch(fixture(),now);expect(r.ok).toBe(true);expect(r.batchUsdNano).toBe('1000000000000');expect(r.conservativeGasUsdNano).toBe('2000000000');expect(r.expiresAt).toBe(now+15000);
});
it('rejects target-pool self-pricing, stale references, uncertain simulation and changed payloads',()=>{
 let x=fixture();x.reference.sourcePool=RESERVE_LIQUIDITY.pool;expect(assessLiquidityBatch(x,now).reasons).toContain('independent_liquid_reference_required');
 x=fixture();x.reference.observedAt=now-60001;expect(assessLiquidityBatch(x,now).reasons).toContain('stale_market_reference');
 x=fixture();x.simulation.observedAt=now-15001;expect(assessLiquidityBatch(x,now).reasons).toContain('stale_simulation');
 x=fixture();x.simulation.payloadHash='b'.repeat(64);expect(assessLiquidityBatch(x,now).reasons).toContain('simulation_mismatch');
 x=fixture();x.simulation.success=false;expect(assessLiquidityBatch(x,now).ok).toBe(false);
});
it('pauses small/uneconomic batches, excessive impact/slippage and insufficient recovery gas',()=>{
 let x=fixture();x.reference.gstdUsdNano='29708';const r=assessLiquidityBatch(x,now);expect(r.ok).toBe(false);expect(r.reasons).toContain('gas_fraction_limit');
 x=fixture();x.simulation.priceImpactBps=101;expect(assessLiquidityBatch(x,now).reasons).toContain('price_impact_limit');
 x=fixture();x.simulation.minimumLp='989';expect(assessLiquidityBatch(x,now).reasons).toContain('minimum_lp_limit');
 x=fixture();x.tonBalanceNano='2000000000';expect(assessLiquidityBatch(x,now).reasons).toContain('ton_recovery_budget_required');
 x=fixture();x.reference.gstdUsdNano='NaN';expect(assessLiquidityBatch(x,now).reasons).toEqual(['invalid_economic_evidence']);
});

it('rejects an apparently cheap quote when LP value is lost or pool price diverges',()=>{
 let x=fixture();x.simulation.lpUnderlyingGstdNano='970000000000';expect(assessLiquidityBatch(x,now).reasons).toContain('lp_value_loss_limit');
 x=fixture();x.simulation.poolGoldMicro='26000000';expect(assessLiquidityBatch(x,now).reasons).toContain('pool_reference_deviation');
});
