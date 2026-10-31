import Head from 'next/head';
import Link from 'next/link';
import { GetStaticProps } from 'next';
import { useRouter } from 'next/router';
import { getCommonStaticProps } from '../lib/i18n-static-props';
import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../lib/config';
import { MessageSquare, ArrowRight, Server, Download, Wallet } from 'lucide-react';
import { websiteUrl } from '../lib/website';

interface NetworkStats {
  active_workers?: number;
  total_nodes?: number;
  total_tasks?: number;
  total_users?: number;
  gstd_price_usd?: number;
}

const COPY = {
  en: {
    title: 'GSTD workspace',
    lead: 'Ask a question, draft text or get help with code from models running on GSTD nodes. Start with free chat; a wallet is needed only for paid features.',
    statusLive: (n: number) => `${n} node${n === 1 ? '' : 's'} online`,
    statusEmpty: 'The network is in early launch: no nodes are online right now, so requests are not served by the network yet.',
    statusEmptyHint: 'Run a node using the guide on the main website, or check again when an operator comes online.',
    chat: 'Try AI for free',
    firstUse: 'Start without a wallet or GSTD. Free requests have a daily limit and require an available node.',
    node: 'Network nodes',
    demo: 'Demo chat on gstdtoken.com',
    stats: 'Network now',
    registered: 'Registered nodes',
    online: 'Nodes online',
    tasks: 'Tasks processed',
    users: 'Users',
    price: 'GSTD price',
    cards: [
      { title: 'Chat', text: 'Send a request to the network. It is served only while a node is online.', href: '/chat', cta: 'Open chat' },
      { title: 'Network nodes', text: 'See live executors, installed models and their public API addresses.', href: '/nodes', cta: 'Open registry' },
      { title: 'Balance and rewards', text: 'Manage paid requests and accepted-work rewards in one place. A connected node does not earn just for being online.', href: '/payments', cta: 'Open balance' },
    ],
    links: 'Also',
    docs: 'Documentation',
    code: 'Source code',
    tg: 'AI in Telegram',
    note: 'GSTD is a utility token for paying for compute in the network. It is not an investment product.',
  },
  ru: {
    title: 'Рабочее пространство GSTD',
    lead: 'Задавайте вопросы, готовьте тексты и разбирайтесь с кодом с помощью моделей на нодах GSTD. Начните с бесплатного чата; кошелёк нужен только для платных возможностей.',
    statusLive: (n: number) => `Нод онлайн: ${n}`,
    statusEmpty: 'Сеть на раннем старте: сейчас ни одной ноды нет онлайн, поэтому сеть пока не обрабатывает запросы.',
    statusEmptyHint: 'Запустите ноду по инструкции на основном сайте или проверьте сеть, когда оператор подключится.',
    chat: 'Попробовать ИИ бесплатно',
    firstUse: 'Начните без кошелька и GSTD. У бесплатных запросов есть суточный лимит; для ответа нужна доступная нода.',
    node: 'Ноды сети',
    demo: 'Демо-чат на gstdtoken.com',
    stats: 'Сеть сейчас',
    registered: 'Зарегистрировано нод',
    online: 'Нод онлайн',
    tasks: 'Обработано заданий',
    users: 'Пользователи',
    price: 'Цена GSTD',
    cards: [
      { title: 'Чат', text: 'Отправьте запрос в сеть. Он обрабатывается, только пока хотя бы одна нода онлайн.', href: '/chat', cta: 'Открыть чат' },
      { title: 'Ноды сети', text: 'Смотрите доступных исполнителей, установленные модели и публичные адреса API.', href: '/nodes', cta: 'Открыть реестр' },
      { title: 'Баланс и награды', text: 'Оплата запросов и награды за принятую работу собраны в одном месте. Само подключение ноды не приносит дохода.', href: '/payments', cta: 'Открыть баланс' },
    ],
    links: 'Ещё',
    docs: 'Документация',
    code: 'Исходный код',
    tg: 'ИИ в Telegram',
    note: 'GSTD — утилитарный токен для оплаты вычислений в сети. Это не инвестиционный продукт.',
  },
} as const;

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="p-5 rounded-2xl glass-pro text-center">
      <div className="text-3xl font-black text-white leading-none mb-1">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{label}</div>
    </div>
  );
}

export default function Home() {
  const { locale } = useRouter();
  const c = locale === 'ru' ? COPY.ru : COPY.en;
  const [stats, setStats] = useState<NetworkStats | null>(null);

  useEffect(() => {
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/network/stats`);
        if (!res.ok) throw new Error('registry_unavailable');
        setStats(await res.json());
      } catch {
        setStats(null);
      }
    };
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, []);

  const online = stats?.active_workers ?? 0;
  const num = (v?: number) => (typeof v === 'number' ? v.toLocaleString() : '—');
  const icons = [MessageSquare, Server, Wallet];

  return (
    <div className="min-h-screen bg-[#030014] text-white font-sans selection:bg-violet-500/30">
      <Head><title>{c.title + ' — GSTD'}</title></Head>
      <section className="px-4 sm:px-6 pt-16 pb-10 w-full max-w-4xl mx-auto text-center">
        <h1 className="text-4xl sm:text-6xl font-black tracking-tight mb-5 leading-[1.1]">{c.title}</h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed mb-8">{c.lead}</p>

        {stats && (
          <div
            className={`max-w-2xl mx-auto mb-8 rounded-2xl border px-5 py-4 text-sm text-left ${
              online > 0 ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300' : 'border-amber-500/30 bg-amber-500/5 text-amber-200'
            }`}
          >
            {online > 0 ? (
              <strong>{c.statusLive(online)}</strong>
            ) : (
              <>
                <p className="font-semibold mb-1">{c.statusEmpty}</p>
                <p className="text-amber-200/80">{c.statusEmptyHint}</p>
              </>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/chat"
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl bg-linear-to-r from-violet-600 to-cyan-600 text-white font-bold"
            style={{ textDecoration: 'none' }}
          >
            <MessageSquare size={18} /> {c.chat} <ArrowRight size={16} />
          </Link>
          <Link
            href="/nodes"
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl glass-pro text-white font-bold"
            style={{ textDecoration: 'none' }}
          >
            <Server size={18} className="text-emerald-400" /> {c.node}
          </Link>
          {online === 0 && (
            <a
              href={websiteUrl(locale,'nodes')}
              className="inline-flex items-center justify-center gap-2 px-5 py-3.5 text-sm text-cyan-300 font-semibold"
              style={{ textDecoration: 'none' }}
            >
              {locale === 'ru' ? 'О проекте и установке' : 'About GSTD and installation'} <ArrowRight size={14} />
            </a>
          )}
        </div>
        <p className="mt-4 text-sm text-gray-400 max-w-xl mx-auto">{c.firstUse}</p>
      </section>

      <section className="px-4 sm:px-6 pb-12 w-full max-w-4xl mx-auto" id="stats">
        <h2 className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-3 text-center">{c.stats}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Stat value={num(stats?.total_nodes)} label={c.registered} />
          <Stat value={num(stats?.active_workers)} label={c.online} />
          <Stat value={num(stats?.total_tasks)} label={c.tasks} />
        </div>
      </section>

      <section className="px-4 sm:px-6 pb-12 w-full max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
        {c.cards.map((card, i) => {
          const Icon = icons[i];
          return (
            <div key={card.href} className="p-6 rounded-3xl glass-pro">
              <Icon className="text-cyan-400 mb-3" size={22} />
              <h2 className="text-lg font-black mb-2">{card.title}</h2>
              <p className="text-sm text-gray-400 leading-relaxed mb-4">{card.text}</p>
              <Link href={card.href} className="inline-flex items-center gap-2 text-cyan-300 font-bold text-sm" style={{ textDecoration: 'none' }}>
                {card.cta} <ArrowRight size={14} />
              </Link>
            </div>
          );
        })}
      </section>

      <section className="px-4 sm:px-6 pb-16 w-full max-w-4xl mx-auto text-center">
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-gray-400 mb-4">
          <a href={websiteUrl(locale,'docs')} style={{ textDecoration: 'none' }} className="hover:text-white">{c.docs}</a>
          <a href={websiteUrl(locale,'nodes')} style={{ textDecoration: 'none' }} className="hover:text-white inline-flex items-center gap-1"><Download size={13} /> {locale === 'ru' ? 'Установка ноды' : 'Install a node'}</a>
          <a href="https://github.com/gstdcoin" style={{ textDecoration: 'none' }} className="hover:text-white">{c.code}</a>
          <a href="https://t.me/gstdaibot" style={{ textDecoration: 'none' }} className="hover:text-white">{c.tg}</a>
        </div>
        <p className="text-xs text-gray-600 max-w-xl mx-auto">{c.note}</p>
      </section>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: await getCommonStaticProps(locale),
});
