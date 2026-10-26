import complete from '../pages/api/v1/tasks/complete';
import payoutHandler from '../pages/api/v1/nodes/payout-wallet';
import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {keyPairFromSeed,sign} from '@ton/crypto';
import {kvSet,kvGet} from './kv';
import {nodeKeyRedisKey} from './nodeAuth';
import {payoutMessage,setNodePayout,nodePayout,executorPayout} from './nodePayout';
import {assignTaskToNode} from './task-assignment';
import {nano,reconcileMoney,reserveMoney,moneyBalance} from './money';
const keys=keyPairFromSeed(Buffer.alloc(32,94)),old='0:'+'51'.repeat(32),next='0:'+'52'.repeat(32);
async function bind(id:string,address:string,revision:number){
 const timestamp=Date.now();
 return setNodePayout({nodeId:id,address,revision,timestamp,signature:sign(payoutMessage(id,address,revision,timestamp),keys.secretKey).toString('hex')});
}
describe('operator reward wallet',()=>{
 it('binds the new recipient without changing node identity or moving old balances',async()=>{
  const id='payout-new-recipient';await kvSet(nodeKeyRedisKey(id),keys.publicKey.toString('hex'));
  const record=JSON.stringify({wallet_address:old});await kvSet('node:'+id,record);
  expect(await executorPayout(id,old)).toBe(old);
  expect((await bind(id,next,0)).address).toBe(next);
  expect(await executorPayout(id,old)).toBe(next);
  expect(await kvGet('node:'+id)).toBe(record);
 });
 it('rejects wrong signatures, address substitution, stale commands and replay',async()=>{
  const id='payout-signature-gates';await kvSet(nodeKeyRedisKey(id),keys.publicKey.toString('hex'));
  const timestamp=Date.now(),signature=sign(payoutMessage(id,next,0,timestamp),keys.secretKey).toString('hex');
  await expect(setNodePayout({nodeId:id,address:old,revision:0,timestamp,signature})).rejects.toThrow('invalid_payout_signature');
  await expect(setNodePayout({nodeId:id,address:next,revision:0,timestamp:timestamp-120000,signature})).rejects.toThrow('invalid_payout_signature');
  await bind(id,next,0);
  await expect(bind(id,old,0)).rejects.toThrow('payout_revision_conflict');
  expect((await nodePayout(id))?.address).toBe(next);
 });
 it('freezes the recipient for already assigned funded work',async()=>{
  const id='payout-assignment-snapshot',payer='0:'+'53'.repeat(32),custody='0:'+'54'.repeat(32),task='payout-snapshot-funded';
  await kvSet(nodeKeyRedisKey(id),keys.publicKey.toString('hex'));await kvSet('node:'+id,JSON.stringify({wallet_address:old}));
  await reconcileMoney({owner:custody,jettonWallet:custody,reserve:'1000000000000000000'},
   {manifest:'payout-snapshot-fixture',legacyHold:'0',migrationReviewed:true,allocations:[{wallet:payer,amount_nano:nano('1').toString(),reference:'payout-snapshot-fixture'}]});
  await reserveMoney(payer,task,nano('1'),'payout-fixture',Date.now()+60000,'task');
  await bind(id,next,0);
  expect(await assignTaskToNode({task_id:task,type:'inference',funding_id:task,funding_version:2},id,600)).toBe(true);
  await bind(id,old,1);
  expect(JSON.parse((await kvGet('task_assigned:'+task))!).payout_wallet).toBe(next);
  const before=(await moneyBalance(next)).pending_gstd,ts=Date.now();
  const headers={'x-wallet-address':old,'x-gstd-node-ts':String(ts),'x-gstd-node-sig':sign(createHash('sha256').update(id+':'+ts).digest(),keys.secretKey).toString('hex')};
  let status=200;const response:any={status(n:number){status=n;return this;},json(){return this;}};
  await complete({method:'POST',body:{node_id:id,task_id:task,result:'accepted result'},headers} as any,response);
  expect(status).toBe(200);
  expect((await moneyBalance(next)).pending_gstd-before).toBeCloseTo(0.85,9);

 });
 it('protects the payout HTTP route from unsigned callers',async()=>{
  const id='payout-http-auth';await kvSet(nodeKeyRedisKey(id),keys.publicKey.toString('hex'));
  let status=200;
  await payoutHandler({method:'POST',headers:{},body:{node_id:id,address:next,revision:0}} as any,
   {status(n:number){status=n;return this;},json(){return this;},setHeader(){}} as any);
  expect(status).toBe(401);
  expect(await nodePayout(id)).toBeNull();
 });

});
