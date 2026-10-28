import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect, useCallback } from 'react';
import { GetStaticProps } from 'next';
import { getCommonStaticProps } from '../lib/i18n-static-props';
import { websiteUrl } from '../lib/website';
import { safeNodeUrl } from '../lib/safeNodeUrl';

type LiveNode = { node_id:string; name:string; capabilities:string[]; cpu_cores:number; has_gpu:boolean; platform:string; node_url?:string; tasks_completed:number; last_seen:string };
type Registry = {nodes:LiveNode[]; count:number; timestamp:number};
export default function NodesPage() {
 const {locale}=useRouter();const ru=locale==='ru';
 const [registry,setRegistry]=useState<Registry|null>(null);
 const [failed,setFailed]=useState(false);const [loading,setLoading]=useState(false);
 const load=useCallback(async()=>{
  if(document.hidden)return;setLoading(true);
  try {const r=await fetch('/api/v1/nodes/list');if(!r.ok)throw new Error('registry_unavailable');const data=await r.json();if(!Array.isArray(data.nodes))throw new Error('invalid_registry');setRegistry(data);setFailed(false);}
  catch {setRegistry(null);setFailed(true);}finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();const timer=setInterval(load,120000);return()=>clearInterval(timer);},[load]);
 const box='rounded-2xl border border-white/10 bg-white/3 p-5';
 const title=ru?'Ноды сети':'Network nodes';
 return <main className="max-w-4xl mx-auto px-5 pt-16 pb-24 text-white min-h-screen">
  <Head><title>{title+' — GSTD'}</title></Head>
  <h1 className="text-4xl font-black mb-4">{title}</h1>
  <p className="text-gray-400 leading-relaxed mb-6">{ru?'Живой реестр подключённых исполнителей. Модели появляются здесь после регистрации ноды и её обновлений состояния. Установка описана на основном сайте, а баланс и получение наград доступны на одной странице приложения.':'The live registry of connected executors. Models appear after node registration and heartbeats. Installation lives on the main website; balance and reward collection share one page in this app.'}</p>
  <div className="flex flex-wrap gap-3 mb-8">
   <a className="px-5 py-3 rounded-xl bg-violet-600 font-bold" href={websiteUrl(locale,'nodes')}>{ru?'Установить ноду':'Install a node'} →</a>
   <Link className="px-5 py-3 rounded-xl border border-cyan-400/30 text-cyan-300 font-bold" href="/payments?from=node">{ru?'Баланс и награды':'Balance and rewards'} →</Link>
   <Link className="px-5 py-3 rounded-xl border border-white/10" href="/chat">{ru?'Выбрать модель в чате':'Choose a model in chat'} →</Link>
  </div>
  <section className={box+' mb-7'}>
   <h2 className="font-bold text-lg mb-2">{ru?'Как нода приносит пользу':'How a node provides value'}</h2>
   <p className="text-sm text-gray-400 leading-relaxed">{ru?'Запускайте свои модели локально, а при доступной оплаченной работе делитесь вычислениями с сетью. За принятую оплаченную работу исполнителю причитается 85%, протоколу 10%, резерву 5%. Платные кампании доставляются через исходящую очередь и не требуют публичной панели. Для прямых запросов чата нужен публичный HTTPS API. Пустая очередь, бесплатный чат и само присутствие в сети не создают выводимых токенов.':'Run your own models locally and share compute when paid work is available. Accepted paid work allocates 85% to the executor, 10% to the protocol and 5% to reserve. Funded campaigns use an outbound queue and do not require a public panel. Direct chat requests need a public HTTPS API. An empty queue, free chat or network presence creates no withdrawable tokens.'}</p>
   <p className="text-sm text-gray-400 leading-relaxed mt-3">{ru?'В панели ноды укажите свой адрес получения наград. Подключите тот же TON-кошелёк на странице «Баланс и награды». Получение награды зачисляет внутренний баланс; вывод в TON — отдельная операция с подписью владельца кошелька обеспечения.':'Set your reward address in the node panel. Connect that same TON wallet on Balance and rewards. Claiming credits the internal balance; a TON withdrawal is a separate operation signed by the custody wallet owner.'}</p>
  </section>
  <div className="flex flex-wrap items-center justify-between gap-3 mb-4"><h2 className="text-xl font-bold">{registry?(ru?'Нод онлайн: ':'Nodes online: ')+registry.count:(ru?'Реестр сети':'Network registry')}</h2><button onClick={()=>void load()} disabled={loading} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 disabled:opacity-50">{loading?(ru?'Загрузка…':'Loading…'):(ru?'Обновить':'Refresh')}</button></div>
  {!registry&&<p className="text-gray-400 mb-5">{failed?(ru?'Реестр временно недоступен. Предыдущие данные скрыты; это не означает, что все ноды отключены.':'The registry is temporarily unavailable. Previous data is hidden; this does not mean every node is offline.'):(ru?'Загружаем состояние сети…':'Loading network status…')}</p>}
  {registry?.nodes.length===0&&<div className={box}>{ru?'Сейчас реестр не показывает онлайн-нод. Установленная нода появится после успешной регистрации и heartbeat. Если задания нет, нода ожидает работу, а не зарабатывает за простой.':'The registry currently shows no online nodes. An installed node appears after successful registration and heartbeat. Without a task, a node waits for work rather than earning for idle time.'}</div>}
  <div className="grid gap-4">{registry?.nodes.map(node=><article key={node.node_id} className={box}>
   <div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold text-lg break-all">{node.name||node.node_id}</h3><span className="text-emerald-300 text-sm">{ru?'Онлайн':'Online'}</span></div>
   <p className="font-mono text-xs text-gray-500 mt-1 break-all">ID: {node.node_id}</p>
   <p className="text-sm text-gray-400 mt-3">{node.platform} · CPU: {node.cpu_cores} · GPU: {node.has_gpu?(ru?'заявлен':'reported'):(ru?'нет':'none')}</p>
   <p className="text-sm text-gray-300 mt-3">{ru?'Модели и возможности: ':'Models and capabilities: '}{node.capabilities?.length?node.capabilities.join(', '):(ru?'пока не заявлены':'not reported yet')}</p>
   <p className="text-xs text-cyan-300 mt-3">{safeNodeUrl(node.node_url)?(ru?'Исходящая очередь и заявленный публичный HTTPS; доступность чата проверяется при запросе.':'Outbound queue and a configured public HTTPS route; chat availability is checked on request.'):(ru?'Исходящая очередь заданий. Прямой чат недоступен без публичного HTTPS-адреса.':'Outbound task queue. Direct chat requires a public HTTPS endpoint.')}</p>
   <p className="text-xs text-gray-500 mt-3">{ru?'Принято заданий, включая бесплатные: ':'Accepted tasks, including unpaid work: '}{node.tasks_completed||0}. {ru?'Этот счётчик не равен доходу.':'This counter is not earnings.'}</p>
   {safeNodeUrl(node.node_url)&&<div className="text-xs text-gray-400 mt-3"><span>{ru?'Публичный API ноды (адрес может меняться):':'Public node API (the address may rotate):'}</span><code className="block break-all text-cyan-200 mt-1">{safeNodeUrl(node.node_url)+'/v1'}</code></div>}
   <p className="text-xs text-gray-500 mt-3">{ru?'Состояние от ':'Last seen: '}{new Date(node.last_seen).toLocaleString(ru?'ru-RU':'en-US')}</p>
  </article>)}</div>
  <p className="text-xs text-gray-500 mt-6">{ru?'Для приложений используйте единый API https://app.gstdtoken.com/api/v1 — он выбирает доступного исполнителя. Переход к более мощной модели требует наличия этой модели в живом каталоге; скрытой замены нет.':'Applications should use https://app.gstdtoken.com/api/v1 to select an available executor. A more powerful model must be present in the live catalog; it is never silently substituted.'}</p>
 </main>;
}
export const getStaticProps:GetStaticProps=async({locale})=>({props:await getCommonStaticProps(locale)});
