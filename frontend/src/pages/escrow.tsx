import {useEffect,useState} from 'react';
import type {GetStaticProps} from 'next';
import Head from 'next/head';
import {useRouter} from 'next/router';
import {useTranslation} from 'next-i18next';
import {TonConnectUIProvider,useTonConnectUI,useTonWallet} from '@tonconnect/ui-react';
import TonConnect,{UserRejectsError} from '@tonconnect/sdk';
import {Address} from '@ton/core';
import {getCommonStaticProps} from '../lib/i18n-static-props';
import type {BatchInput,BatchAction} from '../lib/batchEscrow';
import {isEscrowRequestValidationError,escrowWalletErrorCode} from '../lib/escrowWalletErrors';
import {createEscrowConnector} from '../lib/escrowConnector';
import {hasExpectedEscrowState} from '../lib/escrowObservation';
import {escrowStoragePrefix,escrowPendingKey,readEscrowPending,withEscrowOperation,type PendingEscrowOperation} from '../lib/escrowOperations';
const storagePrefix=escrowStoragePrefix;
const pendingKey=escrowPendingKey;
const savedPending=(task:string)=>readEscrowPending(localStorage,task);
const canonical=(value:string)=>{try{return Address.parse(value).toRawString();}catch{return'';}};
const tokens=(value:string)=>{try{const n=BigInt(value);return (n/1_000_000_000n).toString()+'.'+(n%1_000_000_000n).toString().padStart(9,'0');}catch{return'—';}};
export default function EscrowPage(){
 const {t,i18n}=useTranslation('common');const [connector,setConnector]=useState<TonConnect|null>(null);
 useEffect(()=>{setConnector(createEscrowConnector(location.origin,localStorage));},[]);
 return <><Head><title>{t('escrow_lab.title')} · GSTD</title></Head>{connector?
  <TonConnectUIProvider connector={connector} widgetRootId="tc-escrow-widget-root" language={i18n.language.startsWith('ru')?'ru':'en'}
   walletsRequiredFeatures={{sendTransaction:{minMessages:4}}}><EscrowLab expectedConnector={connector}/></TonConnectUIProvider>:
  <p className="p-10 text-white">{t('escrow_lab.loading')}</p>}</>;
}
function EscrowLab({expectedConnector}:{expectedConnector:TonConnect}){
 const router=useRouter();
 const {t}=useTranslation('common');const p=(key:string)=>t('escrow_lab.'+key);
 const wallet=useTonWallet(),[ton]=useTonConnectUI();
 const address=canonical(wallet?.account.address||''),testnet=wallet?.account.chain==='-3';
 const [input,setInput]=useState<BatchInput|null>(null),[plan,setPlan]=useState<any>(null),[chain,setChain]=useState<any>(null);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[pending,setPending]=useState<any>(null);
 const [nowSec,setNowSec]=useState(()=>Math.floor(Date.now()/1000));
 useEffect(()=>{if(!input?.deadline)return;const timer=setTimeout(()=>setNowSec(Math.floor(Date.now()/1000)),Math.max(0,input.deadline*1000-Date.now()+1000));return()=>clearTimeout(timer);},[input?.deadline]);
 useEffect(()=>{
  if(!input&&address)setInput({payer:address,worker:address,protocol:address,reserve:address,budget:'1',requests:100,taskId:newTaskId(),deadline:Math.floor(Date.now()/1000)+3600});
 },[address,input]);
 async function api(action:string,role=0){
  const r=await fetch('/api/v1/finance/escrow-plan',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({input,action,actor:address,role})});
  const d=await r.json();if(!r.ok)throw Error(d.error||'escrow_unavailable');return d;
 }
 async function work(fn:()=>Promise<void>){setNowSec(Math.floor(Date.now()/1000));setBusy(true);setNotice('');try{await fn();}catch(e:any){setNotice(t('escrow_lab.errors.'+e.message,{defaultValue:p('errors.escrow_unavailable')}));}finally{setBusy(false);}}
 async function preview(){
  const d=await api('preview');const unfinished=savedPending(d.preview.task);setPlan(d.preview);setChain(null);setPending(unfinished);
  localStorage.setItem(storagePrefix+'draft',JSON.stringify(input));setNotice(p(unfinished?'pending':'review'));
 }
 async function refresh(){
  const d=await api('status');setChain(d.status);
  if(pending&&d.status.checked_at>pending.since){
   const done=hasExpectedEscrowState(pending,d.status);
   if(done)await withEscrowOperation(localStorage,navigator.locks,plan.task,async op=>{if(op.clear(pending.id)){setPending(null);setNotice(p('confirmed'));}else setPending(op.current());});
  }
 }
 async function send(action:BatchAction,role=0){
  if(ton.connector!==expectedConnector)throw Error('reload_required');
  if(!testnet)throw Error('wrong_network');
  await withEscrowOperation(localStorage,navigator.locks,plan.task,async op=>{
  if(pending||op.current())throw Error('operation_pending');
  const result=await api(action,role);
  const current=ton.account;
  if(!current||current.chain!=='-3'||canonical(current.address)!==result.transaction.from||result.transaction.network!=='-3'||result.preview.task!==plan.task)throw Error('wrong_network');
  if(op.current())throw Error('operation_pending');
  const snapshot:PendingEscrowOperation={id:newTaskId(),task:plan.task,action,role,since:Date.now(),validUntil:result.transaction.validUntil,requestSent:false,signed:false,payer:chain?.payer_balance||'0',
   total:String((chain?.shares||[]).reduce((a:bigint,x:any)=>a+BigInt(x.balance_nano),0n)),
   balance:chain?.shares?.[role]?.balance_nano||'0',
   native:String(BigInt(chain?.native_nano||'0')+(chain?.shares||[]).reduce((a:bigint,x:any)=>a+BigInt(x.native_nano||'0'),0n))};
  op.begin(snapshot);setPending(snapshot);
  try{await ton.sendTransaction(result.transaction,{onRequestSent:()=>{try{setPending(op.annotate(snapshot.id,{requestSent:true}));}catch{/* Keep the original pending record if diagnostic persistence fails. */}}});setPending(op.annotate(snapshot.id,{signed:true}));setNotice(p('submitted'));}
  catch(e:any){if(e instanceof UserRejectsError||isEscrowRequestValidationError(e)){if(op.clear(snapshot.id))setPending(null);else setPending(op.current());setNotice(p(e instanceof UserRejectsError?'rejected':'invalid_wallet_request'));}else{try{setPending(op.annotate(snapshot.id,{failureCode:escrowWalletErrorCode(e)}));}catch{/* Unknown failures never clear pending state. */}setNotice(p('uncertain'));}}
  });
 }
 function restartTestMint(){
  if(!pending||pending.action!=='mint'||!chain||chain.deployed||chain.shares?.some((s:any)=>BigInt(s.balance_nano)>0n))return;
  // Preserve the original draft AND its pending record. Never clear or replay a financial operation.
  localStorage.setItem(storagePrefix+'archive:'+plan.task,JSON.stringify({network:'-3',input,plan,pending}));
  const next={...input!,taskId:newTaskId(),deadline:Math.floor(Date.now()/1000)+3600};
  localStorage.setItem(storagePrefix+'draft',JSON.stringify(next));
  setInput(next);setPlan(null);setChain(null);setPending(null);setNotice(p('new_test_batch_notice'));
 }
 function restore(){try{const raw=localStorage.getItem(storagePrefix+'draft');if(raw){setInput(JSON.parse(raw));setPlan(null);setChain(null);setNotice(p('restore_review'));}}catch{setNotice(p('errors.invalid_batch'));}}
 function download(){if(!input)return;const blob=new Blob([JSON.stringify({network:'-3',input,plan,pending},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='gstd-testnet-escrow.json';a.click();URL.revokeObjectURL(url);}
 useEffect(()=>{if(!plan)return;const listener=(e:StorageEvent)=>{if(e.key===pendingKey(plan.task)){try{setPending(savedPending(plan.task));}catch{setNotice(p('errors.invalid_batch'));}}};window.addEventListener('storage',listener);return()=>window.removeEventListener('storage',listener);},[plan]);
 const isolated=ton.connector===expectedConnector;
 const blocked=busy||!!pending||!testnet||!isolated;
 const payer=!!plan&&address===plan.payer;
 const native=BigInt(chain?.native_nano||'0')+(chain?.shares||[]).reduce((a:bigint,x:any)=>a+BigInt(x.native_nano||'0'),0n);
 const button='rounded-lg bg-violet-600 px-4 py-2 disabled:opacity-40';
 const field='rounded border border-white/20 bg-black/30 px-3 py-2 w-full';
 if(!isolated)return <main className="mx-auto max-w-4xl px-5 py-10 text-white space-y-5"><h1>{p('title')}</h1><p role="alert">{p('errors.reload_required')}</p><a className={button} href={router.asPath}>{p('reload')}</a></main>;
 return <main className="mx-auto max-w-4xl px-5 py-10 text-white space-y-6">
  <header className="space-y-3"><a className="underline" href={(router.locale&&router.locale!=='en'?'/'+router.locale:'')+'/payments'}>{p('back')}</a><h1 className="text-3xl font-semibold">{p('title')}</h1><p>{p('intro')}</p>
   <p role="alert" className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4">{p('test_only')}</p></header>
  <section className="rounded-xl border border-white/15 p-5 space-y-3"><h2 className="text-xl">{p('wallet')}</h2>
   <p className="text-gray-300">{p('isolated')}</p><code className="block break-all">{address||p('not_connected')}</code>
   {wallet?<><p>{testnet?p('testnet'):p('wrong_network')}</p><button className={button} disabled={busy} onClick={()=>work(async()=>{await ton.disconnect();})}>{p('disconnect')}</button></>:
    <button className={button} disabled={busy} onClick={()=>work(async()=>{await ton.openModal();})}>{p('connect')}</button>}
   <p><a className="underline" href="https://t.me/testgiver_ton_bot" target="_blank" rel="noreferrer">{p('faucet')}</a></p>
   <button className="ml-4 underline" disabled={busy||!!pending} onClick={restore}>{p('restore')}</button>
  </section>
  {input&&<section className="rounded-xl border border-white/15 p-5 space-y-3"><h2 className="text-xl">{p('batch')}</h2><p className="text-gray-300">{p('demo_recipients')}</p>
   <label className="block">{p('budget')}<input className={field} value={input.budget} disabled={!!plan||busy} inputMode="decimal" onChange={e=>setInput({...input,budget:e.target.value})}/></label>
   <label className="block">{p('requests')}<input className={field} value={input.requests} disabled={!!plan||busy} type="number" min="1" max="10000" onChange={e=>setInput({...input,requests:Number(e.target.value)})}/></label>
   {(['worker','protocol','reserve'] as const).map(key=><label key={key} className="block">{p(key)}<input className={field} value={input[key]} disabled={!!plan||busy} onChange={e=>setInput({...input,[key]:e.target.value})}/></label>)}
   <p className="text-sm text-gray-400">{p('deadline')}: {new Date(input.deadline*1000).toLocaleString()}</p>
   <button className={button} disabled={busy||!!pending||!!plan} onClick={()=>work(preview)}>{p('prepare')}</button>
   {plan&&<button className="ml-4 underline" onClick={download}>{p('download')}</button>}
  </section>}
  {notice&&<p role="status" className="text-amber-200 break-words">{notice}</p>}
  {pending&&<div className="rounded border border-amber-500/50 p-4 space-y-3"><p>{p('pending')}</p><p>{p('wallet_request_stage')}: {p(pending.signed?'wallet_signed':pending.requestSent?'wallet_delivered':pending.requestSent===false?'wallet_not_confirmed':'wallet_stage_unknown')}</p>{pending.failureCode&&<p>{p('wallet_errors.'+pending.failureCode)}</p>}{pending.action==='mint'&&chain&&!chain.deployed&&!chain.shares?.some((s:any)=>BigInt(s.balance_nano)>0n)&&<><p>{p('new_test_batch_hint')}</p><button className={button} disabled={busy} onClick={()=>work(async()=>restartTestMint())}>{p('new_test_batch')}</button></>}</div>}
  {plan&&input&&<><section className="rounded-xl border border-white/15 p-5 space-y-3"><h2 className="text-xl">{p('review_title')}</h2>
    <p>{p('payer')}: <code className="break-all">{plan.payer}</code></p>
    <p>{p('test_asset')}: <code className="break-all">{plan.master}</code></p><p>{p('coordinator')}: <code className="break-all">{plan.task}</code></p>
    <p>{p('storage')}: {plan.minimum_storage_ton} TON</p><p className="text-sm text-gray-400">{p('wallet_storage')}</p>
    <p>{p('budget_explanation')}</p><p>{p('budget_path')}: {plan.normal_path_attached_ton} TON; {p('per_request')}: {plan.normal_path_attached_ton_per_request.toFixed(6)} TON</p>
    <p className="text-sm text-gray-400">{p('not_fee_quote')}</p>
    <p className="text-sm text-gray-300">{p('gas_proof')}</p>
    {plan.shares.map((s:any)=><div key={s.role} className="rounded border border-white/10 p-3"><b>{p(['worker','protocol','reserve'][s.role])}: {tokens(s.amount_nano)} tGSTD</b><code className="block break-all text-sm">{s.owner}</code></div>)}
   </section>
   <section className="rounded-xl border border-white/15 p-5 space-y-3"><h2 className="text-xl">{p('actions')}</h2><p>{p('steps')}</p>
    <div className="flex flex-wrap gap-3">
     <button className={button} disabled={blocked||!payer||!chain} onClick={()=>work(()=>send('mint'))}>{p('mint')}</button>
     <button className={button} disabled={blocked||!payer||chain?.deployed} onClick={()=>work(()=>send('deploy'))}>{p('deploy')}</button>
     <button className={button} disabled={busy} onClick={()=>work(refresh)}>{p('check')}</button>
     <button className={button} disabled={blocked||!payer||chain?.state!==0||chain?.mask===7} onClick={()=>work(()=>send('fund'))}>{p('fund')} · {p('up_to')} {plan.budgets_ton.fund} TON</button>
     <button className={button} disabled={blocked||!payer||chain?.state!==0||chain?.mask!==7||nowSec>input.deadline} onClick={()=>work(()=>send('accept'))}>{p('accept')} · {plan.budgets_ton.accept} TON</button>
     <button className={button} disabled={blocked||!payer||!chain?.deployed||chain?.state===1||nowSec<=input.deadline} onClick={()=>work(()=>send('expire'))}>{p('expire')} · {plan.budgets_ton.expire} TON</button>
     <button className={button} disabled={blocked||!payer||chain?.state!==2||!(chain?.shares||[]).some((s:any)=>BigInt(s.balance_nano)>0n)} onClick={()=>work(()=>send('refund'))}>{p('refund')} · {p('up_to')} {plan.budgets_ton.refund_all} TON</button>
    </div>
    {chain&&<p>{p('state')}: {p(chain.state===1?'accepted':chain.state===2?'refunded':chain.deployed?'reserved':'undeployed')} · {p('funding')}: {[1,2,4].filter(x=>(chain.mask&x)!==0).length}/3</p>}
    <p className="text-sm text-gray-400">{p('check_limits')}</p>
   </section>
   {plan.shares.map((s:any)=><section key={s.role} className="rounded-xl border border-white/15 p-5 space-y-3">
    <h2 className="text-xl">{p(['worker','protocol','reserve'][s.role])}</h2>
    <p>{p('onchain_balance')}: {tokens(chain?.shares?.[s.role]?.balance_nano||'0')} tGSTD</p>
    <button className={button} disabled={blocked||address!==s.owner||chain?.state!==1||chain?.shares?.[s.role]?.state!==1||BigInt(chain?.shares?.[s.role]?.balance_nano||'0')<=0n} onClick={()=>work(()=>send('withdraw',s.role))}>{p('withdraw')} · {plan.budgets_ton.withdraw_each} TON</button>
   </section>)}
   <details className="rounded-xl border border-white/15 p-5 space-y-3"><summary>{p('recovery')}</summary><p>{p('recovery_hint')}</p>
    <button className={button} disabled={blocked||!payer||!chain?.deployed} onClick={()=>work(()=>send('sync'))}>{p('sync')} · {plan.budgets_ton.sync} TON</button>
    <button className={button+' ml-3'} disabled={blocked||!payer||chain?.state!==0||chain?.mask===7} onClick={()=>work(()=>send('report'))}>{p('report')} · 0.09 TON</button>
    <button className={button+' ml-3'} disabled={blocked||!payer||!chain?.deployed||native<=100_000_000n} onClick={()=>work(()=>send('reclaim'))}>{p('reclaim')} · 0.12 TON</button>
   </details>
  </>}
 </main>;
}
function newTaskId(){return Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export const getStaticProps:GetStaticProps=async({locale})=>({props:await getCommonStaticProps(locale)});
