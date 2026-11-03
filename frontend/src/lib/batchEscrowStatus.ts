import {batchContext,type BatchInput} from './batchEscrow';
type Rpc={get(path:string):Promise<any>};
export function testnetRpc():Rpc {
 return{async get(path:string){
  const r=await fetch('https://testnet.tonapi.io/v2/'+path,{signal:AbortSignal.timeout(8000)});
  if(r.status===404)return null;if(!r.ok)throw Error('testnet_unavailable');return r.json();
 }};
}
export async function batchStatus(input:BatchInput,rpc:Rpc=testnetRpc(),pace:()=>Promise<void>=()=>new Promise(r=>setTimeout(r,1100))){
 const c=await batchContext(input);
 async function method(address:string,name:string){
  await pace();const r=await rpc.get('blockchain/accounts/'+encodeURIComponent(address)+'/methods/'+name);
  if(!r)return null;if(!r.success)throw Error('testnet_unavailable');return r;
 }
 await pace();const payerAccount=await rpc.get('blockchain/accounts/'+encodeURIComponent(c.tokenWallet(c.payer).toRawString()));
 const payer=payerAccount?.status==='active'?await method(c.tokenWallet(c.payer).toRawString(),'get_wallet_data'):null;
 const payerBalance=payer?.decoded?.balance;
 if(payer&&(!/^\d+$/.test(String(payerBalance))||payer.decoded.owner!==c.payer.toRawString()||payer.decoded.jetton!==c.master.address.toRawString()))throw Error('testnet_state_mismatch');
 await pace();const account=await rpc.get('blockchain/accounts/'+encodeURIComponent(c.task.address.toRawString()));
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
  shares.push({role:i,state:s?number(s):null,native_nano:String(native?.balance||'0'),balance_nano:balance,missing_nano:String(c.amounts[i]>BigInt(balance)?c.amounts[i]-BigInt(balance):0n)});
 }
 return{checked_at:Date.now(),deployed:true,state:phase,mask:ready,payer_balance:String(payerBalance||'0'),native_nano:String(account.balance||'0'),shares};
}
