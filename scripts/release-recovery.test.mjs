import{test}from 'node:test';
import assert from 'node:assert/strict';
import{validateRecoveryRequest,provisionReleaseKey,WORKER,SECRET}from './release-recovery-core.mjs';
const now=1800000000000,key='a'.repeat(64);
const request={id:'11111111-1111-4111-8111-111111111111',action:'rotate-node-release-key',worker:WORKER,expectedPublicKey:key,issuedAt:now,expiresAt:now+3600000};
test('requires a fresh exact-target owner request bound to the existing release root',()=>{
 assert.equal(validateRecoveryRequest(request,key,now).id,request.id);
 for(const patch of [{action:'other'},{worker:'preview'},{expectedPublicKey:'b'.repeat(64)},{issuedAt:now+6000},{expiresAt:now},{expiresAt:now+3600001},{extra:true}])assert.throws(()=>validateRecoveryRequest({...request,...patch},key,now));
});
test('uploads a bounded release seed once and exports only the public key, then zeros buffers',async()=>{
 const seed=Buffer.alloc(32,44),secret=seed.toString('hex');let uploads=0,saved;
 const artifact=await provisionReleaseKey({request,now,random:()=>seed,putSecret:async value=>{uploads++;assert.equal(value.length,32);assert.equal(value.toString('hex'),secret);},writePublicArtifact:async a=>{saved=a;}});
 assert.equal(uploads,1);assert.equal(artifact.worker,WORKER);assert.equal(artifact.secret,SECRET);assert.match(artifact.public_key,/^[a-f0-9]{64}$/);
 assert.equal(saved,artifact);assert(!JSON.stringify(artifact).includes(secret));assert(seed.every(n=>n===0));
});
test('preserves only a public failed-state artifact after an uncertain upload',async()=>{
 const seed=Buffer.alloc(32,45);const states=[];
 await assert.rejects(provisionReleaseKey({request,now,random:()=>seed,putSecret:async()=>{throw Error('upload unavailable');},writePublicArtifact:async a=>{states.push(a.upload_status);}}));
 assert.deepEqual(states,['prepared','failed_or_uncertain']);assert(seed.every(n=>n===0));
});
