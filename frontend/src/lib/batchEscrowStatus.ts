import {Cell} from '@ton/core';
import {batchContext,rawAddress,type BatchInput} from './batchEscrow';
type Rpc={get(path:string):Promise<any>};
// Fixed public testnet hosts only. Select one fallback per status check, never broadcast.
export function testnetRpc():Rpc {
 let fallback=false;
 const wait=()=>new Promise(r=>setTimeout(r,1100));
 async function center(path:string){
  const match=/^blockchain\/accounts\/([^/]+)(?:\/methods\/(state|funding_mask|get_wallet_data))?$/.exec(path);
  if(!match)throw Error('testnet_unavailable');
  const address=rawAddress(decodeURIComponent(match[1])),method=match[2];
  async function account(){
   const r=await fetch('https://testnet.toncenter.com/api/v2/getAddressInformation?'+new URLSearchParams({address}),{redirect:'error',signal:AbortSignal.timeout(8000)});
   if(!r.ok)throw Error('testnet_unavailable');
   const d=await r.json();if(!d.ok||!d.result||!/^\d+$/.test(String(d.result.balance))||!['active','uninitialized','frozen'].includes(d.result.state))throw Error('testnet_unavailable');
   return{status:d.result.state==='uninitialized'?'uninit':d.result.state,balance:String(d.result.balance)};
  }
  if(!method)return account();
  const r=await fetch('https://testnet.toncenter.com/api/v2/runGetMethod',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({address,method,stack:[]}),signal:AbortSignal.timeout(8000)});
  const d=await r.json();
  if(!r.ok||!d.ok||d.result?.exit_code!==0){
   // Only a separately confirmed inactive account can mean "not deployed".
   await wait();const a=await account();if(a.status==='uninit')return null;throw Error('testnet_unavailable');
  }
  const values=d.result.stack;if(!Array.isArray(values))throw Error('testnet_unavailable');
  const num=(i:number)=>{if(values[i]?.[0]!=='num')throw Error('testnet_unavailable');return BigInt(values[i][1]);};
  const stack=values.map((x:any)=>x[0]==='num'?{num:x[1]}:{});
  if(method!=='get_wallet_data')return{success:true,stack};
  const owner=(i:number)=>{if(!['cell','slice'].includes(values[i]?.[0])||typeof values[i]?.[1]?.bytes!=='string')throw Error('testnet_unavailable');return Cell.fromBase64(values[i][1].bytes).beginParse().loadAddress().toRawString();};
  return{success:true,stack,decoded:{balance:String(num(0)),owner:owner(1),jetton:owner(2)}};
 }
 return{async get(path:string){
  if(!fallback){try{
   const r=await fetch('https://testnet.tonapi.io/v2/'+path,{redirect:'error',signal:AbortSignal.timeout(8000)});
   if(r.status===404)return null;
   if(r.ok){const data=await r.json();if(!path.includes('/methods/')&&(!['active','uninit','nonexist','frozen'].includes(data.status)||!/^\d+$/.test(String(data.balance))))throw Error('testnet_unavailable');return data;}
  }catch{/* Retry read-only through a different fixed provider, once per check. */}
  fallback=true;}
  try{return await center(path);}catch{throw Error('testnet_unavailable');}
 }};
}
export async function batchStatus(input:BatchInput,rpc:Rpc=testnetRpc(),pace:()=>Promise<void>=()=>new Promise(r=>setTimeout(r,1100))){
 const c=await batchContext(input);
 async function method(address:string,name:string){
  await pace();const r=await rpc.get('blockchain/accounts/'+encodeURIComponent(address)+'/methods/'+name);
  if(!r)return null;if(!r.success)throw Error('testnet_unavailable');return r;
 }
 await pace();const payerAccount=await rpc.get('blockchain/accounts/'+encodeURIComponent(c.tokenWallet(c.payer).toRawString()));
 if(payerAccount?.status==='frozen')throw Error('testnet_unavailable');
 const payer=payerAccount?.status==='active'?await method(c.tokenWallet(c.payer).toRawString(),'get_wallet_data'):null;
 const payerBalance=payer?.decoded?.balance;
 if(payer&&(!/^\d+$/.test(String(payerBalance))||payer.decoded.owner!==c.payer.toRawString()||payer.decoded.jetton!==c.master.address.toRawString()))throw Error('testnet_state_mismatch');
 await pace();const account=await rpc.get('blockchain/accounts/'+encodeURIComponent(c.task.address.toRawString()));
 if(account?.status==='frozen')throw Error('testnet_unavailable');
 if(!account||account.status!=='active')return{checked_at:Date.now(),deployed:false,state:null,mask:0,payer_balance:String(payerBalance||'0'),native_nano:'0',shares:[]};
 // Derivation binds code and all immutable recipients; no caller-supplied contract endpoint.
 const state=await method(c.task.address.toRawString(),'state'),mask=await method(c.task.address.toRawString(),'funding_mask');
 const number=(r:any)=>{try{return Number(BigInt(r.stack[0].num));}catch{throw Error('testnet_unavailable');}};
 const phase=number(state),ready=number(mask);
 if(![0,1,2].includes(phase)||!Number.isInteger(ready)||ready<0||ready>7)throw Error('testnet_state_mismatch');
 const shares=[];
 for(let i=0;i<3;i++){
  const s=await method(c.shares[i].address.toRawString(),'state');
  const tokens=await method(c.tokenWallet(c.shares[i].address).toRawString(),'get_wallet_data');
  let balance='0';
  if(tokens){
   balance=String(tokens.decoded?.balance);
   if(!/^\d+$/.test(balance)||tokens.decoded?.owner!==c.shares[i].address.toRawString()||tokens.decoded?.jetton!==c.master.address.toRawString())throw Error('testnet_state_mismatch');
  }
  await pace();const native=await rpc.get('blockchain/accounts/'+encodeURIComponent(c.shares[i].address.toRawString()));
  if(native?.status==='frozen')throw Error('testnet_unavailable');
  shares.push({role:i,state:s?number(s):null,native_nano:String(native?.balance||'0'),balance_nano:balance,missing_nano:String(c.amounts[i]>BigInt(balance)?c.amounts[i]-BigInt(balance):0n)});
 }
 return{checked_at:Date.now(),deployed:true,state:phase,mask:ready,payer_balance:String(payerBalance||'0'),native_nano:String(account.balance||'0'),shares};
}
