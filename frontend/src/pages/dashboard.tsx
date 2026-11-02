import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import type { GetStaticProps } from 'next';
import { getCommonStaticProps } from '../lib/i18n-static-props';

/** Compatibility entrypoint for the former duplicate dashboard. */
export default function DashboardPage() {
 const router=useRouter();const {locale}=router;const ru=locale==='ru';
 useEffect(()=>{
  const routes:Record<string,string>={chat:'/chat',devices:'/nodes',nodes:'/nodes',wallet:'/payments',payments:'/payments',stats:'/stats'};
  const tab=typeof router.query.tab==='string'?router.query.tab:'';
  if(router.isReady && routes[tab])void router.replace(routes[tab]);
 },[router.isReady,router.query.tab,router]);
 const links=[
  {href:'/chat',title:ru?'Чат и модели':'Chat and models',text:ru?'Выберите доступную модель и проверьте стоимость перед отправкой.':'Choose an available model and review its price before sending.'},
  {href:'/nodes',title:ru?'Ноды сети':'Network nodes',text:ru?'Реальный реестр, доступные модели и переход к установке своей ноды.':'Live registry, available models and instructions for your own node.'},
  {href:'/payments',title:ru?'Баланс и награды':'Balance and rewards',text:ru?'Пополнение, принятая оплаченная работа и заявки на вывод GSTD.':'Deposits, accepted paid work and GSTD withdrawal requests.'},
  {href:'/stats',title:ru?'Статистика':'Statistics',text:ru?'Показатели из действующего реестра и учёта платформы.':'Figures from the live registry and platform ledger.'},
 ];
 return <main className="max-w-4xl mx-auto px-5 pt-24 pb-24 text-white min-h-screen">
  <Head><title>{ru?'Мой GSTD':'My GSTD'}</title></Head>
  <h1 className="text-4xl font-black mb-4">{ru?'Мой GSTD':'My GSTD'}</h1>
  <p className="text-gray-400 mb-8">{ru?'Чат, ноды и баланс используют общие страницы приложения. Управление моделями, обновлениями и оборудованием находится в защищённой панели вашей ноды.':'Chat, nodes and balances use the shared application pages. Manage models, updates and hardware in your node’s protected dashboard.'}</p>
  <div className="grid sm:grid-cols-2 gap-4">{links.map(item=><Link key={item.href} href={item.href} className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:border-violet-400 transition-colors"><h2 className="text-xl font-bold mb-2">{item.title} →</h2><p className="text-sm text-gray-400">{item.text}</p></Link>)}</div>
  <p className="mt-7 text-sm text-gray-400">{ru?'Награды начисляются только за принятую оплаченную работу. Само подключение ноды и бесплатные запросы не создают выводимых токенов.':'Rewards require accepted paid work. Connecting a node and serving free requests do not create withdrawable tokens.'}</p>
  <a className="inline-block mt-5 underline text-violet-300" href="https://gstdtoken.com/developers">{ru?'API оплачиваемых задач и интеграции':'Funded task API and integrations'} →</a>
 </main>;
}
export const getStaticProps:GetStaticProps=async({locale})=>({props:await getCommonStaticProps(locale)});
