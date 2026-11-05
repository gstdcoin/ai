import {describe,it,expect} from 'vitest';
import {kvSet,kvGet} from './kv';
import {MAINNET_ESCROW} from './mainnetEscrowManifest';
import {reserveMoney,captureMoney,releaseMoney,creditProtocolFund,reconcileMoney,nano,moneyBalance} from './money';
const admin=MAINNET_ESCROW.protocol,operator='0:'+'d1'.repeat(32),custody='0:'+'d2'.repeat(32);
let seq=7600;
async function funded(wallet?:string){
 const address=wallet||'0:'+(++seq).toString(16).padStart(64,'0');
 await reconcileMoney({owner:custody,jettonWallet:custody,reserve:nano('1000000000').toString()},
 {manifest:'protocol-'+seq,legacyHold:'0',migrationReviewed:true,allocations:[{wallet:address,amount_nano:nano('1').toString(),reference:'protocol-fund-'+seq}]});
 return address;
}
describe('automatic protocol income with protected liquidity reserve',()=>{
 it('credits the fixed administrator once and preserves 85/10/5 without new allocated liabilities',async()=>{
  const payer=await funded(),beforeAdmin=BigInt((await moneyBalance(admin)).available_nano),beforeNode=BigInt((await moneyBalance(operator)).pending_nano);
  await kvSet('money:v2:fund:protocol',JSON.stringify({nano:'0'}));
  await kvSet('money:v2:fund:reserve',JSON.stringify({nano:'0'}));
  await reserveMoney(payer,'protocol-job-'+seq,nano('1'),'exact',Date.now()+60000);
  await captureMoney('protocol-job-'+seq,operator,{answer:'accepted'});
  await captureMoney('protocol-job-'+seq,operator,{answer:'replayed'});
  expect(BigInt((await moneyBalance(admin)).available_nano)-beforeAdmin).toBe(nano('0.1'));
  expect(BigInt((await moneyBalance(operator)).pending_nano)-beforeNode).toBe(nano('0.85'));
  expect(JSON.parse((await kvGet('money:v2:fund:reserve'))!).nano).toBe('50000000');
  expect(JSON.parse((await kvGet('money:v2:fund:protocol'))!)).toMatchObject({nano:'0',creditedNano:'100000000',beneficiary:admin});
 });
 it('migrates accrued protocol allocations atomically, never draws the 5% reserve',async()=>{
  await funded();
  // Fixture liabilities already included in the isolated backing snapshot.
  const system=JSON.parse((await kvGet('money:v2:system'))!);
  await kvSet('money:v2:system',JSON.stringify({...system,allocated:String(BigInt(system.allocated)+15000000n)}));
  await kvSet('money:v2:fund:protocol',JSON.stringify({nano:'10000000',creditedNano:'0'}));
  await kvSet('money:v2:fund:reserve',JSON.stringify({nano:'5000000'}));
  const before=BigInt((await moneyBalance(admin)).available_nano);
  await expect(creditProtocolFund(operator,'wrong-owner')).rejects.toThrow('protocol_beneficiary_required');
  const receipts=await Promise.all(Array.from({length:8},()=>creditProtocolFund(admin,'protocol-migration-'+seq)));
  expect(receipts.every(r=>r.amount_nano==='10000000')).toBe(true);
  expect(BigInt((await moneyBalance(admin)).available_nano)-before).toBe(nano('0.01'));
  expect(JSON.parse((await kvGet('money:v2:fund:reserve'))!).nano).toBe('5000000');
 });
 it('handles payer, executor and beneficiary being the same wallet without losing updates',async()=>{
  ++seq;await funded(admin);
  await kvSet('money:v2:fund:protocol',JSON.stringify({nano:'0'}));
  const b=await moneyBalance(admin),job='protocol-same-'+seq;
  await reserveMoney(admin,job,nano('1'),'same',Date.now()+60000);await captureMoney(job,admin,{answer:'fixture'});
  const after=await moneyBalance(admin);
  expect(BigInt(after.available_nano)-BigInt(b.available_nano)).toBe(-nano('0.9'));
  expect(BigInt(after.pending_nano)-BigInt(b.pending_nano)).toBe(nano('0.85'));
 });
 it('does not credit failed work or a stale/unverified backing snapshot',async()=>{
  const payer=await funded(),job='protocol-fail-'+seq,before=(await moneyBalance(admin)).available_nano;
  await reserveMoney(payer,job,nano('1'),'fail',Date.now()+60000);await releaseMoney(job);
  expect((await moneyBalance(admin)).available_nano).toBe(before);
  const raw=await kvGet('money:v2:system');const s=JSON.parse(raw!);await kvSet('money:v2:system',JSON.stringify({...s,validUntil:Date.now()-1}));
  await expect(creditProtocolFund(admin,'stale-protocol-'+seq)).rejects.toThrow('backing_not_reconciled');
  await kvSet('money:v2:system',raw!);
 });
});
