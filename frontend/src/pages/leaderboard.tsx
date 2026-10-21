import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { getCommonStaticProps } from '../lib/i18n-static-props';

import { RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '../lib/config';

interface LeaderboardEntry {
  rank: number;
  node_id: string;
  name: string;
  wallet: string;
  tasks_completed: number;
  gstd_earned: number;
  usd_earned: number | null;
  reputation_score: number;
  online: boolean;
  // legacy aliases from old KV-based API
  tasks_done?: number;
  is_online?: boolean;
}

export default function LeaderboardPage() {
  const { t } = useTranslation('common');
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [gstdPrice, setGstdPrice] = useState(0);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/nodes/rewards/leaderboard`);
      if (res.ok) {
        const json = await res.json();
        const entries = json.leaderboard || json.entries || [];
        setData(entries);
        if (json.gstd_price_usd) setGstdPrice(json.gstd_price_usd);
      }
    } catch (e) {
      console.error('Failed to fetch leaderboard:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <div style={{ fontSize: 24, lineHeight: 1 }}>🥇</div>;
    if (rank === 2) return <div style={{ fontSize: 24, lineHeight: 1 }}>🥈</div>;
    if (rank === 3) return <div style={{ fontSize: 24, lineHeight: 1 }}>🥉</div>;
    if (rank <= 10) return <div style={{ fontSize: 20, lineHeight: 1 }}>🏅</div>;
    return <span className="text-gray-500 text-sm font-mono font-bold">#{rank}</span>;
  };

  const getRankColor = (rank: number) => {
    if (rank === 1) return 'gold-top bg-yellow-400/4 border-yellow-400/20';
    if (rank === 2) return 'bg-gray-300/3 border-gray-300/20';
    if (rank === 3) return 'bg-amber-600/3 border-amber-600/20';
    if (rank <= 10) return 'violet-top bg-violet-400/2 border-violet-400/10';
    return '';
  };

  return (
    <div className="min-h-screen bg-[#030014] text-white">
      <Head>
        <title>Leaderboard — GSTD Ecosystem</title>
        <meta name="description" content="Node operators ranked by completed tasks on the GSTD network." />
      </Head>


      <main className="max-w-3xl mx-auto px-4 pt-20 pb-16 sovereign-section">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-4 mb-4 fu d2">
            <h1 className="sec-title mb-0">
              {t('leaderboard', 'Leaderboard')}
            </h1>
          </div>
          <p className="sec-sub mx-auto fu d3">
            {t('leaderboard_sub', 'Node operators ranked by GSTD earned for completed tasks.')}
          </p>
          <button
            onClick={fetchLeaderboard}
            className="mt-2 text-sm text-cyan-400 hover:text-cyan-300 font-bold transition-all fu d4 flex items-center justify-center gap-2 mx-auto"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {t('refresh', 'Refresh')}
          </button>
        </div>

        {/* Leaderboard */}
        {loading ? (
          <div className="text-center text-cyan-400 py-20 fu d5">
            <RefreshCw className="animate-spin mx-auto mb-4" size={28} />
          </div>
        ) : data.length === 0 ? (
          <div className="text-center text-gray-400 py-16 fu d5">
            <p className="font-bold mb-2">{t('leaderboard_empty', 'No node has completed a task yet.')}</p>
            <p className="text-sm text-gray-500">{t('leaderboard_empty_hint', 'The list fills in automatically once nodes start serving requests.')}</p>
          </div>
        ) : (
          <div className="space-y-3 fu d5">
            {data.map((entry, i) => (
              <div
                key={entry.rank}
                className={`sov-card flex items-center gap-4 p-4! transition-all duration-200! hover:scale-[1.02] ${getRankColor(entry.rank)}`}
                style={{ animationDelay: `${(i * 0.05).toFixed(2)}s` }}
              >
                <div className="w-12 flex justify-center items-center">{getRankIcon(entry.rank)}</div>
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-sm sm:text-base text-gray-200 truncate block font-medium">
                    {entry.name || entry.node_id || entry.wallet}
                  </span>
                  {entry.wallet && (
                    <span className="font-mono text-xs text-gray-600 truncate block">
                      {entry.wallet.slice(0, 12)}…
                    </span>
                  )}
                </div>
                <div className="text-right flex flex-col items-end gap-0.5">
                  <span className={`font-black text-lg sm:text-xl leading-none ${entry.rank <= 3 ? 'text-amber-400' : 'text-white'}`}>
                    {(entry.gstd_earned || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </span>
                  <span className="text-cyan-400/60 text-[10px] font-bold uppercase tracking-wider">GSTD</span>
                  {gstdPrice > 0 && entry.gstd_earned > 0 && (
                    <span className="text-gray-500 text-[10px]">≈ ${(entry.gstd_earned * gstdPrice).toFixed(4)}</span>
                  )}
                  <span className="text-gray-600 text-[10px]">{entry.tasks_completed || entry.tasks_done || 0} tasks</span>
                  {entry.reputation_score > 0 && (
                    <span className="text-violet-400/60 text-[10px]">⭐ {entry.reputation_score}/100</span>
                  )}
                  {(entry.online || entry.is_online) && (
                    <span className="text-green-400 text-[10px]">● online</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bottom stats */}
        <div className="mt-10 text-center text-gray-500 text-xs">
          <p>{t('leaderboard_privacy', 'Wallet addresses are truncated for privacy.')}</p>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/3 p-6 text-center">
          <div className="text-gray-400 text-sm mb-4">
            {t('leaderboard_join', 'Want to see your node here? Install a node and keep it online.')}
          </div>
          <a
            href="/nodes"
            className="px-5 py-2.5 rounded-xl border border-white/10 text-gray-300 font-bold text-sm hover:border-white/20 transition-all"
          >
            {t('leaderboard_setup', 'Node setup guide')}
          </a>
        </div>
      </main>
    </div>
  );
}

export async function getStaticProps({ locale }: { locale: string }) {
  return {
    props: await getCommonStaticProps(locale),
  };
}
