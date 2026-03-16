import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import EcosystemNav from '../components/layout/EcosystemNav';
import { RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '../lib/config';

interface LeaderboardEntry {
  rank: number;
  wallet: string;
  balance: number;
}

export default function LeaderboardPage() {
  const { t } = useTranslation('common');
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/leaderboard`);
      if (res.ok) {
        const json = await res.json();
        setData(json.leaderboard || []);
        setTotal(json.total || 0);
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
      <EcosystemNav />

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
                    {entry.wallet}
                  </span>
                </div>
                <div className="text-right flex flex-col items-end">
                  <span className={`font-black text-lg sm:text-xl leading-none ${entry.rank <= 3 ? 'text-amber-400' : 'text-white'}`}>
                    {entry.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-cyan-400/60 text-[10px] font-bold uppercase tracking-wider mt-1">GSTD</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bottom stats */}
        <div className="mt-10 text-center text-gray-500 text-xs">
          <p>Total holders: {total} · Wallet addresses truncated for privacy</p>
          <p className="mt-1">Don't see your wallet? Connect and start earning GSTD!</p>
        </div>
      </main>
    </div>
  );
}

export async function getStaticProps({ locale }: { locale: string }) {
  return {
    props: { ...(await serverSideTranslations(locale ?? 'en', ['common'])) },
  };
}
