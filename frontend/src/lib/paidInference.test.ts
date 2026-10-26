import { describe, it, expect, vi, beforeEach } from 'vitest';
import { kvSet } from './kv';
import { nano, reconcileMoney, moneyBalance } from './money';
import { paidInference } from './paidInference';
const nodes = vi.hoisted(()=>({ list: [] as any[] }));
vi.mock('./nodes',()=>({ getActiveNodes: async()=>nodes.list }));
const owner='0:'+'aa'.repeat(32),executor='0:'+'bb'.repeat(32);
let seq=0,wallet='';
async function call(key: string, overrides: Record<string,unknown> = {}, headers: Record<string,string> = {}) {
    let code=200,body:any;
    const req:any={ headers:{'idempotency-key':key,...headers},body:{stream:false} };
    const res:any={status(c:number){code=c;return this;},json(b:any){body=b;return this;}};
    await paidInference(req,res,{wallet,price:1,model:'auto',messages:[{role:'user',content:'hello'}],
        maxTokens:100,surface:'api',...overrides} as any);
    return {code,body};
}
beforeEach(async()=>{
    seq++;wallet='0:'+seq.toString(16).padStart(64,'0');
    await reconcileMoney({owner,jettonWallet:owner,reserve:nano('1000000').toString()},
        {manifest:'paid-tests-' + seq,legacyHold:'0',migrationReviewed:true,allocations:[
            {wallet,amount_nano:nano('10').toString(),reference:'paid-test-'+seq}]});
    nodes.list=[{nodeId:'operator',url:'https://operator.example',models:['auto']}];
    await kvSet('node:operator',JSON.stringify({wallet_address:executor}));
});
describe('paid inference orchestration',()=>{
    it('does not charge an unauthenticated caller or accept a missing payment key',async()=>{
        expect((await call('abcdefgh',{wallet:null})).code).toBe(402);
        expect((await call('')).code).toBe(400);
        expect((await moneyBalance(wallet)).balance_gstd).toBe(10);
    });
    it('returns a failed inference reservation, including retries',async()=>{
        const fetcher=vi.fn().mockRejectedValue(new Error('node timeout'));vi.stubGlobal('fetch',fetcher);
        const response=await call('failure-key');
        expect(response.code).toBe(503);expect(response.body.refunded).toBe(true);
        expect((await moneyBalance(wallet)).balance_gstd).toBe(10);
        await call('failure-key');
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect((await moneyBalance(wallet)).balance_gstd).toBe(10);
    });
    it('captures 85/10/5 once and replays the accepted response without recomputing',async()=>{
        const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({choices:[{message:{content:'accepted'}}]})});
        vi.stubGlobal('fetch',fetcher);
        const before=(await moneyBalance(executor)).pending_gstd;
        const first=await call('success-key'),second=await call('success-key');
        expect(first.code).toBe(200);expect(second.body).toEqual(first.body);
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect((await moneyBalance(wallet)).balance_gstd).toBe(9);
        expect((await moneyBalance(executor)).pending_gstd-before).toBeCloseTo(0.85,9);
        expect(first.body._gstd.billing).toMatchObject({executor_gstd:0.85,protocol_gstd:0.1,reserve_gstd:0.05});
        expect((await call('success-key',{model:'other'})).code).toBe(409);
    });
    it('rejects a fallback/error answer without charging for it',async()=>{
        vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({
            choices:[{message:{content:'busy'}}],_gstd:{tier:'fallback'}})}));
        expect((await call('fallback-key')).body.refunded).toBe(true);
        expect((await moneyBalance(wallet)).balance_gstd).toBe(10);
    });
    it('does not reserve when there is no registered payout-capable executor',async()=>{
        nodes.list=[];
        expect((await call('no-node-key')).code).toBe(503);
        expect((await moneyBalance(wallet)).reserved_gstd).toBe(0);
    });
});
