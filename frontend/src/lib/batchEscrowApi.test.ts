import {beforeEach,it,expect,vi} from 'vitest';
import type {BatchInput} from './batchEscrow';
const state=vi.hoisted(()=>({allow:true,status:null as any}));
vi.mock('./kv',()=>({kvRateLimit:async()=>state.allow}));
vi.mock('./batchEscrowStatus',()=>({batchStatus:async()=>state.status}));
import handler from '../pages/api/v1/finance/escrow-plan';
const input:BatchInput={payer:'0:'+'11'.repeat(32),worker:'0:'+'22'.repeat(32),protocol:'0:'+'33'.repeat(32),reserve:'0:'+'44'.repeat(32),budget:'1',requests:100,taskId:'55'.repeat(32),deadline:Math.floor(Date.now()/1000)+3600};
async function call(body:any,method='POST'){
 const res={code:200,body:null as any,setHeader(){},status(code:number){this.code=code;return this;},json(value:any){this.body=value;return this;}};
 await handler({method,headers:{},body} as any,res as any);return res;
}
beforeEach(()=>{state.allow=true;state.status={deployed:true,state:0,mask:0,shares:[{state:0,balance_nano:'0',missing_nano:'850000000'},{state:0,balance_nano:'0',missing_nano:'100000000'},{state:0,balance_nano:'0',missing_nano:'50000000'}]};});
it('rejects mainnet plans and non-POST access; preview never enables a mainnet transaction',async()=>{
 expect((await call({},'GET')).code).toBe(405);
 const bad=await call({input,network:'-239'});expect(bad.code).toBe(409);expect(bad.body.error).toBe('wrong_network');
 const preview=await call({input});expect(preview.code).toBe(200);expect(preview.body.preview.network).toBe('-3');
});
it('does not prepare acceptance for incomplete funding or a signer that is not payer',async()=>{
 const incomplete=await call({input,action:'accept',actor:input.payer});expect(incomplete.body.error).toBe('state_not_ready');
 state.status.mask=7;
 const wrong=await call({input,action:'accept',actor:input.worker});expect(wrong.body.error).toBe('wrong_signer');
 const correct=await call({input,action:'accept',actor:input.payer});expect(correct.code).toBe(200);expect(correct.body.transaction.network).toBe('-3');
});
it('does not prepare a token withdrawal from pending or empty shares',async()=>{
 const pending=await call({input,action:'withdraw',actor:input.worker,role:0});expect(pending.body.error).toBe('state_not_ready');
 state.status.state=1;state.status.shares[0].state=1;
 const empty=await call({input,action:'withdraw',actor:input.worker,role:0});expect(empty.body.error).toBe('state_not_ready');
 state.status.shares[0].balance_nano='7';
 expect((await call({input,action:'withdraw',actor:input.worker,role:0})).code).toBe(200);
});
it('limits free-service requests before preparing a transaction',async()=>{
 state.allow=false;expect((await call({input,action:'mint',actor:input.payer})).code).toBe(429);
});
