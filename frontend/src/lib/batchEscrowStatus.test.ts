import {it,expect} from 'vitest';
import {batchContext,type BatchInput} from './batchEscrow';
import {batchStatus} from './batchEscrowStatus';
const input:BatchInput={payer:'0:'+'11'.repeat(32),worker:'0:'+'22'.repeat(32),protocol:'0:'+'33'.repeat(32),reserve:'0:'+'44'.repeat(32),budget:'1',requests:10,taskId:'55'.repeat(32),deadline:Math.floor(Date.now()/1000)+3600};
it('distinguishes uninitialized test accounts from funded readiness without fabricating a balance',async()=>{
 const result=await batchStatus(input,{get:async()=>null},async()=>{});
 expect(result).toMatchObject({deployed:false,state:null,payer_balance:'0',mask:0,shares:[]});
});
it('reads actual bound owners, asset and all share states, rejecting forged wallet data',async()=>{
 const c=await batchContext(input);let forge=false;
 const rpc={get:async(path:string)=>{
  const decoded=decodeURIComponent(path),address=decoded.split('/')[2];
  if(decoded.endsWith('/get_wallet_data')){
   const share=c.shares.find(s=>c.tokenWallet(s.address).toRawString()===address);
   const owner=share?.address.toRawString()||c.payer.toRawString();
   return{success:true,decoded:{owner:forge?input.reserve:owner,jetton:c.master.address.toRawString(),balance:share?'850000000':'1000000000'}};
  }
  if(decoded.endsWith('/funding_mask'))return{success:true,stack:[{num:'0x7'}]};
  if(decoded.endsWith('/state'))return{success:true,stack:[{num:'0x1'}]};
  return{status:'active',balance:'20000000'};
 }};
 const result=await batchStatus(input,rpc,async()=>{});
 expect(result).toMatchObject({deployed:true,state:1,mask:7,payer_balance:'1000000000'});
 expect(result.shares).toHaveLength(3);
 forge=true;await expect(batchStatus(input,rpc,async()=>{})).rejects.toThrow('testnet_state_mismatch');
});

it('does not expose a frozen payer wallet as an empty undeployed batch',async()=>{
 await expect(batchStatus(input,{get:async()=>({status:'frozen',balance:'1'})},async()=>{})).rejects.toThrow('testnet_unavailable');
});
