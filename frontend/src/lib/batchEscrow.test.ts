import {it,expect} from 'vitest';
import {Cell,loadStateInit,contractAddress} from '@ton/core';
import {batchPreview,batchTransaction,batchContext,type BatchInput} from './batchEscrow';
import manifest from './escrow-generated/manifest.json';
import proof from './escrow-generated/cost-proof.json';
import {loadWithdrawAcceptedShare} from './escrow-generated/GstdEscrowShare';
const payer='0:'+'11'.repeat(32),worker='0:'+'22'.repeat(32),protocol='0:'+'33'.repeat(32),reserve='0:'+'44'.repeat(32);
const input:BatchInput={payer,worker,protocol,reserve,budget:'1',requests:100,taskId:'55'.repeat(32),deadline:Math.floor(Date.now()/1000)+3600};
it('binds deterministic recipients, exact85/10/5 shares and compiled artifact code hashes',async()=>{
 const c=await batchContext(input),p=await batchPreview(input);
 expect(p.network).toBe('-3');expect(p.test_only).toBe(true);
 expect(p.shares.map(x=>x.amount_nano)).toEqual(['850000000','100000000','50000000']);
 expect(p.shares.map(x=>x.owner)).toEqual([worker,protocol,reserve]);
 expect(c.task.init!.code.hash().toString('hex')).toBe(manifest.contracts.GstdTaskEscrow.code_hash);
 expect(c.shares[0].init!.code.hash().toString('hex')).toBe(manifest.contracts.GstdEscrowShare.code_hash);
 expect(c.master.init!.code.hash().toString('hex')).toBe(manifest.contracts.TestGstdMaster.code_hash);
 expect((await batchPreview({...input,worker:payer})).task).not.toBe(p.task);
 expect((await batchPreview({...input,taskId:'66'.repeat(32)})).task).not.toBe(p.task);
});
it('prepares testnet-only signing payloads and refuses a different signer',async()=>{
 for(const action of ['mint','deploy','fund','accept','expire','sync','refund','reclaim','report'] as const){
  const tx=await batchTransaction(input,action,payer);
  expect(tx.network).toBe('-3');expect(tx.from).toBe(payer);expect(tx.messages.length).toBeLessThanOrEqual(4);
 }
 await expect(batchTransaction(input,'accept',worker)).rejects.toThrow('wrong_signer');
 await expect(batchTransaction(input,'withdraw',payer,0)).rejects.toThrow('wrong_signer');
 const tx=await batchTransaction(input,'withdraw',worker,0);
 expect(tx.from).toBe(worker);expect(tx.messages[0].address).toBe((await batchPreview(input)).shares[0].address);
});
it('the deployment stateInit matches the displayed address; funding goes only to derived shares',async()=>{
 const p=await batchPreview(input),tx=await batchTransaction(input,'deploy',payer);
 const init=loadStateInit(Cell.fromBase64(tx.messages[0].stateInit!).beginParse());
 expect(contractAddress(0,init).toRawString()).toBe(p.task);
 const funding=await batchTransaction(input,'fund',payer,0,[1n,0n,2n]);
 expect(funding.messages).toHaveLength(2);
 for(const [i,expectedRole] of [0,2].entries()){
  const body=Cell.fromBase64(funding.messages[i].payload).beginParse();
  expect(body.loadUint(32)).toBe(0x0f8a7ea5);body.loadUintBig(64);
  expect(body.loadCoins()).toBe(i===0?1n:2n);expect(body.loadAddress().toRawString()).toBe(p.shares[expectedRole].address);
 }
 await expect(batchTransaction(input,'fund',payer,0,[0n,0n,0n])).rejects.toThrow('already_funded');
});
it('can withdraw a remaining partial share and refund only nonempty shares',async()=>{
 const tx=await batchTransaction(input,'withdraw',worker,0,undefined,7n);
 const decoded=loadWithdrawAcceptedShare(Cell.fromBase64(tx.messages[0].payload).beginParse());expect(decoded.amount).toBe(7n);
 const refund=await batchTransaction(input,'refund',payer,0,undefined,undefined,[0n,3n,0n]);
 expect(refund.messages).toHaveLength(1);
});
it('rejects malformed amounts, unbounded scenarios and unsupported addresses before any signing',async()=>{
 for(const changes of [{budget:'1e6'},{budget:'1001'},{budget:'-1'},{budget:'0.000000001'},{requests:0},{requests:10001},{taskId:'nope'},{payer:'-1:'+'11'.repeat(32)}]){
  await expect(batchPreview({...input,...changes} as BatchInput)).rejects.toThrow();
 }
});

it('ties the published fee comparison to exactly the exported contract code',()=>{
 for(const name of ['GstdTaskEscrow','GstdEscrowShare','TestGstdMaster'] as const)expect(proof.code_hashes[name]).toBe(manifest.contracts[name].code_hash);
 expect(BigInt(proof.batch_total_fees_nano)*3n).toBeLessThan(BigInt(proof.five_separate_total_fees_nano));
});
