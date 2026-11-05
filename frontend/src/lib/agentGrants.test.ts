import {describe,it,expect} from 'vitest';
import {kvSet,kvGet} from './kv';
import {nano,reconcileMoney,reserveMoney,captureMoney,releaseMoney,moneyBalance,createAgentGrant,revokeAgentGrant,getAgentGrant,digest,validateGrantPolicy} from './money';
import {grantChallenge,authenticateAgent,readGrantChallenge} from './agentGrants';
let n=5000;
const operator='0:'+'ab'.repeat(32),custody='0:'+'cd'.repeat(32);
async function setup(budget='0.01'){
 const wallet='0:'+(++n).toString(16).padStart(64,'0');
 await reconcileMoney({owner:custody,jettonWallet:custody,reserve:nano('1000000000').toString()},
 {manifest:'grant-test-'+n,legacyHold:'0',migrationReviewed:true,allocations:[{wallet,amount_nano:nano('1').toString(),reference:'grant-fund-'+n}]});
 const policy={label:'fixture',models:['qwen2.5:0.5b'],executors:[{nodeId:'node-fixture',wallet:operator}],
 budgetNano:nano(budget).toString(),perRequestNano:nano('0.005').toString(),maxRequests:10,maxTokens:32,expiresAt:Date.now()+60000};
 const c=await grantChallenge(wallet,policy),raw=(await readGrantChallenge(c.nonce,wallet)).raw;
 const created=await createAgentGrant(wallet,policy,c.nonce,raw);
 const use={id:created.grant.id,tokenHash:digest(created.token),model:policy.models[0],nodeId:'node-fixture',executor:operator,maxTokens:32};
 return{wallet,policy,c,raw,created,use};
}
describe('persistent bounded agent spending',()=>{
 it('binds token to a hashed grant and consumes authorization once',async()=>{
  const a=await setup();
  expect((await authenticateAgent({authorization:'Bearer '+a.created.token})).id).toBe(a.use.id);
  expect(JSON.stringify(await kvGet('money:v2:agent-grant:'+a.use.id))).not.toContain(a.created.token);
  await expect(authenticateAgent({authorization:'Bearer '+a.created.token.slice(0,-1)+'z'})).rejects.toThrow();
  await expect(createAgentGrant(a.wallet,a.policy,a.c.nonce,a.raw)).rejects.toThrow('grant_challenge_used');
  expect(a.created.grant).not.toHaveProperty('tokenHash');
 });
 it('atomically enforces a shared budget under concurrent reservations',async()=>{
  const a=await setup();
  const attempts=await Promise.allSettled(Array.from({length:8},(_,i)=>reserveMoney(a.wallet,'grant-race-'+n+'-'+i,nano('0.005'),'f'+i,Date.now()+30000,'chat',undefined,a.use)));
  expect(attempts.filter(v=>v.status==='fulfilled')).toHaveLength(2);
  expect((await getAgentGrant(a.use.id))?.reservedNano).toBe(nano('0.01').toString());
  expect((await moneyBalance(a.wallet)).reserved_gstd).toBe(0.01);
 });
 it('refunds atomically once, settles 85/10/5 once, and counts failed attempts',async()=>{
  const a=await setup(),first='grant-release-'+n,second='grant-capture-'+n;
  await reserveMoney(a.wallet,first,nano('0.005'),'f',Date.now()+30000,'chat',undefined,a.use);
  await Promise.all([releaseMoney(first),releaseMoney(first)]);
  expect((await getAgentGrant(a.use.id))?.reservedNano).toBe('0');
  expect((await getAgentGrant(a.use.id))?.spentNano).toBe('0');
  const before=(await moneyBalance(operator)).pending_nano;
  await reserveMoney(a.wallet,second,nano('0.005'),'g',Date.now()+30000,'chat',undefined,a.use);
  await captureMoney(second,operator,{answer:'fixture'});
  await captureMoney(second,operator,{answer:'fixture'});
  expect(BigInt((await moneyBalance(operator)).pending_nano)-BigInt(before)).toBe(nano('0.00425'));
  expect((await getAgentGrant(a.use.id))?.spentNano).toBe(nano('0.005').toString());
  expect((await getAgentGrant(a.use.id))?.requests).toBe(2);
 });
 it('blocks revoked grants but completes already reserved work',async()=>{
  const a=await setup(),job='grant-revoke-'+n;
  await reserveMoney(a.wallet,job,nano('0.005'),'f',Date.now()+30000,'chat',undefined,a.use);
  await expect(revokeAgentGrant(operator,a.use.id)).rejects.toThrow('grant_not_found');
  await revokeAgentGrant(a.wallet,a.use.id);
  await expect(reserveMoney(a.wallet,job+'2',nano('0.005'),'g',Date.now()+30000,'chat',undefined,a.use)).rejects.toThrow('grant_inactive');
  await captureMoney(job,operator,{answer:'fixture'});
  expect((await getAgentGrant(a.use.id))?.spentNano).toBe(nano('0.005').toString());
 });
 it('denies model, executor, token and per-request cap violations before any debit',async()=>{
  const a=await setup();
  for(const patch of [{model:'other'},{nodeId:'other'},{executor:custody},{maxTokens:33},{tokenHash:'bad'}]){
   await expect(reserveMoney(a.wallet,'grant-deny-'+n,nano('0.005'),'f',Date.now()+30000,'chat',undefined,{...a.use,...patch})).rejects.toThrow();
  }
  await expect(reserveMoney(a.wallet,'grant-cap-'+n,nano('0.006'),'f',Date.now()+30000,'chat',undefined,a.use)).rejects.toThrow('grant_budget_exhausted');
  const key='money:v2:agent-grant:'+a.use.id,g=(await getAgentGrant(a.use.id))!;
  await kvSet(key,JSON.stringify({...g,expiresAt:Date.now()-1}));
  await expect(reserveMoney(a.wallet,'grant-expired-'+n,nano('0.005'),'f',Date.now()+30000,'chat',undefined,a.use)).rejects.toThrow('grant_inactive');
  expect((await moneyBalance(a.wallet)).balance_gstd).toBe(1);
  expect(()=>validateGrantPolicy({...a.policy,models:['auto']})).toThrow('invalid_grant_policy');
 });
});
