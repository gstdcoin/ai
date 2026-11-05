import {Address} from '@ton/core';
import {useEffect,useState} from 'react';
import type {GetStaticProps} from 'next';
import Head from 'next/head';
import Link from 'next/link';
import {useTranslation} from 'next-i18next';
import {useTonWallet} from '@tonconnect/ui-react';
import WalletConnect from '../components/WalletConnect';
import {isFreeModel} from '../lib/modelPricing';
import {getCommonStaticProps} from '../lib/i18n-static-props';
export default function NodeEconomics(){const wallet=useTonWallet();return <EconomicsForm key={wallet?.account.address||'none'}/>;}
function EconomicsForm(){
 const {t}=useTranslation('common'),p=(key:string,options?:Record<string,unknown>)=>t('node_economics.'+key,options);
 const wallet=useTonWallet(),address=wallet?.account.address;
 const [nodes,setNodes]=useState<any[]>([]),[nodeId,setNode]=useState(''),[model,setModel]=useState('');
 const [net,setNet]=useState('0.001'),[tokens,setTokens]=useState('128'),[bytes,setBytes]=useState('16000');
 const [hourly,setHourly]=useState(''),[seconds,setSeconds]=useState(''),[util,setUtil]=useState('25');
 const [sample,setSample]=useState<any>(null);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 async function api(body?:unknown){
  const token=localStorage.getItem('session_token');if(!token)throw Error('auth_required');
  const r=await fetch('/api/v1/economics/offers',{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Session-Token':token},...(body?{body:JSON.stringify(body)}:{})});
  const d=await r.json();if(!r.ok)throw Error(d.error||'failed');return d;
 }
 useEffect(()=>{let live=true;if(address)api().then(d=>{if(d.wallet!==Address.parse(address).toRawString())throw Error();if(live)setNodes(d.nodes);}).catch(()=>setNotice('auth_required'));return()=>{live=false;};},[address]);
 const selected=nodes.find(n=>n.node_id===nodeId),offer=selected?.offers?.find((o:any)=>o.model===model);
 const suggestedTokens=sample&&Number.isSafeInteger(sample.reported_completion_tokens)&&sample.reported_completion_tokens>0&&sample.wall_ms>0?[16,32,64,128,256,512,1024,2048].filter(n=>n<=40000/sample.wall_ms*Math.min(64,sample.reported_completion_tokens)).pop():undefined;
 const h=Number(hourly),sec=Number(seconds),u=Number(util),estimate=hourly&&seconds&&h>=0&&sec>0&&u>0&&u<=100?h*sec/3600/(u/100):null;
 async function save(active:boolean){
  setBusy(true);setNotice('');
  try{await api({node_id:nodeId,model,net_usd:net,max_tokens:Number(tokens),max_input_bytes:Number(bytes),active});setNodes((await api()).nodes);setNotice('saved');}
  catch{setNotice('failed');}finally{setBusy(false);}
 }
 async function measure(){
  setBusy(true);setNotice('');
  try{
   const token=localStorage.getItem('session_token');if(!token)throw Error();
   const r=await fetch('/api/v1/economics/benchmark',{method:'POST',headers:{'Content-Type':'application/json','X-Session-Token':token},body:JSON.stringify({node_id:nodeId,model,allow_network:true})});
   const d=await r.json();if(!r.ok)throw Error();setSample(d);setSeconds((d.wall_ms/1000).toFixed(3));
  }catch{setNotice('failed');}finally{setBusy(false);}
 }
 const input='block w-full rounded-lg border border-white/20 bg-black/30 p-3',button='rounded-lg bg-violet-600 px-4 py-3 disabled:opacity-40';
 return <main className="max-w-3xl mx-auto px-5 py-12 space-y-6 text-white">
 <Head><title>{p('title')} · GSTD</title></Head><h1 className="text-3xl font-semibold">{p('title')}</h1><p>{p('intro')}</p><WalletConnect/>
 <p className="text-amber-200">{p('risk')}</p>
 {notice&&<p role="status">{p(['saved','auth_required'].includes(notice)?notice:'failed')}</p>}
 <section className="border border-white/20 rounded-xl p-5 space-y-3"><h2 className="text-xl">{p('offer')}</h2>
 <label className="block">{p('node')}<select className={input} value={nodeId} onChange={e=>{setNode(e.target.value);setModel('');setSample(null);setSeconds('');}}><option value="">{p('choose')}</option>{nodes.map(n=><option key={n.node_id} value={n.node_id}>{n.node_id}</option>)}</select></label>
 <label className="block">{p('model')}<select className={input} value={model} onChange={e=>{setModel(e.target.value);setSample(null);setSeconds('');const old=selected?.offers?.find((o:any)=>o.model===e.target.value);if(old){setNet((Number(old.netUsdMicro)/1e6).toFixed(6));setTokens(String(old.maxTokens));setBytes(String(old.maxInputBytes));}}}><option value="">{p('choose')}</option>{selected?.models?.filter((m:string)=>!isFreeModel(m)).map((m:string)=><option key={m}>{m}</option>)}</select></label>
 <label className="block">{p('net')}<input className={input} inputMode="decimal" value={net} onChange={e=>setNet(e.target.value)}/></label>
 <label className="block">{p('tokens')}<input className={input} type="number" min="1" max="16384" value={tokens} onChange={e=>setTokens(e.target.value)}/></label>
 <label className="block">{p('bytes')}<input className={input} type="number" min="1" max="262144" value={bytes} onChange={e=>setBytes(e.target.value)}/></label>
 <p className="text-sm text-gray-300">{p('fixed')}</p>
 <p>{p('state')}: {offer?offer.active?p('active'):p('disabled'):p('inactive')}</p>
 <div className="flex flex-wrap gap-3"><button className={button} disabled={busy||!model||!nodeId} onClick={()=>save(true)}>{p('activate')}</button><button className="underline" disabled={busy||!offer?.active} onClick={()=>save(false)}>{p('disable')}</button></div>
 <p className="text-sm text-gray-400">{p('commitment')}</p>
 </section>
 <section className="border border-white/20 rounded-xl p-5 space-y-3"><h2 className="text-xl">{p('calculator')}</h2>
 <p className="text-sm">{p('assumptions')}</p>
 <button className={button} disabled={busy||!model||!nodeId} onClick={measure}>{p('measure')}</button>
 {sample&&<p>{p('sample')}: {sample.model} · {(sample.wall_ms/1000).toFixed(3)} s · {sample.output_characters} {p('characters')} · {p('sample_notice')}</p>}
 {suggestedTokens&&<button className="underline" disabled={busy} onClick={()=>setTokens(String(suggestedTokens))}>{p('suggestion',{tokens:suggestedTokens})}</button>}
 <label className="block">{p('hourly')}<input className={input} inputMode="decimal" value={hourly} onChange={e=>setHourly(e.target.value)}/></label>
 <label className="block">{p('seconds')}<input className={input} inputMode="decimal" value={seconds} onChange={e=>setSeconds(e.target.value)}/></label>
 <label className="block">{p('utilization')}<input className={input} type="number" min="1" max="100" value={util} onChange={e=>setUtil(e.target.value)}/></label>
 {estimate!==null&&Number.isFinite(estimate)&&<><p>{p('estimated_cost')}: {estimate.toFixed(6)} USD · {p('gross_cost')}: {(estimate/.85).toFixed(6)} USD</p><p>{p('estimated_margin')}: {(Number(net)-estimate).toFixed(6)} USD</p>{Number(net)<estimate&&<p role="alert" className="text-amber-200">{p('below_cost')}</p>}</>}
 </section>
 <Link href="/payments" className="underline">{p('payments')}</Link>
 </main>;
}
export const getStaticProps:GetStaticProps=async({locale})=>({props:await getCommonStaticProps(locale)});
