import Link from 'next/link';
import { GetStaticProps } from 'next';
import { useRouter } from 'next/router';
import { getCommonStaticProps } from '../lib/i18n-static-props';
import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../lib/config';
import { MessageSquare, ArrowRight, Server, Download, BarChart3 } from 'lucide-react';

interface NetworkStats {
  active_workers?: number;
  total_nodes?: number;
  total_tasks?: number;
  total_users?: number;
  gstd_price_usd?: number;
}

const COPY = {
  en: {
    title: 'Decentralized AI compute on TON',
    lead: 'GSTD connects people who need AI inference with node operators who run open models on their own hardware. Requests are paid in GSTD.',
    statusLive: (n: number) => `${n} node${n === 1 ? '' : 's'} online`,
    statusEmpty: 'The network is in early launch: no nodes are online right now, so requests are not served by the network yet.',
    statusEmptyHint: 'You can help by running a node. Until then, a short demo chat is available on gstdtoken.com.',
    chat: 'Open chat',
    node: 'Run a node',
    demo: 'Demo chat on gstdtoken.com',
    stats: 'Network now',
    registered: 'Registered nodes',
    online: 'Nodes online',
    tasks: 'Tasks processed',
    users: 'Users',
    price: 'GSTD price',
    cards: [
      { title: 'Chat', text: 'Send a request to the network. It is served only while a node is online.', href: '/chat', cta: 'Open chat' },
      { title: 'Run a node', text: 'Install the open-source node with one command on a computer with Ollama.', href: '/nodes', cta: 'Setup guide' },
      { title: 'Live statistics', text: 'Numbers come directly from the network API, with no estimates.', href: '/stats', cta: 'Open statistics' },
    ],
    links: 'Also',
    docs: 'Documentation',
    code: 'Source code',
    tg: 'Telegram channel',
    note: 'GSTD is a utility token for paying for compute in the network. It is not an investment product.',
  },
  ru: {
    title: 'Децентрализованные ИИ-вычисления на TON',
    lead: 'GSTD соединяет тех, кому нужен ИИ-инференс, с операторами нод, которые запускают открытые модели на своём оборудовании. Запросы оплачиваются в GSTD.',
    statusLive: (n: number) => `Нод онлайн: ${n}`,
    statusEmpty: 'Сеть на раннем старте: сейчас ни одной ноды нет онлайн, поэтому сеть пока не обрабатывает запросы.',
    statusEmptyHint: 'Помочь можно, запустив ноду. А пока на gstdtoken.com доступен короткий демо-чат.',
    chat: 'Открыть чат',
    node: 'Запустить ноду',
    demo: 'Демо-чат на gstdtoken.com',
    stats: 'Сеть сейчас',
    registered: 'Зарегистрировано нод',
    online: 'Нод онлайн',
    tasks: 'Обработано заданий',
    users: 'Пользователи',
    price: 'Цена GSTD',
    cards: [
      { title: 'Чат', text: 'Отправьте запрос в сеть. Он обрабатывается, только пока хотя бы одна нода онлайн.', href: '/chat', cta: 'Открыть чат' },
      { title: 'Запуск ноды', text: 'Установите ноду с открытым кодом одной командой на компьютере с Ollama.', href: '/nodes', cta: 'Инструкция' },
      { title: 'Живая статистика', text: 'Цифры берутся напрямую из API сети, без оценок.', href: '/stats', cta: 'Открыть статистику' },
    ],
    links: 'Ещё',
    docs: 'Документация',
    code: 'Исходный код',
    tg: 'Канал в Telegram',
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
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/network/stats`);
        if (res.ok) setStats(await res.json());
      } catch {
        // keep the previous values
      }
    };
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  const online = stats?.active_workers ?? 0;
  const num = (v?: number) => (typeof v === 'number' ? v.toLocaleString() : '—');
  const price = stats?.gstd_price_usd && stats.gstd_price_usd > 0 ? `$${stats.gstd_price_usd.toFixed(6)}` : '—';
  const icons = [MessageSquare, Server, BarChart3];

  return (
    <div className="min-h-screen bg-[#030014] text-white font-sans selection:bg-violet-500/30">
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
              href="https://gstdtoken.com/ai"
              className="inline-flex items-center justify-center gap-2 px-5 py-3.5 text-sm text-cyan-300 font-semibold"
              style={{ textDecoration: 'none' }}
            >
              {c.demo} <ArrowRight size={14} />
            </a>
          )}
        </div>
      </section>

      <section className="px-4 sm:px-6 pb-12 w-full max-w-4xl mx-auto" id="stats">
        <h2 className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-3 text-center">{c.stats}</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat value={num(stats?.total_nodes)} label={c.registered} />
          <Stat value={num(stats?.active_workers)} label={c.online} />
          <Stat value={num(stats?.total_tasks)} label={c.tasks} />
          <Stat value={num(stats?.total_users)} label={c.users} />
          <Stat value={price} label={c.price} />
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
          <Link href="/docs" style={{ textDecoration: 'none' }} className="hover:text-white">{c.docs}</Link>
          <Link href="/downloads" style={{ textDecoration: 'none' }} className="hover:text-white inline-flex items-center gap-1"><Download size={13} /> {locale === 'ru' ? 'Загрузки' : 'Downloads'}</Link>
          <a href="https://github.com/gstdcoin" style={{ textDecoration: 'none' }} className="hover:text-white">{c.code}</a>
          <a href="https://t.me/gstdtoken" style={{ textDecoration: 'none' }} className="hover:text-white">{c.tg}</a>
        </div>
        <p className="text-xs text-gray-600 max-w-xl mx-auto">{c.note}</p>
      </section>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: await getCommonStaticProps(locale),
});
