import {useEffect,useState} from 'react';
import type {GetStaticProps} from 'next';
import Head from 'next/head';
import Link from 'next/link';
import {useTranslation} from 'next-i18next';
import {useTonConnectUI,useTonWallet} from '@tonconnect/ui-react';
import WalletConnect from '../components/WalletConnect';
import {getCommonStaticProps} from '../lib/i18n-static-props';
type Executor={nodeId:string;wallet:string};
type Grant={id:string;label:string;spentNano:string;reservedNano:string;budgetNano:string;expiresAt:number;revokedAt:number|null;requests:number;models:string[]};
export default function AgentAccessPage(){
 const wallet=useTonWallet();return <AgentAccessForm key={wallet?.account.address||'disconnected'}/>;
}
function AgentAccessForm(){
 const {t}=useTranslation('common'),p=(k:string)=>t('agent_access.'+k);
 const wallet=useTonWallet(),[ton]=useTonConnectUI();
 const [model,setModel]=useState(''),[models,setModels]=useState<{model_id:string;price_gstd:number}[]>([]);
 const [offers,setOffers]=useState<Executor[]>([]),[selected,setSelected]=useState<string[]>([]),[grants,setGrants]=useState<Grant[]>([]);
 const [budget,setBudget]=useState('0.05'),[cap,setCap]=useState('0.005'),[hours,setHours]=useState('24');
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[secret,setSecret]=useState('');
 const address=wallet?.account.address;
 async function api(body?:unknown,query=''){
  const token=localStorage.getItem('session_token');if(!token)throw Error('auth_required');
  const r=await fetch('/api/v1/agents/grants'+query,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Session-Token':token},...(body?{body:JSON.stringify(body)}:{})});
  const d=await r.json();if(!r.ok)throw Error(d.error||'request_failed');return d;
 }
 useEffect(()=>{
  let live=true;fetch('/api/v1/models/available').then(r=>r.json()).then(d=>{if(live)setModels(d.models.filter((m:any)=>m.price_gstd>0&&m.nodes_count>0));}).catch(()=>setNotice('request_failed'));
  return()=>{live=false;};
 },[]);
 useEffect(()=>{
  let live=true;
  if(address)api().then(d=>{if(live)setGrants(d.grants);}).catch(()=>{if(live)setNotice('auth_required');});
  return()=>{live=false;};
 },[address]);
 useEffect(()=>{
  let live=true;
  if(address&&model)api(undefined,'?model='+encodeURIComponent(model)).then(d=>{if(live)setOffers(d.executors);}).catch(()=>setNotice('request_failed'));
  return()=>{live=false;};
 },[address,model]);
 const nano=(s:string)=>{
  if(!/^(0|[1-9]\d*)(\.\d{1,9})?$/.test(s))throw Error('invalid_grant_policy');
  const [whole,fraction='']=s.split('.');return (BigInt(whole)*1000000000n+BigInt(fraction.padEnd(9,'0'))).toString();
 };
 async function act(fn:()=>Promise<void>){setBusy(true);setNotice('');try{await fn();setGrants((await api()).grants);}catch(e){setNotice(e instanceof Error?e.message:'request_failed');}finally{setBusy(false);}}
 async function create(){
  if(wallet?.account.chain!=='-239')throw Error('wrong_network');
  const duration=Number(hours);if(!Number.isInteger(duration)||duration<1||duration>168)throw Error('invalid_grant_policy');
  const policy={label:'Codex',models:[model],executors:offers.filter(e=>selected.includes(e.nodeId)),
   budgetNano:nano(budget),perRequestNano:nano(cap),maxRequests:100,maxTokens:256,expiresAt:Date.now()+duration*3600000};
  const c=await api({action:'challenge',policy});
  const authorization=await ton.signData({type:'text',text:c.text,network:'-239',from:address});
  const current=ton.account;
  if(!current||current.chain!=='-239'||current.address!==address)throw Error('wrong_network');
  const result=await api({action:'create',nonce:c.nonce,authorization,stateInit:current.walletStateInit});
  setSecret(JSON.stringify({token:result.token,max_cost_gstd:cap},null,2));
 }
 function download(){
  const url=URL.createObjectURL(new Blob([secret],{type:'application/json'})),a=document.createElement('a');
  a.href=url;a.download='gstd-agent-grant.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 const button='rounded-lg bg-violet-600 px-4 py-2 disabled:opacity-40',input='block w-full rounded-lg border border-white/20 bg-black/30 p-3';
 return <main className="mx-auto max-w-3xl px-5 py-12 space-y-6 text-white">
 <Head><title>{p('title')} · GSTD</title><meta name="robots" content="noindex"/></Head>
 <h1 className="text-3xl font-semibold">{p('title')}</h1><p>{p('intro')}</p>
 <p className="text-amber-200">{p('scope')}</p><p className="text-gray-300">{p('funding')}</p>
 <Link href="/payments" className="underline">{p('payments')}</Link><WalletConnect/>
 {notice&&<p role="alert">{p(['auth_required','wrong_network','invalid_grant_policy'].includes(notice)?notice:'request_failed')}</p>}
 <section className="border border-white/20 rounded-xl p-5 space-y-4">
 <h2 className="text-xl">{p('create')}</h2>
 <label className="block">{p('model')}<select className={input} value={model} onChange={e=>{setModel(e.target.value);setOffers([]);setSelected([]);}}><option value="">{p('choose')}</option>{models.map(m=><option key={m.model_id} value={m.model_id}>{m.model_id} · {m.price_gstd} GSTD</option>)}</select></label>
 <p>{p('executors')}</p>{offers.map(e=><label key={e.nodeId} className="block break-all text-sm"><input type="checkbox" checked={selected.includes(e.nodeId)} onChange={ev=>setSelected(ev.target.checked?[...selected,e.nodeId]:selected.filter(id=>id!==e.nodeId))}/> {e.nodeId}<br/>{e.wallet}</label>)}
 <label className="block">{p('budget')}<input className={input} inputMode="decimal" value={budget} onChange={e=>setBudget(e.target.value)}/></label>
 <label className="block">{p('cap')}<input className={input} inputMode="decimal" value={cap} onChange={e=>setCap(e.target.value)}/></label>
 <label className="block">{p('hours')}<input className={input} type="number" min="1" max="168" value={hours} onChange={e=>setHours(e.target.value)}/></label>
 <p className="text-sm text-gray-300">{p('terms')}</p>
 <button className={button} disabled={busy||!address||!model||!selected.length} onClick={()=>act(create)}>{p('sign')}</button>
 </section>
 {secret&&<section className="border border-amber-300 rounded-xl p-5 space-y-3"><p>{p('secret')}</p><button className={button} onClick={download}>{p('download')}</button><button className="ml-3 underline" onClick={()=>setSecret('')}>{p('hide')}</button><p className="text-sm">{p('save')}</p></section>}
 <section className="space-y-3"><h2 className="text-xl">{p('grants')}</h2><button className="underline" disabled={busy||!address} onClick={()=>act(async()=>{await Promise.resolve();})}>{p('refresh')}</button>
 {grants.map(g=><article key={g.id} className="rounded-xl border border-white/20 p-4 space-y-2"><b>{g.label}</b><p className="break-all">{g.models.join(', ')}</p><p>{p('spent')}: {Number(g.spentNano)/1e9} / {Number(g.budgetNano)/1e9} GSTD · {p('reserved')}: {Number(g.reservedNano)/1e9}</p><p>{new Date(g.expiresAt).toLocaleString()} · {p('requests')}: {g.requests}</p><button className={button} disabled={busy||!!g.revokedAt} onClick={()=>act(async()=>{await api({action:'revoke',id:g.id});})}>{g.revokedAt?p('revoked'):p('revoke')}</button></article>)}
 </section></main>;
}
export const getStaticProps:GetStaticProps=async({locale})=>({props:await getCommonStaticProps(locale)});
