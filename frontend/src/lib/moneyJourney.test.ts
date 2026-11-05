import {afterEach,expect,it,vi} from 'vitest';
import {Cell} from '@ton/core';
import fixture from '../../tests/fixtures/gstd-money-rehearsal.json';
import {kvSet,kvGet} from './kv';
import {nano,reconcileMoney,moneyBalance,claimMoney,readMoneySystem,getWithdrawal} from './money';
import {paidInference} from './paidInference';
import deposit from '../pages/api/v1/credits/deposit';
import withdrawals from '../pages/api/v1/finance/withdrawals';
const session=vi.hoisted(()=>({wallet:null as string|null}));
vi.mock('./walletSession',()=>({sessionWallet:async()=>session.wallet}));
vi.mock('./nodes',()=>({getActiveNodes:async()=>[{nodeId:'journey-executor',url:'https://journey-executor.example'}]}));
function response(){return {code:200,body:null as any,setHeader(){},status(code:number){this.code=code;return this;},json(body:any){this.body=body;return this;}};}
async function call(handler:any,body:any,key?:string){
 const res=response();await handler({method:'POST',headers:key?{'idempotency-key':key}:{},body},res);return res;
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('rehearses deposit, reserve, paid inference, refund, zero-fee claim and canonical payout receipts without real funds',async()=>{
 let now=fixture.time*1000;
 vi.spyOn(Date,'now').mockImplementation(()=>now);
 let reserve='0',workerFails=false,workerCalls=0;
 const wallets:Record<string,string>=fixture.wallets;
 vi.stubGlobal('fetch',vi.fn(async(input:any,options:any)=>{
  const url=String(input);
  if(url==='https://journey-executor.example/v1/chat/completions'){
   workerCalls++;
   const balance=await moneyBalance(fixture.payer);
   expect(balance.reserved_gstd).toBe(workerFails?5:10);
   if(workerFails)return {ok:false,status:503};
   return {ok:true,json:async()=>({model:'qwen2.5:0.5b',choices:[{message:{content:'Sandbox journey response'}}]})};
  }
  const parsed=new URL(url),method=parsed.pathname.split('/').at(-1);
  if(method==='get_wallet_address'){
   const owner=parsed.searchParams.get('args')||'';
   if(!wallets[owner])throw Error('Unexpected wallet lookup');
   return {ok:true,json:async()=>({success:true,decoded:{jetton_wallet_address:wallets[owner]}})};
  }
  if(method==='get_wallet_data')return {ok:true,json:async()=>({success:true,decoded:{owner:fixture.custody,jetton:fixture.master,balance:reserve}})};
  if(method==='seqno')return {ok:true,json:async()=>({success:true,stack:[{num:'0x1'}]})};
  const receipt=[fixture.deposit,fixture.withdrawal].find(tx=>parsed.pathname.endsWith('/'+tx.hash));
  if(receipt)return {ok:true,json:async()=>receipt};
  throw Error('Unexpected external request '+url);
 }));
 await reconcileMoney({owner:fixture.custody,jettonWallet:wallets[fixture.custody],reserve:'0'},
  {manifest:'sandbox-journey-inventory',legacyHold:'0',migrationReviewed:true,allocations:[]});
 session.wallet=fixture.payer;reserve=fixture.custody_reserve_after_deposit;
 const deposited=await call(deposit,{tx_hash:fixture.deposit.hash});
 expect(deposited.code).toBe(200);
 expect((await moneyBalance(fixture.payer)).available_nano).toBe(nano('100').toString());
 const repeated=await call(deposit,{tx_hash:fixture.deposit.hash});expect(repeated.body.duplicate).toBe(true);
 expect((await readMoneySystem())!.allocated).toBe(nano('100').toString());
 await kvSet('node:journey-executor',JSON.stringify({wallet_address:fixture.executor}));
 now=(fixture.time+2)*1000;
 async function compute(key:string,price:number){
  const res=response();
  await paidInference({headers:{'idempotency-key':key},body:{stream:false}} as any,res as any,
   {wallet:fixture.payer,price,model:'qwen2.5:0.5b',messages:[{role:'user',content:'Sandbox test'}],maxTokens:16,surface:'api'});
  return res;
 }
 const accepted=await compute('journey-success-v1',10);expect(accepted.code).toBe(200);
 expect((await compute('journey-success-v1',10)).body).toEqual(accepted.body);
 expect(workerCalls).toBe(1);
 expect((await moneyBalance(fixture.payer)).balance_gstd).toBe(90);
 expect((await moneyBalance(fixture.executor)).pending_nano).toBe(nano('8.5').toString());
 expect(JSON.parse((await kvGet('money:v2:fund:protocol'))!).nano).toBe('0');
 expect(JSON.parse((await kvGet('money:v2:fund:protocol'))!).creditedNano).toBe(nano('1').toString());
 expect((await moneyBalance((await import('./mainnetEscrowManifest')).MAINNET_ESCROW.protocol)).available_nano).toBe(nano('1').toString());
 expect(JSON.parse((await kvGet('money:v2:fund:reserve'))!).nano).toBe(nano('0.5').toString());
 workerFails=true;
 const failed=await compute('journey-failure-v1',5);
 expect(failed.code).toBe(503);expect(failed.body.refunded).toBe(true);
 expect((await moneyBalance(fixture.payer)).balance_gstd).toBe(90);
 expect((await moneyBalance(fixture.payer)).reserved_gstd).toBe(0);
 const claimed=await claimMoney(fixture.executor);expect(claimed.amount).toBe(nano('8.5'));
 expect((await claimMoney(fixture.executor)).amount).toBe(0n);
 session.wallet=fixture.executor;
 const requested=await call(withdrawals,{action:'request',amount_gstd:'8.5'},fixture.requestId);
 expect(requested.code).toBe(200);
 expect((await moneyBalance(fixture.executor)).reserved_nano).toBe(nano('8.5').toString());
 session.wallet=fixture.payer;
 expect((await call(withdrawals,{action:'dispatch',id:requested.body.withdrawal.id})).code).toBe(404);
 session.wallet=fixture.custody;
 const dispatched=await call(withdrawals,{action:'dispatch',id:requested.body.withdrawal.id});
 expect(dispatched.code).toBe(200);
 const payload=Cell.fromBase64(dispatched.body.transaction.messages[0].payload).beginParse();
 expect(payload.loadUint(32)).toBe(0x0f8a7ea5);
 expect(payload.loadUintBig(64).toString()).toBe(requested.body.withdrawal.queryId);
 expect(payload.loadCoins()).toBe(nano('8.5'));expect(payload.loadAddress().toRawString()).toBe(fixture.executor);
 expect(dispatched.body.transaction.from).toBe(fixture.custody);
 expect((await call(withdrawals,{action:'dispatch',id:requested.body.withdrawal.id})).code).toBe(409);
 reserve=fixture.custody_reserve_after_withdrawal;now=(fixture.time+4)*1000;
 session.wallet=fixture.executor;
 const confirmed=await call(withdrawals,{action:'confirm',id:requested.body.withdrawal.id,tx_hash:fixture.withdrawal.hash});
 expect(confirmed.code).toBe(200);expect(confirmed.body.withdrawal.state).toBe('confirmed');
 expect((await call(withdrawals,{action:'confirm',id:requested.body.withdrawal.id,tx_hash:fixture.withdrawal.hash})).code).toBe(200);
 expect((await moneyBalance(fixture.executor)).reserved_gstd).toBe(0);
 expect((await moneyBalance(fixture.executor)).balance_gstd).toBe(0);
 const system=(await readMoneySystem())!;
 expect(system.allocated).toBe(nano('91.5').toString());
 expect(system.reserve).toBe(nano('91.5').toString());
 expect(system.payoutInFlight).toBeUndefined();
 expect((await getWithdrawal(requested.body.withdrawal.id))!.receiptHash).toBe(fixture.withdrawal.hash);
},30_000);

// Consumer fixture: outbound transport is validated separately in nodeFetch.test.ts.
vi.mock('./nodeFetch',()=>({fetchNode:(url:string,init:RequestInit)=>fetch(url,init)}));

// Financial orchestration fixture assumes an independently attested executor.
vi.mock('./nodeEndpointStatus',()=>({endpointVerified:()=>true}));
