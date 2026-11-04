import {Cell,beginCell,Address} from '@ton/core';
import {escrowRuntimeSecret} from './escrowRuntimeSecrets';
import {batchContext,rawAddress,type BatchInput} from './batchEscrow';
export type Rpc={get(path:string):Promise<any>;walletAddress?(master:string,owner:string):Promise<string>};
// Keep native receiver binding and bound the body read as well as response headers.
async function rpcFetch(url:string,options:RequestInit={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{const response=await globalThis.fetch(url,{...options,cache:'no-store',signal:controller.signal});
  const body=await response.text();return{status:response.status,ok:response.ok,json:async()=>JSON.parse(body)};
 }finally{clearTimeout(timer);}
}
// Fixed network-specific public hosts only. Select one fallback per status check, never broadcast.
export function testnetRpc():Rpc{return escrowRpc('-3');}
export function mainnetRpc():Rpc{return escrowRpc('-239');}
function escrowRpc(network:'-3'|'-239'):Rpc {
 if(network!=='-3'&&network!=='-239')throw Error('wrong_network');
 const testnet=network==='-3',unavailable=testnet?'testnet_unavailable':'mainnet_unavailable';
 const apiHost=testnet?'https://testnet.tonapi.io':'https://tonapi.io';
 const centerHost=testnet?'https://testnet.toncenter.com':'https://toncenter.com';
 const credential=(name:string)=>{const key=escrowRuntimeSecret(name);if(key&&(!/^[\x21-\x7e]+$/.test(key)||key.length>2048))throw Error(testnet?'testnet_credential_invalid':'mainnet_credential_invalid');return key;};
 const apiKey=credential(testnet?'ESCROW_TESTNET_TONAPI_KEY':'ESCROW_MAINNET_TONAPI_KEY'),centerKey=credential(testnet?'ESCROW_TESTNET_TONCENTER_API_KEY':'ESCROW_MAINNET_TONCENTER_API_KEY');
 const apiHeaders:Record<string,string>=apiKey?{Authorization:'Bearer '+apiKey}:{};
 const centerHeaders:Record<string,string>=centerKey?{'X-API-Key':centerKey}:{};
 // Prefer the independently keyed provider over an anonymous shared-IP request.
 let fallback=!!centerKey&&!apiKey,primary="not_attempted",secondary="not_attempted";
 // Public diagnostics contain only fixed categories, never raw provider messages/headers.
 const bucket=(e:any)=>{const m=String(e?.message||'');if(/redirect value/i.test(m))return'unsupported_redirect';if(/illegal invocation/i.test(m))return'illegal_invocation';if(/signal/i.test(m))return'signal';if(/cache/i.test(m))return'cache';if(/timeout|abort/i.test(m))return'timeout';if(/fetch/i.test(m))return'fetch';return['TypeError','Error','TimeoutError','AbortError'].includes(e?.name)?e.name:'failure';};
 const wait=()=>new Promise(r=>setTimeout(r,1100));
 async function center(path:string){
  const match=/^blockchain\/accounts\/([^/]+)(?:\/methods\/(state|funding_mask|get_wallet_data|get_jetton_data))?$/.exec(path);
  if(!match)throw Error(unavailable);
  const address=rawAddress(decodeURIComponent(match[1])),method=match[2];
  async function account(){
   const r=await rpcFetch(centerHost+'/api/v2/getAddressInformation?'+new URLSearchParams({address}),{redirect:'manual',headers:centerHeaders});
   secondary='http_'+r.status;if(!r.ok)throw Error(unavailable);
   const d=await r.json();secondary+=d.ok===true?"_ok":"_api_error";if(!d.ok||!d.result||!/^\d+$/.test(String(d.result.balance))||!['active','uninitialized','frozen'].includes(d.result.state))throw Error(unavailable);
   return{status:d.result.state==='uninitialized'?'uninit':d.result.state,balance:String(d.result.balance)};
  }
  if(!method)return account();
  const r=await rpcFetch(centerHost+'/api/v2/runGetMethod',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',...centerHeaders},
   body:JSON.stringify({address,method,stack:[]})});
  secondary="http_"+r.status;const d=await r.json();secondary+=d.ok===true?"_ok":"_api_error";
  if(!r.ok||!d.ok||d.result?.exit_code!==0){
   // Only a separately confirmed inactive account can mean "not deployed".
   await wait();const a=await account();if(a.status==='uninit')return null;throw Error(unavailable);
  }
  const values=d.result.stack;if(!Array.isArray(values))throw Error(unavailable);
  const num=(i:number)=>{if(values[i]?.[0]!=='num')throw Error(unavailable);return BigInt(values[i][1]);};
  const stack=values.map((x:any)=>x[0]==='num'?{num:x[1]}:{});
  if(method==='get_jetton_data'){if(values[4]?.[0]!=='cell'||typeof values[4]?.[1]?.bytes!=='string')throw Error(unavailable);return{success:true,stack,decoded:{jetton_wallet_code:values[4][1].bytes}};}
  if(method!=='get_wallet_data')return{success:true,stack};
  const owner=(i:number)=>{if(!['cell','slice'].includes(values[i]?.[0])||typeof values[i]?.[1]?.bytes!=='string')throw Error(unavailable);return Cell.fromBase64(values[i][1].bytes).beginParse().loadAddress().toRawString();};
  return{success:true,stack,decoded:{balance:String(num(0)),owner:owner(1),jetton:owner(2)}};
 }
 return{async walletAddress(master:string,owner:string){
  const address=rawAddress(master),recipient=Address.parse(rawAddress(owner));
  const r=await rpcFetch(centerHost+'/api/v2/runGetMethod',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',...centerHeaders},body:JSON.stringify({address,method:'get_wallet_address',stack:[['tvm.Slice',beginCell().storeAddress(recipient).endCell().toBoc().toString('base64')]]})});
  const d=await r.json(),entry=d.result?.stack?.[0];if(!r.ok||!d.ok||d.result?.exit_code!==0||!['cell','slice'].includes(entry?.[0])||typeof entry?.[1]?.bytes!=='string')throw Error(unavailable);
  return Cell.fromBase64(entry[1].bytes).beginParse().loadAddress().toRawString();
 },async get(path:string){
  if(!fallback){try{
   const r=await rpcFetch(apiHost+'/v2/'+path,{redirect:'manual',headers:apiHeaders});
   primary="http_"+r.status;if(r.status===404)return null;
   if(r.ok){const data=await r.json();if(!path.includes('/methods/')&&(!['active','uninit','nonexist','frozen'].includes(data.status)||!/^\d+$/.test(String(data.balance))))throw Error(unavailable);return data;}
  }catch(e){primary+="_"+bucket(e);}
  fallback=true;}
  try{return await center(path);}catch(e){throw Object.assign(Error(unavailable),{provider_diagnostic:'tonapi_'+primary+'_toncenter_'+secondary+'_'+bucket(e)});}
 }};
}
export async function batchStatus(input:BatchInput,rpc:Rpc=testnetRpc(),pace:()=>Promise<void>=()=>new Promise(r=>setTimeout(r,1100))){
 return readEscrowStatus(await batchContext(input),rpc,pace);
}
export interface EscrowStatusContext{payer:Address;master:{address:Address};task:{address:Address};shares:{address:Address}[];amounts:bigint[];tokenWallet:(owner:Address)=>Address}
export async function readEscrowStatus(c:EscrowStatusContext,rpc:Rpc,pace:()=>Promise<void>=()=>new Promise(r=>setTimeout(r,1100))){
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
