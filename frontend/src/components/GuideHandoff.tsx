import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { websiteUrl } from '../lib/website';
export default function GuideHandoff({ kind }: { kind: 'docs' | 'nodes' }) {
 const { locale } = useRouter();
 const ru=locale==='ru';
 const title=kind==='docs'?(ru?'Документация':'Documentation'):(ru?'Установка ноды':'Node installation');
 return <main className="max-w-3xl mx-auto px-6 pt-20 pb-24 text-white min-h-screen">
  <Head><title>{title+' — GSTD'}</title></Head>
  <p className="text-sm text-cyan-300 mb-3">{ru?'Приложение GSTD':'GSTD app'}</p>
  <h1 className="text-4xl font-black mb-5">{title}</h1>
  <p className="text-gray-400 leading-relaxed mb-7">{ru?'Инструкции и описание проекта собраны на основном сайте, чтобы они не расходились между двумя копиями. Здесь, в приложении, доступны чат, живой реестр нод и баланс.':'Guides and project information live on the main website so two copies cannot drift apart. Use this app for chat, the live node registry and your balance.'}</p>
  <a href={websiteUrl(locale,kind)} className="inline-flex px-6 py-3 rounded-xl bg-violet-600 font-bold">{ru?'Открыть инструкцию на сайте':'Open the guide on the website'} →</a>
  <div className="flex flex-wrap gap-6 mt-8 text-cyan-300"><Link href="/chat">{ru?'Чат':'Chat'}</Link><Link href="/nodes">{ru?'Ноды сети':'Network nodes'}</Link><Link href="/payments">{ru?'Баланс и награды':'Balance and rewards'}</Link></div>
 </main>;
}
