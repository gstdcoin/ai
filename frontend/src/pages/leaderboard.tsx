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
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [gstdPrice, setGstdPrice] = useState(0);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/nodes/leaderboard`);
      if (res.ok) {
        const json = await res.json();
        const entries = json.leaderboard || json.entries || [];
        setData(entries);
        setTotal(entries.length);
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
    if (rank === 1) return 'gold-top bg-yellow-400/[0.04] border-yellow-400/20';
    if (rank === 2) return 'bg-gray-300/[0.03] border-gray-300/20';
    if (rank === 3) return 'bg-amber-600/[0.03] border-amber-600/20';
    if (rank <= 10) return 'violet-top bg-violet-400/[0.02] border-violet-400/10';
    return '';
  };

  return (
    <div className="min-h-screen bg-[#030014] text-white">
      <Head>
        <title>Leaderboard — GSTD Ecosystem</title>
        <meta name="description" content="Top GSTD token holders leaderboard. See who leads the decentralized AI network." />
      </Head>


      <main className="max-w-3xl mx-auto px-4 pt-20 pb-16 sovereign-section">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="sec-tag gold fu d1 text-center">{t('updated_live', 'Updated live')}</div>
          <div className="flex items-center justify-center gap-4 mb-4 fu d2">
            <div style={{ fontSize: 36, lineHeight: 1 }}>🏆</div>
            <h1 className="sec-title mb-0">
              {t('leaderboard', 'Leaderboard')}
            </h1>
          </div>
          <p className="sec-sub mx-auto fu d3">
            Top {total} GSTD node operators and holders on the network.
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
            <span className="font-bold tracking-widest uppercase text-xs">Syncing Swarm...</span>
          </div>
        ) : data.length === 0 ? (
          <div className="text-center text-gray-500 py-20 fu d5 font-bold">No active nodes found</div>
        ) : (
          <div className="space-y-3 fu d5">
            {data.map((entry, i) => (
              <div
                key={entry.rank}
                className={`sov-card flex items-center gap-4 !p-4 transition-all !duration-200 hover:scale-[1.02] ${getRankColor(entry.rank)}`}
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
          <p>Total active nodes: {total} · Wallet addresses truncated for privacy</p>
          <p className="mt-1">Don't see your node? Connect and start earning GSTD!</p>
        </div>

        {/* Join CTA */}
        <div className="mt-8 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6 text-center">
          <div className="text-2xl mb-2">🌐</div>
          <div className="font-bold text-violet-300 mb-1">Join the Network</div>
          <div className="text-gray-400 text-sm mb-4">
            Run a node and earn GSTD on every AI inference request routed through your machine.
            Earnings depend on your hardware tier and network demand.
          </div>
          <div className="flex gap-3 justify-center flex-wrap">
            <a
              href="https://t.me/gstdaibot"
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2.5 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-300 font-bold text-sm hover:bg-amber-400/20 transition-all"
            >
              📱 Launch Mobile Node
            </a>
            <a
              href="/nodes"
              className="px-5 py-2.5 rounded-xl border border-white/10 text-gray-300 font-bold text-sm hover:border-white/20 transition-all"
            >
              🖥 Desktop Setup
            </a>
          </div>
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
