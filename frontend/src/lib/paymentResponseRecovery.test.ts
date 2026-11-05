import {it,expect,vi,beforeEach} from 'vitest';
const fixture=vi.hoisted(()=>({wallet:'0:'+'a1'.repeat(32),job:null as any,body:null as string|null}));
vi.mock('./walletSession',()=>({sessionWallet:async(h:any)=>h['x-session-token']==='owner'?fixture.wallet:null}));
vi.mock('./money',()=>({walletId:(s:string)=>s,digest:()=> 'request-digest',moneyJob:async()=>fixture.job}));
vi.mock('./kv',()=>({kvGet:async()=>fixture.body,kvDel:async()=>{fixture.body=null;}}));
import handler from '../pages/api/v1/finance/responses';
async function call(method='GET',token='owner',query:any={request_id:'valid-request-123'}){
 const res:any={code:200,value:null,setHeader(){},status(n:number){this.code=n;return this;},json(v:any){this.value=v;return this;}};
 await handler({method,headers:{'x-session-token':token},query} as any,res);return res;
}
beforeEach(()=>{fixture.job={wallet:fixture.wallet,state:'captured',amount:'5000000'};fixture.body=JSON.stringify({choices:[{message:{content:'saved answer'}}]});});
it('recovers a captured answer only for the authenticated payer without reserving or executing work',async()=>{
 expect((await call('GET','')).code).toBe(401);
 const recovered=await call();expect(recovered.code).toBe(200);expect(recovered.value.response.choices[0].message.content).toBe('saved answer');expect(recovered.value.charged_again).toBe(false);
 fixture.job.wallet='0:'+'b2'.repeat(32);expect((await call()).code).toBe(404);
});
it('deleting retained answer preserves the receipt and a missing answer never recomputes',async()=>{
 expect((await call('DELETE','owner',{id:'chat:request-digest'})).value.financial_receipt_retained).toBe(true);
 const recovered=await call();expect(recovered.value.state).toBe('captured');expect(recovered.value.response).toBeNull();expect(fixture.job.amount).toBe('5000000');
});
it('does not expose a stored answer before capture and validates request references',async()=>{
 fixture.job.state='reserved';expect((await call()).value.response).toBeNull();
 expect((await call('GET','owner',{request_id:['invalid']})).code).toBe(400);
});
