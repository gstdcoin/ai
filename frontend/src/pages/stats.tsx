import Head from 'next/head';
import Link from 'next/link';
import { GetStaticProps } from 'next';
import { useRouter } from 'next/router';
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { getCommonStaticProps } from '../lib/i18n-static-props';
import { API_BASE_URL } from '../lib/config';

interface NetworkStats {
  nodes_online?: number;
  active_workers?: number;
  total_nodes?: number;
  total_users?: number;
  total_tasks?: number;
  queue_depth?: number;
  total_gstd_paid?: number;
  total_burned?: number;
  gstd_price_usd?: number;
}

const COPY = {
  en: {
    title: 'Network statistics',
    sub: 'Values are read from the network API every 30 seconds. Nothing is estimated.',
    refresh: 'Refresh',
    error: 'The statistics service is not reachable right now. Try again in a minute.',
    empty: 'No node is online at the moment, so the network is not serving requests yet.',
    updated: 'Updated',
    items: {
      online: 'Nodes online',
      registered: 'Registered nodes',
      tasks: 'Tasks processed',
      queue: 'Queue',
      users: 'Users',
      paid: 'GSTD paid to nodes',
      burned: 'GSTD burned',
      price: 'GSTD price (USD)',
    },
    run: 'Run a node',
  },
  ru: {
    title: 'Статистика сети',
    sub: 'Значения читаются из API сети каждые 30 секунд. Ничего не оценивается.',
    refresh: 'Обновить',
    error: 'Сервис статистики сейчас недоступен. Попробуйте через минуту.',
    empty: 'Сейчас ни одной ноды нет онлайн, поэтому сеть пока не обрабатывает запросы.',
    updated: 'Обновлено',
    items: {
      online: 'Нод онлайн',
      registered: 'Зарегистрировано нод',
      tasks: 'Обработано заданий',
      queue: 'Очередь',
      users: 'Пользователи',
      paid: 'GSTD выплачено нодам',
      burned: 'GSTD сожжено',
      price: 'Цена GSTD (USD)',
    },
    run: 'Запустить ноду',
  },
} as const;

export default function PublicStats() {
  const { locale } = useRouter();
  const c = locale === 'ru' ? COPY.ru : COPY.en;
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/network/stats`);
      if (!res.ok) throw new Error(String(res.status));
      setStats(await res.json());
      setUpdatedAt(new Date());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const fmt = (v?: number, digits = 0) =>
    typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: digits }) : '—';
  const online = stats?.active_workers ?? stats?.nodes_online ?? 0;

  const rows: Array<[string, string]> = [
    [c.items.online, fmt(online)],
    [c.items.registered, fmt(stats?.total_nodes)],
    [c.items.tasks, fmt(stats?.total_tasks)],
    [c.items.queue, fmt(stats?.queue_depth)],
    [c.items.users, fmt(stats?.total_users)],
    [c.items.paid, fmt(stats?.total_gstd_paid, 4)],
    [c.items.burned, fmt(stats?.total_burned, 4)],
    [c.items.price, stats?.gstd_price_usd && stats.gstd_price_usd > 0 ? `$${stats.gstd_price_usd.toFixed(6)}` : '—'],
  ];

  return (
    <div className="min-h-screen bg-[#030014] text-white">
      <Head>
        <title>{c.title} — GSTD</title>
      </Head>
      <main className="max-w-3xl mx-auto px-4 pt-16 pb-16">
        <h1 className="text-3xl font-black mb-2">{c.title}</h1>
        <p className="text-sm text-gray-400 mb-6">{c.sub}</p>

        {failed && <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">{c.error}</div>}
        {stats && online === 0 && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">{c.empty}</div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {rows.map(([label, value]) => (
            <div key={label} className="p-4 rounded-2xl bg-white/2 border border-white/8">
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">{label}</div>
              <div className="text-xl font-black tabular-nums">{value}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-500">
          <button onClick={load} className="inline-flex items-center gap-2 text-cyan-400 font-bold">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> {c.refresh}
          </button>
          {updatedAt && <span>{c.updated}: {updatedAt.toLocaleTimeString()}</span>}
          <Link href="/nodes" className="ml-auto text-gray-300 font-bold">{c.run} →</Link>
        </div>
      </main>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: await getCommonStaticProps(locale),
});
