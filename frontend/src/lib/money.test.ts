import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Address } from '@ton/core';
import { kvSet, kvGet } from './kv';
import { nano, units, walletId, reconcileMoney, reserveMoney, captureMoney, releaseMoney, claimMoney,
    moneyBalance, splitNano, grantPromo, consumePromoRequest, reserveCampaignTask, moneyJob, reapMoney } from './money';

const payer = '0:'+'11'.repeat(32), operator = '0:'+'22'.repeat(32), custody = '0:'+'33'.repeat(32);
let counter = 0;
async function fresh(amount = '100') {
    counter++;
    // Each test uses fresh wallet/job identifiers; the backing system is deliberately cumulative.
    const wallet = '0:' + counter.toString(16).padStart(64,'0');
    await reconcileMoney({ owner: custody, jettonWallet: custody, reserve: '1000000000000000000' },
        { manifest: 'audit-inventory-' + counter, legacyHold: '0', migrationReviewed: true,
          allocations: [{ wallet, amount_nano: String(nano(amount)), reference: 'allocation-' + counter }] });
    return wallet;
}
describe('v2 backed money ledger',()=>{
    it('uses exact 9-decimal integers and recognises TON address aliases',()=>{
        expect(nano('0.000000001')).toBe(1n);
        expect(units(nano('1000000000'))).toBe('1000000000.000000000');
        expect(()=>nano('0.0000000001')).toThrow();
        expect(()=>nano('NaN')).toThrow();
        const address = Address.parse(payer);
        expect(walletId(address.toString({ bounceable: false }))).toBe(walletId(address.toString({ bounceable: true })));
    });
    it('conserves every nano including split remainders',()=>{
        for(const amount of [1n,2n,99n,100n,1000000000000000000n]) {
            const s=splitNano(amount);
            expect(s.executor+s.protocol+s.reserve).toBe(amount);
        }
        expect(splitNano(nano('100'))).toEqual({ executor:nano('85'),protocol:nano('10'),reserve:nano('5') });
    });
    it('reserves before compute; credits only accepted work; claim has zero extra fee',async()=>{
        const wallet=await fresh(),job='success-'+counter;
        await reserveMoney(wallet,job,nano('100'),'hash',Date.now()+60_000);
        expect((await moneyBalance(wallet)).balance_gstd).toBe(0);
        expect((await moneyBalance(operator)).pending_gstd).toBe(0);
        await captureMoney(job,operator,{answer:'accepted'});
        expect((await moneyBalance(operator)).pending_gstd).toBe(85);
        const claimed=await claimMoney(operator);
        expect(claimed.amount).toBe(nano('85'));
        expect((await moneyBalance(operator)).balance_gstd).toBe(85);
        expect((await claimMoney(operator)).amount).toBe(0n);
        await captureMoney(job,operator,{answer:'retry'});
        expect((await moneyBalance(operator)).pending_gstd).toBe(0);
    });
    it('releases failed work exactly once with no protocol fee',async()=>{
        const wallet=await fresh(),job='failure-'+counter;
        await reserveMoney(wallet,job,nano('10'),'hash',Date.now()+60_000);
        await Promise.all([releaseMoney(job),releaseMoney(job),releaseMoney(job)]);
        expect((await moneyBalance(wallet)).balance_gstd).toBe(100);
        expect((await moneyBalance(wallet)).reserved_gstd).toBe(0);
        await expect(captureMoney(job,operator,{})).rejects.toThrow('reservation_expired');
    });
    it('permits only one winner under concurrent reservation and prevents overspending',async()=>{
        const wallet=await fresh('10'),job='race-'+counter;
        const attempts=await Promise.all(Array.from({length:8},()=>reserveMoney(wallet,job,nano('10'),'same',Date.now()+60_000)));
        expect(attempts.filter(a=>a.acquired)).toHaveLength(1);
        expect((await moneyBalance(wallet)).reserved_gstd).toBe(10);
        await expect(reserveMoney(wallet,'second-'+counter,nano('1'),'other',Date.now()+60_000)).rejects.toThrow('insufficient_balance');
        await expect(reserveMoney(wallet,job,nano('9'),'different',Date.now()+60_000)).rejects.toThrow('idempotency_conflict');
    });
    it('never turns promo or old balances into paid funding',async()=>{
        const wallet=await fresh('1');
        await kvSet('balance:'+wallet,'1000000');
        await grantPromo(wallet,nano('100'),'promo-'+counter);
        expect((await moneyBalance(wallet)).promo_credits).toBe(100);
        await expect(reserveMoney(wallet,'unbacked-'+counter,nano('2'),'hash',Date.now()+60_000)).rejects.toThrow('insufficient_balance');
        expect((await moneyBalance(wallet)).legacy_unreconciled_gstd).toBe(1000000);
    });
    it('consumes promo requests exactly once without creating withdrawable money',async()=>{
        const wallet=await fresh('1');
        await grantPromo(wallet,nano('5'),'service-'+counter);
        await consumePromoRequest(wallet,'request-'+counter);
        await consumePromoRequest(wallet,'request-'+counter);
        const balance=await moneyBalance(wallet);
        expect(balance.promo_credits).toBe(4);
        expect(balance.balance_gstd).toBe(1);
        expect(balance.pending_gstd).toBe(0);
    });
    it('preserves friendly-address legacy records when the session uses a raw address',async()=>{
        const wallet=await fresh('1');
        const friendly=Address.parse(wallet).toString({bounceable:false});
        await kvSet('rewards:pending:'+friendly.toLowerCase(),'2.5');
        expect((await moneyBalance(wallet)).legacy_pending_unreconciled_gstd).toBe(2.5);
        expect((await moneyBalance(wallet)).pending_gstd).toBe(0);
    });
    it('rejects allocations exceeding reserves and keeps repeated allocation idempotent',async()=>{
        const wallet=await fresh('1'),before=await moneyBalance(wallet);
        await expect(reconcileMoney({owner:custody,jettonWallet:custody,reserve:'0'},
            {manifest:'bad',legacyHold:'0',migrationReviewed:true,allocations:[{wallet,amount_nano:'1',reference:'bad-'+counter}]}))
            .rejects.toThrow('insufficient_backing');
        expect((await moneyBalance(wallet)).available_nano).toBe(before.available_nano);
        await reconcileMoney({owner:custody,jettonWallet:custody,reserve:'1000000000000000000'},
            {manifest:'repeat',legacyHold:'0',migrationReviewed:true,allocations:[{wallet,amount_nano:nano('1').toString(),reference:'allocation-'+counter}]});
        expect((await moneyBalance(wallet)).balance_gstd).toBe(1);
    });
    it('reserves a full campaign without fees; accepted tasks split once; unused budget refunds',async()=>{
        const wallet=await fresh('100'),campaign='campaign-'+counter,job='campaign:'+campaign,task='task-'+counter;
        await reserveMoney(wallet,job,nano('100'),'campaign',Date.now()+60_000,'campaign',
            { key:'campaign:'+campaign,value:JSON.stringify({remaining_budget:100}) });
        await reserveCampaignTask(campaign,{task_id:task,type:'inference'},nano('100'),Date.now()+30_000,{});
        expect((await moneyJob(task))?.amount).toBe(nano('100').toString());
        const before=await moneyBalance(operator);
        await captureMoney(task,operator,{accepted:true});
        expect((await moneyBalance(operator)).pending_gstd-before.pending_gstd).toBe(85);
        await releaseMoney(job,wallet);
        expect((await moneyBalance(wallet)).reserved_gstd).toBe(0);
    });
    it('handles micro tasks without rounding away budget and recovers expired requests',async()=>{
        const wallet=await fresh('1'),job='expire-'+counter;
        vi.useFakeTimers();
        try {
            await reserveMoney(wallet,job,nano('0.001'),'micro',Date.now()+1000);
            expect((await moneyBalance(wallet)).reserved_nano).toBe('1000000');
            vi.advanceTimersByTime(1001);
            await reapMoney();
            expect((await moneyBalance(wallet)).balance_gstd).toBe(1);
            expect((await moneyJob(job))?.state).toBe('released');
        } finally { vi.useRealTimers(); }
    });
    it('settles self-operated paid work without overwriting the debit',async()=>{
        const wallet=await fresh('100'),job='self-'+counter;
        await reserveMoney(wallet,job,nano('100'),'self',Date.now()+60_000);
        await captureMoney(job,wallet,{accepted:true});
        const b=await moneyBalance(wallet);
        expect(b.balance_gstd).toBe(0); expect(b.pending_gstd).toBe(85); expect(b.reserved_gstd).toBe(0);
    });
});
