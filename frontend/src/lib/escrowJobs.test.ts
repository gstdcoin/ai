import {beforeEach,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {beginCell,storeStateInit} from '@ton/core';
import {WalletContractV4} from '@ton/ton';
import {keyPairFromSeed,sign} from '@ton/crypto';
const state=vi.hoisted(()=>({nodes:[] as any[],chain:null as any}));
vi.mock('./nodes',()=>({getActiveNodes:async()=>state.nodes}));
vi.mock('./batchEscrowStatus',()=>({batchStatus:async()=>state.chain}));
import {kvGet,kvSet} from './kv';
import {nodeKeyRedisKey} from './nodeAuth';
import {setTestnetNodePayout,testnetPayoutMessage} from './testnetNodePayout';
import {pilotJobHash,pilotPrompt} from './escrowJobManifest';
import {preparePilotJob,pilotRecord} from './escrowJobs';
import {pilotSignDataDigest,verifyPilotAuthorization} from './escrowJobAuth';
import {assignTaskToNode} from './task-assignment';
import jobHandler from '../pages/api/v1/finance/escrow-job';
import completeHandler from '../pages/api/v1/tasks/complete';
const node='pilot-executor',model='qwen2.5:0.5b',key=keyPairFromSeed(Buffer.alloc(32,81));
const wallet=WalletContractV4.create({workchain:0,publicKey:key.publicKey}),payer=wallet.address.toRawString();
const init=beginCell().store(storeStateInit(wallet.init)).endCell().toBoc().toString('base64');
function authorization(text:string){const timestamp=Math.floor(Date.now()/1000);return{domain:'app.gstdtoken.com',timestamp,address:payer,payload:{type:'text',text},signature:sign(pilotSignDataDigest(payer,'app.gstdtoken.com',timestamp,text),key.secretKey).toString('base64')};}
async function call(handler:any,body:any,headers:any={}){
 const res={code:200,body:null as any,setHeader(){},status(code:number){this.code=code;return this;},json(body:any){this.body=body;return this;}};
 await handler({method:'POST',body,headers},res);return res;
}
async function api(action:string,extra:any={}){return call(jobHandler,{network:'-3',action,...extra},{'x-real-ip':'pilot-test-'+Math.random()});}
async function bind(){
 await kvSet(nodeKeyRedisKey(node),key.publicKey.toString('hex'),600);
 await kvSet('node:'+node,JSON.stringify({node_id:node,wallet_address:payer,tasks_completed:0,gstd_earned:0}),600);
 const raw=await kvGet('node_payout_testnet:'+node),revision=raw?JSON.parse(raw).revision:0,timestamp=Date.now();
 await setTestnetNodePayout({nodeId:node,address:payer,revision,timestamp,signature:sign(testnetPayoutMessage(node,payer,revision,timestamp),key.secretKey).toString('hex')});
}
beforeEach(async()=>{state.nodes=[{nodeId:node,models:[model]}];state.chain={deployed:true,state:0,mask:7,shares:[0,1,2].map(()=>({missing_nano:'0'}))};await bind();});
it('binds node, exact model, recipients, amount and nonce into the contract task',async()=>{
 const {input}=await preparePilotJob(payer,model);
 for(const altered of [{...input,budget:'2'},{...input,worker:'0:'+'11'.repeat(32)},{...input,job:{...input.job!,model:'wrong'}},{...input,job:{...input.job!,nonce:'ff'.repeat(32)}}])expect(pilotJobHash(altered)).not.toBe(input.taskId);
 state.nodes[0].models=['other'];await expect(preparePilotJob(payer,model)).rejects.toThrow('testnet_executor_not_bound');
});
it('verifies ownership, domain, exact message and fresh time; ignores attacker supplied public keys',()=>{
 const text='test challenge',auth=authorization(text);
 expect(verifyPilotAuthorization(auth,init,payer,text)).toBe(true);
 for(const altered of [{...auth,domain:'evil.example'},{...auth,timestamp:auth.timestamp-301},{...auth,payload:{type:'text',text:'other'}},{...auth,signature:auth.signature+'='},{...auth,address:'0:'+'11'.repeat(32),publicKey:key.publicKey.toString('hex')}])expect(verifyPilotAuthorization(altered,init,payer,text)).toBe(false);
 expect(verifyPilotAuthorization(auth,'invalid',payer,text)).toBe(false);
});
it('requires funded escrow and payer signature, queues once, executes once and never credits the internal ledger',async()=>{
 const {input}=await preparePilotJob(payer,model),challenge=(await api('challenge',{input})).body;
 const request={input,nonce:challenge.nonce,authorization:authorization(challenge.text),stateInit:init};
 expect((await api('execute',{...request,authorization:{}})).code).toBe(409);
 state.chain.mask=3;expect((await api('execute',request)).body.error).toBe('state_not_ready');
 state.chain.mask=7;
 const queued=await api('execute',request);expect(queued.code).toBe(200);expect(queued.body.job.state).toBe('queued');
 expect((await api('execute',request)).body.job.queue_task).toBe(queued.body.job.queue_task);
 const taskId=queued.body.job.queue_task,task={task_id:taskId,type:'inference',settlement_mode:'testnet_contract',escrow_task_id:input.taskId,payload:{model,prompt:pilotPrompt(input.job!),max_tokens:32,temperature:0}};
 expect(await assignTaskToNode(task,'other-node',600)).toBe(false);
 expect(await assignTaskToNode({...task,payload:{...task.payload,model:'other'}},node,600)).toBe(false);
 expect(await assignTaskToNode(task,node,600)).toBe(true);
 const ts=Date.now(),headers={'x-wallet-address':payer,'x-gstd-node-ts':String(ts),'x-gstd-node-sig':sign(createHash('sha256').update(node+':'+ts).digest(),key.secretKey).toString('hex')};
 const body={node_id:node,task_id:taskId,model,result:'391',latency_ms:10};
 expect((await call(completeHandler,{...body,result:'392'},headers)).code).toBe(422);
 expect((await call(completeHandler,{...body,model:undefined},headers)).code).toBe(422);
 expect((await call(completeHandler,body,headers)).body).toMatchObject({ok:true,reward_gstd:0,escrow_receipt:{result:'391',ledger_credited:false}});
 expect((await call(completeHandler,body,headers)).body.duplicate).toBe(true);
 expect((await pilotRecord(input))?.record.state).toBe('computed');
 expect(JSON.parse((await kvGet('node:'+node))!)).toMatchObject({tasks_completed:1,gstd_earned:0});
 expect(await kvGet('money:v2:job:'+taskId)).toBeNull();
 expect(await kvGet('task:result:'+taskId)).toBeNull();
});
it('cannot modify the primary payout or replay a payout signature with another revision',async()=>{
 const main='node_payout:'+node;await kvSet(main,'primary-preserved',600);
 const raw=JSON.parse((await kvGet('node_payout_testnet:'+node))!),timestamp=Date.now(),signature=sign(testnetPayoutMessage(node,payer,raw.revision,timestamp),key.secretKey).toString('hex');
 await expect(setTestnetNodePayout({nodeId:node,address:payer,revision:raw.revision+1,timestamp,signature})).rejects.toThrow('invalid_payout_signature');
 expect(await kvGet(main)).toBe('primary-preserved');
});

it('matches a separately encoded UTF-8 TON Connect signData digest fixture',()=>{expect(pilotSignDataDigest('0:'+'11'.repeat(32),'app.gstdtoken.com',1764424200,'GSTD: разрешение').toString('hex')).toBe('6639598f2a7688011427cebcb85fe6e040b06babf80f8e83dab576d37f62a55a');});
