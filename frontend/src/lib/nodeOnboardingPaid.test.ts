import { expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { keyPairFromSeed, sign } from '@ton/crypto';
// This fixture must never contact a configured production datastore or a real node.
vi.hoisted(() => {
 for (const name of ['KV_REST_API_URL','KV_REST_API_TOKEN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN']) process.env[name]='';
 vi.stubEnv('NODE_ENV','test');
});
vi.mock('./nodeUpdate',()=>({nodeUpdateInfo:async()=>({update_available:false})}));
import { kvGet, kvSet } from './kv';
import { nano, reconcileMoney, moneyBalance, moneyJob } from './money';
import register from '../pages/api/v1/nodes/register';
import heartbeat from '../pages/api/v1/nodes/heartbeat';
import poll from '../pages/api/v1/tasks/poll';
import pending from '../pages/api/v1/tasks/worker/pending';
import complete from '../pages/api/v1/tasks/complete';
import sdkSubmit from '../pages/api/v1/tasks/worker/submit';
import createCampaign from '../pages/api/v1/campaigns/create';
import requestTask from '../pages/api/v1/marketplace/request';
import cancelCampaign from '../pages/api/v1/campaigns/cancel';
import claimRewards from '../pages/api/v1/nodes/claim-rewards';
import creditBalance from '../pages/api/v1/credits/balance';
import paidChat from '../pages/api/v1/chat/completions';

let sequence=0;
const identity=keyPairFromSeed(Buffer.alloc(32,119));
const model='fixture-model:tiny';
async function call(handler:any,method:string,body:any,headers:any={},query:any={}) {
 let status=200,value:any;
 await handler({method,body,headers,query},{status(n:number){status=n;return this;},json(v:any){value=v;return this;},setHeader(){return this;}});
 return {status,value};
}
async function fixture() {
 const i=++sequence,nodeId='fresh-outbound-fixture-'+i;
 const payer='0:'+(200+i).toString(16).padStart(64,'0');
 const operator='0:'+(300+i).toString(16).padStart(64,'0');
 const custody='0:'+'a1'.repeat(32),session='payer-fixture-'+i,operatorSession='operator-fixture-'+i;
 const signed=()=>{const timestamp=Date.now();return {'x-wallet-address':operator,'x-gstd-node-ts':String(timestamp),
  'x-gstd-node-sig':sign(createHash('sha256').update(nodeId+':'+timestamp).digest(),identity.secretKey).toString('hex')};};
 const registered=await call(register,'POST',{node_id:nodeId,node_pubkey:identity.publicKey.toString('hex'),
  platform:'linux',arch:'arm64',cpu_cores:4,ram:8192,capabilities:[model]},signed());
 expect(registered.status).toBe(200);
 expect(JSON.parse((await kvGet('node:'+nodeId))!).node_url).toBeUndefined();
 expect((await call(heartbeat,'POST',{node_id:nodeId,platform:'linux',arch:'arm64',cpu_cores:4,ram_mb:8192,capabilities:[model]},signed())).value.reward).toBe(0);
 // An empty queue is an ordinary idle state, not an earning event.
 const empty=await call(pending,'GET',{},signed(),{node_id:nodeId});
 expect(empty.value.tasks).toEqual([]);expect((await moneyBalance(operator)).pending_gstd).toBe(0);
 await reconcileMoney({owner:custody,jettonWallet:custody,reserve:'1000000000000000000'},
  {manifest:'outbound-inventory-'+i,legacyHold:'0',migrationReviewed:true,
   allocations:[{wallet:payer,amount_nano:nano('10').toString(),reference:'outbound-allocation-'+i}]});
 await kvSet('ton-auth:session:'+session,payer);await kvSet('ton-auth:session:'+operatorSession,operator);
 const payerHeaders={'x-session-token':session,'idempotency-key':'fixture-campaign-'+i};
 const campaign=await call(createCampaign,'POST',{company:'Isolated fixture',title:'Private worker test',wallet_address:payer,
  reward_per_task:10,total_budget:10,required_type:'inference',required_caps:[model]},payerHeaders);
 expect(campaign.status).toBe(200);
 const queued=await call(requestTask,'POST',{campaign_id:campaign.value.campaign_id,type:'inference',payload:{model,prompt:'2+2'},required_caps:[model]},
  {...payerHeaders,'idempotency-key':'fixture-request-'+i});
 expect(queued.status).toBe(200);expect(queued.value.reward_gstd).toBe(8.5);
 expect((await moneyBalance(payer)).reserved_gstd).toBe(10);
 return {nodeId,payer,operator,signed,payerHeaders,operatorSession,campaignId:campaign.value.campaign_id,taskId:queued.value.task_id};
}
async function fundAmount(name:string) {const raw=await kvGet('money:v2:fund:'+name);return BigInt(raw?JSON.parse(raw).nano:'0');}

it.each([['gstdbot',poll,complete],['SDK',pending,sdkSubmit]] as const)('accepts funded work from a new outbound-only %s node and settles exactly once',async(kind,pick,finish)=>{
 const f=await fixture(),protocol=await fundAmount('protocol'),reserve=await fundAmount('reserve');
 const picked=await call(pick,kind==='SDK'?'GET':'POST',{node_id:f.nodeId,capabilities:[model],supported_task_kinds:['inference'],resources:{cpu_cores:4,ram_free_mb:4096}},f.signed(),{node_id:f.nodeId});
 expect(picked.status).toBe(200);expect(kind==='SDK'?picked.value.tasks[0].task_id:picked.value.task.task_id).toBe(f.taskId);
 const result={task_id:f.taskId,node_id:f.nodeId,model,result:{response:'4'},reward_gstd:999999};
 const assignmentBefore=await kvGet('task_assigned:'+f.taskId);
 for (const mismatched of [{...result,model:'different-model:tiny'}, {...result,result:{response:'4',model:'different-model:tiny'}}]) {
  const rejected=await call(finish,'POST',mismatched,f.signed());
  expect(rejected.status).toBe(422);expect(rejected.value.error).toBe('model_mismatch');
  expect(await kvGet('task_assigned:'+f.taskId)).toBe(assignmentBefore);
  expect(await kvGet('task_completed:'+f.taskId)).toBeNull();
  expect((await moneyJob(f.taskId))?.state).toBe('reserved');
  expect((await moneyBalance(f.operator)).pending_gstd).toBe(0);
  expect(await fundAmount('protocol')).toBe(protocol);expect(await fundAmount('reserve')).toBe(reserve);
 }

 const accepted=await call(finish,'POST',result,f.signed());
 expect(accepted.status).toBe(200);expect(accepted.value.reward_gstd).toBe(8.5);
 expect((await moneyJob(f.taskId))?.state).toBe('captured');
 expect((await moneyBalance(f.operator)).pending_gstd).toBe(8.5);
 expect(await fundAmount('protocol')-protocol).toBe(nano('1'));
 expect(await fundAmount('reserve')-reserve).toBe(nano('0.5'));
 expect((await call(finish,'POST',result,f.signed())).value.duplicate).toBe(true);
 expect((await moneyBalance(f.operator)).pending_gstd).toBe(8.5);
 expect(JSON.parse((await kvGet('node:'+f.nodeId))!).tasks_completed).toBe(1);
 expect(JSON.parse((await kvGet('task:result:'+f.taskId))!).ready).toBe(true);
 const balance=await call(creditBalance,'GET',{}, {'x-session-token':f.operatorSession});
 expect(balance.value.pending_rewards_gstd).toBe(8.5);
 const claim=await call(claimRewards,'POST',{}, {'x-session-token':f.operatorSession});
 expect(claim.value).toMatchObject({claimed_gstd:8.5,fee_gstd:0,ledger_version:2});
 expect((await moneyBalance(f.operator)).balance_gstd).toBe(8.5);
 // Reuse an earned balance to buy a specific model from another fixture executor.
 // The executor response is mocked; this is not a second physical node or a mainnet payment.
 const remoteId=f.nodeId+'-remote',remoteWallet='0:'+(400+sequence).toString(16).padStart(64,'0');
 const remoteModel='fixture-credit-reuse:'+sequence,remoteUrl='https://paid-fixture-'+sequence+'.example';
 const timestamp=Date.now();
 const remoteHeaders={'x-wallet-address':remoteWallet,'x-gstd-node-ts':String(timestamp),
  'x-gstd-node-sig':sign(createHash('sha256').update(remoteId+':'+timestamp).digest(),identity.secretKey).toString('hex')};
 expect((await call(register,'POST',{node_id:remoteId,node_pubkey:identity.publicKey.toString('hex'),node_url:remoteUrl,capabilities:[remoteModel]},remoteHeaders)).status).toBe(200);
 const protocolBefore=await fundAmount('protocol'),reserveBefore=await fundAmount('reserve');
 const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(async(url)=>{
  expect(String(url)).toBe(remoteUrl+'/v1/chat/completions');
  const account=await moneyBalance(f.operator);
  expect(account.reserved_gstd).toBe(0.005);expect(account.balance_gstd).toBe(8.495);
  return new Response(JSON.stringify({model:remoteModel,choices:[{message:{content:'fixture answer'}}]}),{status:200,headers:{'Content-Type':'application/json'}});
 });
 try {
  const reused=await call(paidChat,'POST',{model:remoteModel,messages:[{role:'user',content:'Fixture compute purchase'}],stream:false},
   {'x-session-token':f.operatorSession,'idempotency-key':'reuse-'+f.nodeId});
  expect(reused.status).toBe(200);expect(reused.value.model).toBe(remoteModel);
  expect(reused.value._gstd.billing.charged_gstd).toBe(0.005);
 } finally {fetchMock.mockRestore();}
 expect((await moneyBalance(f.operator)).balance_gstd).toBe(8.495);
 expect((await moneyBalance(f.operator)).reserved_gstd).toBe(0);
 expect((await moneyBalance(remoteWallet)).pending_gstd).toBe(0.00425);
 expect(await fundAmount('protocol')-protocolBefore).toBe(nano('0.0005'));
 expect(await fundAmount('reserve')-reserveBefore).toBe(nano('0.00025'));
});
it('refunds failed SDK work without earnings or fees',async()=>{
 const f=await fixture(),protocol=await fundAmount('protocol'),reserve=await fundAmount('reserve');
 await call(pending,'GET',{},f.signed(),{node_id:f.nodeId});
 const failed=await call(sdkSubmit,'POST',{node_id:f.nodeId,task_id:f.taskId,error:'inference_failed'},f.signed());
 expect(failed.status).toBe(422);expect((await moneyJob(f.taskId))?.state).toBe('released');
 expect((await moneyBalance(f.operator)).pending_gstd).toBe(0);
 expect(await fundAmount('protocol')).toBe(protocol);expect(await fundAmount('reserve')).toBe(reserve);
 const cancelled=await call(cancelCampaign,'POST',{campaign_id:f.campaignId},f.payerHeaders);
 expect(cancelled.status).toBe(200);expect((await moneyBalance(f.payer)).balance_gstd).toBe(10);
});
