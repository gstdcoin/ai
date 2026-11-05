import {randomUUID} from 'node:crypto';
import {canonicalModelId} from './modelId';
import {Address} from '@ton/core';
import {kvGet,kvMGet,kvSet} from './kv';
import {isFreeModel} from './modelPricing';
import {getActiveNodes} from './nodes';
import {executorPayout} from './nodePayout';
import {MoneyError,digest,nano,units,walletId,AgentGrant} from './money';
import {GSTD_PURCHASE} from './gstdPurchase';
export type NodeOffer={nodeId:string;model:string;wallet:string;netUsdMicro:string;maxTokens:number;maxInputBytes:number;active:boolean;revision:string;updatedAt:number};
export const offerKey=(nodeId:string,model:string)=>'economics:offer:v1:'+digest([nodeId,canonicalModelId(model)]);
const requestHash=(model:string,messages:unknown,maxTokens:number)=>digest({model,messages,maxTokens});
export function usdMicro(value:unknown):bigint{
 if(typeof value!=='string'||!/^(0|[1-9]\d{0,3})(\.\d{1,6})?$/.test(value))throw new MoneyError('invalid_usd_amount');
 const [w,f='']=value.split('.');return BigInt(w)*1000000n+BigInt(f.padEnd(6,'0'));
}
export const usdUnits=(n:bigint|string)=>{const v=BigInt(n);return String(v/1000000n)+'.'+String(v%1000000n).padStart(6,'0');};
const ceil=(a:bigint,b:bigint)=>(a+b-1n)/b;
/** Exact conversion; a price string is never parsed through floating-point arithmetic. */
export function usdToGstd(usd:bigint,price:string):bigint{
 if(!/^(0|[1-9]\d{0,9})(\.\d{1,30})?$/.test(price))throw new MoneyError('market_price_unavailable');
 const [w,f='']=price.split('.'),den=10n**BigInt(f.length),num=BigInt(w)*den+BigInt(f||'0');
 if(num<=0n)throw new MoneyError('market_price_unavailable');
 const value=ceil(usd*1000000000n*den,1000000n*num);
 if(value<=0n||value>nano('1000000000'))throw new MoneyError('quote_amount_out_of_range');
 return value;
}
export function gstdToUsdMicro(amount:bigint,price:string):bigint{
 usdToGstd(1n,price);const [w,f='']=price.split('.'),den=10n**BigInt(f.length),num=BigInt(w)*den+BigInt(f||'0');
 return ceil(amount*num*1000000n,1000000000n*den);
}
export function validateQuotedWork(model:unknown,messages:unknown,maxTokens:unknown){
 if(typeof model!=='string'||model==='auto'||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(model)||
 !Number.isSafeInteger(maxTokens)||Number(maxTokens)<1||Number(maxTokens)>16384||
 !Array.isArray(messages)||!messages.length||messages.length>200||
 messages.some(m=>!m||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string'||Object.keys(m).some(k=>!['role','content'].includes(k))))throw new MoneyError('invalid_quote_request');
 const bytes=messages.reduce((sum,m)=>sum+Buffer.byteLength(m.content),0);
 if(bytes<1||bytes>262144)throw new MoneyError('invalid_quote_request');
 return {model,messages:messages as {role:string;content:string}[],maxTokens:Number(maxTokens),bytes};
}
export async function saveNodeOffer(wallet:string,input:unknown):Promise<NodeOffer>{
 const b=input as Record<string,unknown>;wallet=walletId(wallet);
 if(!b||Object.keys(b).some(k=>!['node_id','model','net_usd','max_tokens','max_input_bytes','active'].includes(k))||
 typeof b.node_id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(b.node_id)||
 typeof b.model!=='string'||b.model==='auto'||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(b.model)||
 !Number.isSafeInteger(b.max_tokens)||Number(b.max_tokens)<1||Number(b.max_tokens)>16384||
 !Number.isSafeInteger(b.max_input_bytes)||Number(b.max_input_bytes)<1||Number(b.max_input_bytes)>262144||
 typeof b.active!=='boolean')throw new MoneyError('invalid_node_offer');
 if(isFreeModel(b.model as string))throw new MoneyError('free_model_has_no_paid_offer');
 const price=usdMicro(b.net_usd);if(price<1n||price>1000000000n)throw new MoneyError('invalid_usd_amount');
 const raw=await kvGet('node:'+b.node_id);if(!raw)throw new MoneyError('node_not_found');
 const node=JSON.parse(raw),payout=await executorPayout(b.node_id,String(node.wallet_address||''));
 if(wallet!==payout)throw new MoneyError('node_payout_owner_required');
 if(!Array.isArray(node.capabilities)||!node.capabilities.some((m:unknown)=>typeof m==='string'&&canonicalModelId(m)===canonicalModelId(b.model as string)))throw new MoneyError('model_not_advertised');
 const offer:NodeOffer={nodeId:b.node_id,model:b.model,wallet,netUsdMicro:String(price),maxTokens:Number(b.max_tokens),
 maxInputBytes:Number(b.max_input_bytes),active:b.active,revision:randomUUID(),updatedAt:Date.now()};
 await kvSet(offerKey(offer.nodeId,offer.model),JSON.stringify(offer));return offer;
}
export async function nodeOffer(nodeId:string,model:string):Promise<NodeOffer|null>{
 const raw=await kvGet(offerKey(nodeId,model));return raw?JSON.parse(raw):null;
}
export async function currentMarketPrice():Promise<{price:string;observedAt:number;source:string}>{
 const key='economics:market:v1',raw=await kvGet(key);
 if(raw){const v=JSON.parse(raw);if(v.observedAt<=Date.now()&&Date.now()-v.observedAt<60000){usdToGstd(1n,v.price);return v;}}
 const url='https://api.ston.fi/v1/assets/'+GSTD_PURCHASE.friendlyMaster;
 const r=await fetch(url,{signal:AbortSignal.timeout(5000)});if(!r.ok)throw new MoneyError('market_price_unavailable');
 const asset=(await r.json()).asset;
 if(!asset||Address.parse(asset.contract_address).toRawString()!==GSTD_PURCHASE.master||
 asset.blacklisted||asset.deprecated||asset.decimals!==9)throw new MoneyError('market_price_unavailable');
 const price=asset.dex_price_usd||asset.dex_usd_price;usdToGstd(1n,price);
 const value={price,observedAt:Date.now(),source:url};await kvSet(key,JSON.stringify(value),60);return value;
}
export type WorkQuote={id:string;wallet:string;grantId:string|null;model:string;nodeId:string;executor:string;requestHash:string;
 amountNano:string;grossUsdMicro:string;netUsdMicro:string;priceUsd:string;marketObservedAt:number;expiresAt:number;offerRevision:string};
export async function createWorkQuote(wallet:string,model:string,messages:{role:string;content:string}[],maxTokens:number,grant?:AgentGrant){
 wallet=walletId(wallet);const work=validateQuotedWork(model,messages,maxTokens);
 if(grant&&(grant.wallet!==wallet||grant.revokedAt||grant.expiresAt<=Date.now()||!grant.models.includes(model)||maxTokens>grant.maxTokens))throw new MoneyError('grant_scope_denied');
 const candidates=(await getActiveNodes(model)).slice(0,10),rawOffers=candidates.length?await kvMGet(candidates.map(n=>offerKey(n.nodeId,model))):[];
 const offers:{offer:NodeOffer;executor:string}[]=[];
 for(let i=0;i<candidates.length;i++){
  const offer:NodeOffer|null=rawOffers[i]?JSON.parse(rawOffers[i]!):null;
  if(!offer?.active||canonicalModelId(offer.model)!==canonicalModelId(model)||offer.nodeId!==candidates[i].nodeId||work.bytes>offer.maxInputBytes||maxTokens>offer.maxTokens)continue;
  const record=JSON.parse(await kvGet('node:'+offer.nodeId)||'{}');
  let executor:string;try{executor=await executorPayout(offer.nodeId,String(record.wallet_address||''));}catch{continue;}
  if(executor!==offer.wallet||grant&&!grant.executors.some(e=>e.nodeId===offer.nodeId&&e.wallet===executor))continue;
  offers.push({offer,executor});
 }
 offers.sort((a,b)=>BigInt(a.offer.netUsdMicro)<BigInt(b.offer.netUsdMicro)?-1:BigInt(a.offer.netUsdMicro)>BigInt(b.offer.netUsdMicro)?1:0);
 if(!offers.length)throw new MoneyError('no_priced_executor');
 const selected=offers[0],market=await currentMarketPrice();
 // Gross up the operator's requested net payment; integer rounding cannot underpay its 85% share.
 const gross=ceil(BigInt(selected.offer.netUsdMicro)*100n,85n),amount=usdToGstd(gross,market.price);
 if(amount*85n/100n<usdToGstd(BigInt(selected.offer.netUsdMicro),market.price))throw new MoneyError('quote_precision_insufficient');
 if(grant&&(amount>BigInt(grant.perRequestNano)||amount+BigInt(grant.spentNano)+BigInt(grant.reservedNano)>BigInt(grant.budgetNano)))throw new MoneyError('price_exceeds_permission');
 const quote:WorkQuote={id:randomUUID(),wallet,grantId:grant?.id||null,model,nodeId:selected.offer.nodeId,executor:selected.executor,
 requestHash:requestHash(model,messages,maxTokens),amountNano:String(amount),grossUsdMicro:String(gstdToUsdMicro(amount,market.price)),netUsdMicro:selected.offer.netUsdMicro,
 priceUsd:market.price,marketObservedAt:market.observedAt,expiresAt:Date.now()+90000,offerRevision:selected.offer.revision};
 await kvSet('economics:quote:v1:'+quote.id,JSON.stringify(quote),180);
 return{...quote,price_gstd:units(amount),price_usd:usdUnits(quote.grossUsdMicro),operator_net_usd:usdUnits(selected.offer.netUsdMicro),
 pricing:'fixed_request_with_capacity_limits',max_tokens:maxTokens,input_bytes:work.bytes,automatic_acceptance:!!grant,
 note:'USD is a pricing reference, not a stablecoin payout. GSTD value can change after payment. Quote does not reserve funds or prove model quality.'};
}
export async function requireWorkQuote(value:unknown,wallet:string,model:string,messages:unknown,maxTokens:number,grantId?:string){
 if(typeof value!=='string'||!/^[a-f0-9-]{36}$/.test(value))throw new MoneyError('price_quote_required');
 const raw=await kvGet('economics:quote:v1:'+value),q:WorkQuote|null=raw?JSON.parse(raw):null;
 if(!q||q.expiresAt<=Date.now())throw new MoneyError('price_quote_expired');
 if(q.wallet!==walletId(wallet)||q.grantId!==(grantId||null)||q.model!==model||q.requestHash!==requestHash(model,messages,maxTokens))throw new MoneyError('price_quote_mismatch');
 return q;
}

/** Admission control for newly assigned model-specific ledger jobs; already assigned work keeps its contract. */
export async function checkQueuedOffer(task:Record<string,any>,nodeId:string,payout:string,amount:bigint,models:string[]){
 const payload=task.payload&&typeof task.payload==='object'?task.payload:{},model=payload.model||task.model;
 if(typeof model!=='string')return;
 if(model==='auto'){
  const raw=models.length?await kvMGet(models.slice(0,20).map(m=>offerKey(nodeId,m))):[];
  if(raw.some(v=>v&&JSON.parse(v).wallet===payout))throw new MoneyError('operator_exact_model_required');
  return;
 }
 const offer=await nodeOffer(nodeId,model);
 if(!offer||offer.wallet!==payout)return;
 if(!offer.active)throw new MoneyError('operator_offer_disabled');
 const budget=payload.max_tokens??task.max_tokens;
 const prompt=payload.prompt??payload.params?.prompt;
 const input=Array.isArray(payload.messages)?payload.messages.map((m:any)=>typeof m?.content==='string'?m.content:'').join(''):prompt;
 if(!Number.isSafeInteger(budget)||budget<1||budget>offer.maxTokens||typeof input!=='string'||Buffer.byteLength(input)>offer.maxInputBytes)
  throw new MoneyError('operator_work_limits');
 let minimum:bigint;
 try{minimum=usdToGstd(BigInt(offer.netUsdMicro),(await currentMarketPrice()).price);}catch{throw new MoneyError('operator_price_unavailable');}
 if(amount*85n/100n<minimum)throw new MoneyError('operator_price_floor');
}

export async function requiresWorkQuote(nodeId:string,model:string,models:string[],wallet:string){
 if(model!=='auto'){const offer=await nodeOffer(nodeId,model);if(offer?.wallet===wallet&&!offer.active)throw new MoneyError('operator_offer_disabled');return !!offer?.active&&offer.wallet===wallet;}
 const raw=models.length?await kvMGet(models.slice(0,20).map(m=>offerKey(nodeId,m))):[];
 return raw.some(v=>{if(!v)return false;const o=JSON.parse(v);return o.wallet===wallet;});
}
