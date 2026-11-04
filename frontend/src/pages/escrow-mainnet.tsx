import {useEffect,useState} from 'react';
import type {GetStaticProps} from 'next';
import Head from 'next/head';
import {useRouter} from 'next/router';
import {useTranslation} from 'next-i18next';
import {TonConnectUIProvider,useTonConnectUI,useTonWallet} from '@tonconnect/ui-react';
import TonConnect,{UserRejectsError} from '@tonconnect/sdk';
import {Address} from '@ton/core';
import {getCommonStaticProps} from '../lib/i18n-static-props';
import {createMainnetEscrowConnector} from '../lib/escrowConnector';
import {mainnetEscrowStoragePrefix as prefix,readEscrowPending,withEscrowOperation,type PendingEscrowOperation} from '../lib/escrowOperations';
import {hasExpectedEscrowState,isSettledEscrow} from '../lib/escrowObservation';
import {isEscrowRequestValidationError,escrowWalletErrorCode} from '../lib/escrowWalletErrors';
import type {BatchAction} from '../lib/batchEscrow';
const canonical=(value:string)=>{try{return Address.parse(value).toRawString();}catch{return'';}};
const amount=(s:string)=>{try{const n=BigInt(s);return String(n/1000000000n)+'.'+String(n%1000000000n).padStart(9,'0');}catch{return'—';}};
const newId=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(n=>n.toString(16).padStart(2,'0')).join('');
export default function MainnetEscrowPage(){
 const {t,i18n}=useTranslation('common'),[connector,setConnector]=useState<TonConnect|null>(null);
 useEffect(()=>{setConnector(createMainnetEscrowConnector(location.origin,localStorage));},[]);
 return <><Head><title>{t('escrow_mainnet.title')} · GSTD</title></Head>{connector?<TonConnectUIProvider connector={connector} widgetRootId="tc-mainnet-escrow-widget-root" language={i18n.language.startsWith('ru')?'ru':'en'} walletsRequiredFeatures={{sendTransaction:{minMessages:4}}}><MainnetPanel expected={connector}/></TonConnectUIProvider>:<p className="p-10 text-white">{t('escrow_mainnet.loading')}</p>}</>;
}
function MainnetPanel({expected}:{expected:TonConnect}){
 const {t}=useTranslation('common'),p=(key:string)=>t('escrow_mainnet.'+key),router=useRouter();
 const wallet=useTonWallet(),[ton]=useTonConnectUI(),address=canonical(wallet?.account.address||''),correct=wallet?.account.chain==='-239',isolated=ton.connector===expected;
 const canSignText=!!wallet?.device.features.some(feature=>typeof feature==='object'&&feature.name==='SignData'&&feature.types.includes('text'));
 const [walletAuth,setWalletAuth]=useState<any>(null);
 const walletAuthorized=walletAuth?.wallet===address&&walletAuth?.valid_until>Date.now();
 const [preflight,setPreflight]=useState<any>(null);
 const [catalog,setCatalog]=useState<any>(null),[selected,setSelected]=useState(''),[prompt,setPrompt]=useState(''),[maxTokens,setMaxTokens]=useState(128),[consent,setConsent]=useState(false);
 const [draft,setDraft]=useState<any>(null),[chain,setChain]=useState<any>(null),[pending,setPending]=useState<PendingEscrowOperation|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[now,setNow]=useState(Date.now());
 const input=draft?.input,plan=draft?.preview,job=draft?.job,offers=catalog?.offers||[];
 const key=(offer:any)=>offer.node_id+'|'+offer.model,offer=offers.find((o:any)=>key(o)===selected);
 async function api(action:string,extra:any={},current=draft){
  const r=await fetch('/api/v1/finance/mainnet-escrow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({network:'-239',action,input:current?.input,access_token:current?.access_token,wallet_token:walletAuth?.wallet===address?walletAuth.wallet_token:undefined,actor:address,...extra})});
  const d=await r.json();if(!r.ok)throw Error(d.error||'mainnet_unavailable');return d;
 }
 async function work(fn:()=>Promise<void>){setNow(Date.now());setBusy(true);setNotice('');try{await fn();}catch(e:any){setNotice(t('escrow_mainnet.errors.'+e.message,{defaultValue:p('errors.mainnet_unavailable')}));}finally{setBusy(false);}}
 function save(value:any){localStorage.setItem(prefix+'draft',JSON.stringify(value));setDraft(value);}
 async function authorizeWallet(){
  if(!correct||!isolated||!canSignText)throw Error('wrong_network');
  const challenge=await api('wallet-challenge'),authorization=await ton.signData({type:'text',text:challenge.text,network:'-239',from:address});
  const current=ton.account;if(current?.chain!=='-239'||canonical(current.address)!==address)throw Error('wrong_network');
  const auth=await api('wallet-auth',{nonce:challenge.nonce,authorization,stateInit:current.walletStateInit});
  localStorage.setItem(prefix+'wallet-auth:'+address,JSON.stringify(auth));setWalletAuth(auth);setNotice(p('wallet_authorized'));
 }
 useEffect(()=>{if(!address){setWalletAuth(null);return;}try{const raw=localStorage.getItem(prefix+'wallet-auth:'+address);setWalletAuth(raw?JSON.parse(raw):null);}catch{setWalletAuth(null);}},[address]);
 async function loadCatalog(){setCatalog(await api('catalog'));}
 useEffect(()=>{let active=true;fetch('/api/v1/finance/mainnet-escrow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({network:'-239',action:'catalog'})}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>{if(active)setCatalog(d);}).catch(()=>{if(active)setNotice(t('escrow_mainnet.errors.mainnet_unavailable'));});return()=>{active=false;};},[t]);
 useEffect(()=>{if(!input?.deadline)return;const timer=setTimeout(()=>setNow(Date.now()),Math.max(0,input.deadline*1000-Date.now()+1000));return()=>clearTimeout(timer);},[input?.deadline]);
 async function restore(value:any){
  if(value?.network!=='-239'||!value.input||value.input.network!=='-239')throw Error('wrong_network');
  const d=await api('preview',{},value);
  if(value.preview&&value.preview.task!==d.preview.task)throw Error('invalid_mainnet_job');
  if(typeof value.prompt==='string'&&value.input.execution){
   const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value.prompt)),hash=Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,'0')).join('');
   if(hash!==value.input.execution.prompt_hash)throw Error('invalid_mainnet_job');
  }
  save({...value,preview:d.preview});setChain(null);setPending(readEscrowPending(localStorage,d.preview.task,'-239'));setPrompt(value.prompt||'');setNotice(p('restored'));
 }
 async function prepare(){
  if(!correct||!isolated||!offer||!consent||!canSignText||!walletAuthorized)throw Error('state_not_ready');
  if(plan&&!isSettledEscrow(chain))throw Error('state_not_ready');
  const d=await api('prepare',{payer:address,node_id:offer.node_id,model:offer.model,prompt,max_tokens:maxTokens,consent,wallet_state_init:wallet?.account.walletStateInit});
  const previous=localStorage.getItem(prefix+'draft');if(previous)localStorage.setItem(prefix+'archive:'+Date.now(),previous);
  save({network:'-239',input:d.input,preview:d.preview,access_token:d.access_token,job:d.job,prompt});setChain(null);setPending(null);setNotice(p('prepared'));
 }
 async function refresh(){
  const d=await api('status');setChain(d.status);if(d.job)save({...draft,job:d.job});
  if(pending&&hasExpectedEscrowState(pending,d.status))await withEscrowOperation(localStorage,navigator.locks,plan.task,async op=>{if(op.clear(pending.id)){setPending(null);setNotice(p('confirmed'));}else setPending(op.current());},'-239');
 }
 async function execute(){
  if(!correct||!isolated||address!==input?.payer)throw Error('wrong_network');
  const challenge=await api('challenge');if(challenge.job){save({...draft,job:challenge.job});return;}
  const authorization=await ton.signData({type:'text',text:challenge.text,network:'-239',from:address});
  const current=ton.account;if(current?.chain!=='-239'||canonical(current.address)!==address)throw Error('wrong_network');
  const d=await api('execute',{nonce:challenge.nonce,authorization,stateInit:current.walletStateInit});save({...draft,job:d.job});setNotice(p('queued'));
 }
 async function send(action:BatchAction,role=0){
  if(!correct||!isolated)throw Error('wrong_network');
  await withEscrowOperation(localStorage,navigator.locks,plan.task,async op=>{
   if(pending||op.current())throw Error('operation_pending');
   const d=await api(action,{role}),current=ton.account;
   if(current?.chain!=='-239'||canonical(current.address)!==d.transaction.from||d.transaction.network!=='-239'||d.preview.task!==plan.task)throw Error('wrong_network');
   const snapshot:PendingEscrowOperation={id:newId(),task:plan.task,action,role,since:Date.now(),validUntil:d.transaction.validUntil,requestSent:false,signed:false,payer:chain?.payer_balance||'0',total:String((chain?.shares||[]).reduce((n:bigint,s:any)=>n+BigInt(s.balance_nano),0n)),balance:chain?.shares?.[role]?.balance_nano||'0',native:String(BigInt(chain?.native_nano||'0')+(chain?.shares||[]).reduce((n:bigint,s:any)=>n+BigInt(s.native_nano),0n))};
   op.begin(snapshot);setPending(snapshot);
   try{await ton.sendTransaction(d.transaction,{onRequestSent:()=>{try{setPending(op.annotate(snapshot.id,{requestSent:true}));}catch{/* Original pending record stays authoritative. */}}});setPending(op.annotate(snapshot.id,{signed:true}));setNotice(p('submitted'));}
   catch(e:any){if(e instanceof UserRejectsError||isEscrowRequestValidationError(e)){if(op.clear(snapshot.id))setPending(null);setNotice(p(e instanceof UserRejectsError?'rejected':'invalid_request'));}else{try{setPending(op.annotate(snapshot.id,{failureCode:escrowWalletErrorCode(e)}));}catch{/* Never clear an uncertain operation. */}setNotice(p('uncertain'));}}
  },'-239');
 }
 function download(privateData:boolean){
  const paymentInput={...input};delete paymentInput.execution;
  const value=privateData?{...draft,chain,pending}:{network:'-239',input:paymentInput,preview:plan};
  const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=privateData?'gstd-mainnet-private-recovery.json':'gstd-mainnet-payment-details.json';a.click();URL.revokeObjectURL(url);
 }
 const button='rounded-lg bg-violet-600 px-4 py-2 disabled:opacity-40',field='w-full rounded border border-white/20 bg-black/30 px-3 py-2';
 const blocked=busy||!!pending||!correct||!isolated||!walletAuthorized||!catalog?.rpc_configured,payer=address===input?.payer,pilotAllowed=catalog?.manifest?.pilotPayers?.includes(address);
 const state=isSettledEscrow(chain)?chain.state===2?'refunded':'paid':chain?.state===1?'accepted':input&&now>input.deadline*1000?'expired':job?.state||'prepared';
 if(!isolated)return <main className="p-10 text-white"><p>{p('errors.reload_required')}</p><a href={router.asPath}>{p('reload')}</a></main>;
 return <main className="mx-auto max-w-4xl px-5 py-10 text-white space-y-5">
  <header className="space-y-3"><a className="underline" href={(router.locale==='ru'?'/ru':'')+'/payments'}>{p('back')}</a><h1 className="text-3xl">{p('title')}</h1><p className="rounded border border-amber-500 p-4">{p('real_funds')}</p><p>{p('pilot')}</p><p>{p('manual_acceptance')}</p></header>
  <section className="rounded-xl border border-white/15 p-5 space-y-3"><h2>{p('wallet')}</h2><code className="block break-all">{address||p('not_connected')}</code><p>{wallet?(correct?p('mainnet'):p('wrong_network')):p('connect_hint')}</p>
   <button className={button} disabled={busy} onClick={()=>work(async()=>{if(wallet)await ton.disconnect();else await ton.openModal();})}>{p(wallet?'disconnect':'connect')}</button><button className={button+' ml-3'} disabled={busy||!correct||!canSignText||walletAuthorized} onClick={()=>work(authorizeWallet)}>{p(walletAuthorized?'wallet_authorized':'authorize_wallet')}</button>{wallet&&correct&&!canSignText&&<p role="alert">{p('unsupported_wallet')}</p>}
   <button className={button+' ml-3'} disabled={busy||!!pending} onClick={()=>work(async()=>{const value=localStorage.getItem(prefix+'draft');if(value)await restore(JSON.parse(value));})}>{p('restore')}</button>
   <label className="block">{p('import')}<input className="block" type="file" accept="application/json" disabled={busy||!!pending} onChange={e=>{const file=e.target.files?.[0];if(file)work(async()=>{if(file.size>100000)throw Error('invalid_mainnet_job');await restore(JSON.parse(await file.text()));});}}/></label>
  </section>
  <section className="rounded-xl border border-white/15 p-5 space-y-3"><h2>{p('request')}</h2><button className={button} disabled={busy} onClick={()=>work(loadCatalog)}>{p('refresh_catalog')}</button>
   <p>{p(catalog?.rpc_configured?'rpc_ready':'rpc_missing')}</p><button className={button} disabled={busy||!walletAuthorized||!catalog?.rpc_configured} onClick={()=>work(async()=>{const d=await api('preflight');setPreflight(d.preflight);})}>{p('preflight')}</button>{preflight&&<p>{p('operator_balance')}: {amount(preflight.operator_gstd_nano)} GSTD · {amount(preflight.operator_ton_nano)} TON</p>}{correct&&!pilotAllowed&&!draft&&<p role="alert">{p('pilot_wallet')} <code className="break-all">{catalog?.manifest?.pilotPayers?.join(', ')}</code></p>}
   <label className="block">{p('model')}<select className={field} value={selected} disabled={busy||!!draft} onChange={e=>setSelected(e.target.value)}><option value="">{p('choose_model')}</option>{offers.map((o:any)=><option key={key(o)} value={key(o)}>{o.model} · {o.price} GSTD · {o.node_id.slice(0,12)}</option>)}</select></label>
   {!offers.length&&<p>{p('no_models')}</p>}
   <label className="block">{p('prompt')}<textarea className={field} rows={5} maxLength={4000} value={prompt} disabled={busy||!!draft} onChange={e=>setPrompt(e.target.value)}/></label>
   <label className="block">{p('max_tokens')}<input className={field} type="number" min={1} max={512} value={maxTokens} disabled={busy||!!draft} onChange={e=>setMaxTokens(Number(e.target.value))}/></label>
   <label className="flex gap-3"><input type="checkbox" checked={consent} disabled={busy||!!draft} onChange={e=>setConsent(e.target.checked)}/>{p('consent')}</label>
   <button className={button} disabled={busy||!!pending||!correct||!pilotAllowed||!walletAuthorized||!canSignText||!offer||!consent||!prompt.trim()||!!draft} onClick={()=>work(prepare)}>{p('prepare')}</button>
   {draft&&isSettledEscrow(chain)&&<button className={button+' ml-3'} disabled={busy||!!pending} onClick={()=>work(async()=>{localStorage.setItem(prefix+'archive:'+Date.now(),JSON.stringify(draft));setDraft(null);setChain(null);setPrompt('');setConsent(false);setNotice(p('new_request'));})}>{p('new_request')}</button>}
  </section>
  {notice&&<p role="status" className="text-amber-200">{notice}</p>}
  {pending&&<p role="alert" className="rounded border border-amber-500 p-4">{p('pending')} {p(pending.signed?'signed':pending.requestSent?'delivered':'not_confirmed')}</p>}
  {draft&&<><section className="rounded-xl border border-white/15 p-5 space-y-3"><h2>{p('review')}</h2><p>{p('state')}: {p('state_'+state)}</p><p>{p('model')}: {input.execution?.model||p('private_details')}</p><p>{p('node')}: <code>{input.execution?.node_id||p('private_details')}</code></p><p>{p('budget')}: {input.budget} GSTD</p><p>{p('deadline')}: {new Date(input.deadline*1000).toLocaleString()}</p><code className="block break-all">{plan.task}</code><p>{p('master')}: <code className="break-all">{plan.master}</code></p><p>{p('gas')}</p><p>{p('privacy')}</p>
   <button className={button} onClick={()=>download(true)}>{p('private_export')}</button><button className={button+' ml-3'} onClick={()=>download(false)}>{p('public_export')}</button>
   {plan.shares.map((s:any)=><div key={s.role} className="rounded border border-white/10 p-3"><b>{p('role_'+s.role)} · {amount(s.amount_nano)} GSTD</b><code className="block break-all">{s.owner}</code></div>)}
  </section>
  <section className="rounded-xl border border-white/15 p-5 space-y-3"><h2>{p('actions')}</h2><div className="flex flex-wrap gap-3">
   <button className={button} disabled={busy||!walletAuthorized||!catalog?.rpc_configured} onClick={()=>work(refresh)}>{p('check')}</button>
   <button className={button} disabled={blocked||!payer||!chain||chain.deployed||BigInt(chain.payer_balance)<BigInt(plan.budget_nano)} onClick={()=>work(()=>send('deploy'))}>{p('deploy')} · 0.40 TON</button>
   <button className={button} disabled={blocked||!payer||chain?.state!==0||chain?.mask===7||now+300000>=input.deadline*1000||BigInt(chain?.payer_balance||'0')<(chain?.shares||[]).reduce((n:bigint,s:any)=>n+BigInt(s.missing_nano),0n)} onClick={()=>work(()=>send('fund'))}>{p('fund')} · ≤0.30 TON</button>
   <button className={button} disabled={blocked||!payer||chain?.state!==0||chain?.mask!==7||job?.state!=='prepared'||!draft.access_token||now+300000>=input.deadline*1000} onClick={()=>work(execute)}>{p('run')}</button>
   <button className={button} disabled={busy||!draft.access_token} onClick={()=>work(async()=>{const d=await api('job-status');save({...draft,job:d.job});})}>{p('result')}</button>
   <button className={button} disabled={blocked||!payer||chain?.state!==0||chain?.mask!==7||job?.state!=='computed'||now>=input.deadline*1000} onClick={()=>work(()=>send('accept'))}>{p('accept')} · 0.30 TON</button>
   <button className={button} disabled={blocked||!payer||chain?.state!==0||now<=input.deadline*1000} onClick={()=>work(()=>send('expire'))}>{p('expire')} · 0.30 TON</button>
   <button className={button} disabled={blocked||!payer||chain?.state!==2||!chain?.shares?.some((s:any)=>BigInt(s.balance_nano)>0n)} onClick={()=>work(()=>send('refund'))}>{p('refund')} · ≤0.24 TON</button>
  </div><p>{p('check_limits')}</p>{chain&&payer&&(chain.state===0||!chain.deployed)&&BigInt(chain.payer_balance)<(chain.deployed?chain.shares.reduce((n:bigint,s:any)=>n+BigInt(s.missing_nano),0n):BigInt(plan.budget_nano))&&<p role="alert">{p('errors.insufficient_gstd')} {p('available')}: {amount(chain.payer_balance)} GSTD</p>}
   {job?.receipt&&<div className="space-y-2"><h3>{p('answer')}</h3><pre className="whitespace-pre-wrap break-words rounded bg-black/30 p-3">{job.receipt.result}</pre><p>{job.receipt.latency_ms} ms</p><code className="block break-all">{job.receipt.result_hash}</code><p>{p('no_ledger')}</p></div>}
  </section>
  {plan.shares.map((s:any)=><section key={s.role} className="rounded-xl border border-white/15 p-5 space-y-3"><h2>{p('role_'+s.role)}</h2><p>{p('onchain')}: {amount(chain?.shares?.[s.role]?.balance_nano||'0')} GSTD</p><button className={button} disabled={blocked||address!==s.owner||chain?.state!==1||chain?.shares?.[s.role]?.state!==1||BigInt(chain?.shares?.[s.role]?.balance_nano||'0')<=0n} onClick={()=>work(()=>send('withdraw',s.role))}>{p('withdraw')} · 0.08 TON</button></section>)}
  <details className="rounded-xl border border-white/15 p-5 space-y-3"><summary>{p('recovery')}</summary><p>{p('recovery_hint')}</p><button className={button} disabled={blocked||!payer||!chain?.deployed} onClick={()=>work(()=>send('sync'))}>{p('sync')} · 0.30 TON</button><button className={button+' ml-3'} disabled={blocked||!payer||!chain?.deployed||BigInt(chain?.native_nano||'0')+(chain?.shares||[]).reduce((n:bigint,s:any)=>n+BigInt(s.native_nano),0n)<=100000000n} onClick={()=>work(()=>send('reclaim'))}>{p('reclaim')} · 0.12 TON</button></details>
  </>}
 </main>;
}
export const getStaticProps:GetStaticProps=async({locale})=>({props:await getCommonStaticProps(locale)});
