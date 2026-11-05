import {beforeEach,it,expect,vi} from 'vitest';
import {kvSet,kvGet} from './kv';
import {saveNodeOffer,createWorkQuote,requireWorkQuote,usdToGstd,usdMicro,offerKey} from './workEconomics';
import {reconcileMoney,moneyBalance,nano} from './money';
import {paidInference} from './paidInference';
const state=vi.hoisted(()=>({nodes:[{nodeId:'economic-node',url:'https://operator.invalid'}] as any[]}));
vi.mock('./nodes',()=>({getActiveNodes:async()=>state.nodes}));
const operator='0:'+'a7'.repeat(32),custody='0:'+'b7'.repeat(32),messages=[{role:'user',content:'fixture'}];
let payer='',seq=9000;
beforeEach(async()=>{
 payer='0:'+(++seq).toString(16).padStart(64,'0');
 await kvSet('node:economic-node',JSON.stringify({wallet_address:operator,capabilities:['economic-model']}));
 await kvSet('economics:market:v1',JSON.stringify({price:'0.25',observedAt:Date.now(),source:'fixture'}));
 await reconcileMoney({owner:custody,jettonWallet:custody,reserve:nano('1000000000').toString()},
 {manifest:'economic-'+seq,legacyHold:'0',migrationReviewed:true,allocations:[{wallet:payer,amount_nano:nano('100').toString(),reference:'economic-'+seq}]});
 await saveNodeOffer(operator,{node_id:'economic-node',model:'economic-model',net_usd:'0.01',max_tokens:512,max_input_bytes:16000,active:true});
});
async function call(key:string,quoteId?:string,cap='1'){
 const req:any={headers:{'idempotency-key':key},body:{stream:false,...(quoteId?{quote_id:quoteId,max_cost_gstd:cap}:{})}};
 const res={code:200,value:null as any,status(n:number){this.code=n;return this;},json(v:any){this.value=v;return this;}};
 await paidInference(req,res as any,{wallet:payer,price:0.005,model:'economic-model',messages,maxTokens:128,surface:'api'});
 return res;
}
it('converts USD to exact GSTD with upward rounding and changes token count with price, not the USD offer',()=>{
 expect(usdToGstd(1000n,'0.000029708124375123594')).toBe(33660825819n);
 expect(usdToGstd(1000n,'0.25')).toBe(4000000n);
 expect(usdToGstd(1000n,'0.125')).toBe(8000000n);
 expect(()=>usdToGstd(1n,'0')).toThrow('market_price_unavailable');
 expect(()=>usdMicro('1e-3')).toThrow('invalid_usd_amount');
});
it('only the verified payout owner can set an offer, with explicit fixed-work limits',async()=>{
 await expect(saveNodeOffer(payer,{node_id:'economic-node',model:'economic-model',net_usd:'0.01',max_tokens:512,max_input_bytes:16000,active:true})).rejects.toThrow('node_payout_owner_required');
 await expect(createWorkQuote(payer,'economic-model',messages,513)).rejects.toThrow('no_priced_executor');
 const q=await createWorkQuote(payer,'economic-model',messages,128);
 expect(q.operator_net_usd).toBe('0.010000');expect(q.price_usd).toBe('0.011765');expect(q.price_gstd).toBe('0.047060000');
 expect((await moneyBalance(payer)).reserved_nano).toBe('0');
 await expect(requireWorkQuote(q.id,operator,'economic-model',messages,128)).rejects.toThrow('price_quote_mismatch');
 await expect(requireWorkQuote(q.id,payer,'economic-model',[{role:'user',content:'changed'}],128)).rejects.toThrow('price_quote_mismatch');
});
it('will not execute an active USD offer at the obsolete legacy token price; exact cap and single-use quote are enforced',async()=>{
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({model:'economic-model',choices:[{message:{content:'accepted fixture'}}]})));vi.stubGlobal('fetch',fetcher);
 expect((await call('economic-no-quote')).code).toBe(428);expect(fetcher).not.toHaveBeenCalled();
 const q=await createWorkQuote(payer,'economic-model',messages,128);
 expect((await call('economic-cap',q.id,'0.001')).code).toBe(402);expect(fetcher).not.toHaveBeenCalled();
 const a=await call('economic-paid',q.id,q.price_gstd);expect(a.code).toBe(200);
 expect(a.value._gstd.billing.charged_gstd).toBe(0.04706);
 expect((await call('economic-paid',q.id,q.price_gstd)).value).toEqual(a.value);
 expect((await call('economic-second',q.id,q.price_gstd)).value.error).toBe('quote_already_used');
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect((await moneyBalance(payer)).balance_gstd).toBe(99.95294);
 vi.unstubAllGlobals();
});
it('keeps a quoted price during its short commitment, expires unsigned work, and never lowers operator payout after the quote',async()=>{
 const q=await createWorkQuote(payer,'economic-model',messages,128);
 await kvSet('economics:market:v1',JSON.stringify({price:'0.125',observedAt:Date.now(),source:'fixture'}));
 const changed=await createWorkQuote(payer,'economic-model',messages,128);
 expect(BigInt(changed.amountNano)).toBe(BigInt(q.amountNano)*2n);
 expect((await requireWorkQuote(q.id,payer,'economic-model',messages,128)).amountNano).toBe(q.amountNano);
 const expired={...q,expiresAt:Date.now()-1};await kvSet('economics:quote:v1:'+q.id,JSON.stringify(expired));
 await expect(requireWorkQuote(q.id,payer,'economic-model',messages,128)).rejects.toThrow('price_quote_expired');
});
it('does not return stale/fake pricing or select a changed payout wallet',async()=>{
 await kvSet('node_payout:economic-node',JSON.stringify({address:payer,revision:1}));
 await expect(createWorkQuote(payer,'economic-model',messages,128)).rejects.toThrow('no_priced_executor');
 await kvSet('node_payout:economic-node',JSON.stringify({address:operator,revision:2}));
 const raw=JSON.parse((await kvGet(offerKey('economic-node','economic-model')))!);
 await kvSet(offerKey('economic-node','economic-model'),JSON.stringify({...raw,active:false}));
 await expect(createWorkQuote(payer,'economic-model',messages,128)).rejects.toThrow('no_priced_executor');
});

it('binds a delegated quote to its grant and enforces the actual quoted cap before any debit',async()=>{
 const {grantChallenge,readGrantChallenge}=await import('./agentGrants');
 const {createAgentGrant,getAgentGrant}=await import('./money');
 const policy={label:'economic-fixture',models:['economic-model'],executors:[{nodeId:'economic-node',wallet:operator}],
 budgetNano:nano('1').toString(),perRequestNano:nano('0.1').toString(),maxRequests:3,maxTokens:128,expiresAt:Date.now()+60000};
 const c=await grantChallenge(payer,policy),raw=(await readGrantChallenge(c.nonce,payer)).raw;
 const created=await createAgentGrant(payer,policy,c.nonce,raw),grant=(await getAgentGrant(created.grant.id))!;
 const q=await createWorkQuote(payer,'economic-model',messages,128,grant);
 await expect(requireWorkQuote(q.id,payer,'economic-model',messages,128)).rejects.toThrow('price_quote_mismatch');
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({model:'economic-model',choices:[{message:{content:'accepted'}}]})));vi.stubGlobal('fetch',fetcher);
 const {default:handler}=await import('../pages/api/v1/agents/paid-infer');
 async function send(cap:string,key:string){
  const res={code:200,value:null as any,setHeader(){return undefined;},status(n:number){this.code=n;return this;},json(v:any){this.value=v;return this;}};
  await handler({method:'POST',headers:{authorization:'Bearer '+created.token},body:{request_id:key,prompt:'fixture',model:'economic-model',max_tokens:128,allow_network:true,max_cost_gstd:cap,quote_id:q.id}} as any,res as any);
  return res;
 }
 expect((await send('0.01','economic-grant-denied')).code).toBe(402);expect(fetcher).not.toHaveBeenCalled();
 const response=await send('0.1','economic-grant-paid');expect(response.code).toBe(200);expect(fetcher).toHaveBeenCalledTimes(1);
 expect((await getAgentGrant(grant.id))?.spentNano).toBe(q.amountNano);
 vi.unstubAllGlobals();
});

it('refuses underpriced queued model work and permits a sufficient funded reward without changing the funding amount',async()=>{
 const {checkQueuedOffer}=await import('./workEconomics');
 const task={model:'economic-model',payload:{prompt:'fixture',max_tokens:128}};
 await expect(checkQueuedOffer(task,'economic-node',operator,nano('0.005'),['economic-model'])).rejects.toThrow('operator_price_floor');
 await expect(checkQueuedOffer(task,'economic-node',operator,nano('1'),['economic-model'])).resolves.toBeUndefined();
 await expect(checkQueuedOffer({model:'auto'},'economic-node',operator,nano('1'),['economic-model'])).rejects.toThrow('operator_exact_model_required');
});

it('canonical latest aliases cannot bypass an operator offer, and disabling an offer does not restore legacy paid work',async()=>{
 const {requiresWorkQuote,nodeOffer}=await import('./workEconomics');
 expect((await nodeOffer('economic-node','economic-model:latest'))?.active).toBe(true);
 expect(await requiresWorkQuote('economic-node','auto',['economic-model'],operator)).toBe(true);
 const offer=JSON.parse((await kvGet(offerKey('economic-node','economic-model')))!);
 await kvSet(offerKey('economic-node','economic-model'),JSON.stringify({...offer,active:false}));
 await expect(requiresWorkQuote('economic-node','economic-model:latest',[],operator)).rejects.toThrow('operator_offer_disabled');
});
