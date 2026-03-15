import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import EcosystemNav from '../components/layout/EcosystemNav';
import { Trophy, Crown, Medal, Award, RefreshCw } from 'lucide-react';
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
    if (rank === 1) return <Crown className="text-yellow-400" size={20} />;
    if (rank === 2) return <Medal className="text-gray-300" size={18} />;
    if (rank === 3) return <Medal className="text-amber-600" size={18} />;
    if (rank <= 10) return <Award className="text-violet-400" size={16} />;
    return <span className="text-gray-500 text-sm font-mono">#{rank}</span>;
  };

  const getRankColor = (rank: number) => {
    if (rank === 1) return 'border-yellow-400/30 bg-yellow-400/[0.03]';
    if (rank === 2) return 'border-gray-300/20 bg-gray-300/[0.02]';
    if (rank === 3) return 'border-amber-600/20 bg-amber-600/[0.02]';
    if (rank <= 10) return 'border-violet-400/10 bg-violet-400/[0.01]';
    return 'border-white/5 bg-white/[0.01]';
  };

  return (
    <div className="min-h-screen bg-[#030014] text-white">
      <Head>
        <title>Leaderboard — GSTD Ecosystem</title>
        <meta name="description" content="Top GSTD token holders leaderboard. See who leads the decentralized AI network." />
      </Head>
      <EcosystemNav />

      <main className="max-w-3xl mx-auto px-4 pt-20 pb-16">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Trophy className="text-yellow-400" size={28} />
            <h1 className="text-3xl font-extrabold bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500 bg-clip-text text-transparent">
              {t('leaderboard', 'Leaderboard')}
            </h1>
          </div>
          <p className="text-gray-400 text-sm">
            Top {total} GSTD holders · {t('updated_live', 'Updated live')}
          </p>
          <button
            onClick={fetchLeaderboard}
            className="mt-3 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white border border-white/10 hover:border-white/20 transition-all"
          >
            <RefreshCw size={12} className={`inline mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {/* Leaderboard */}
        {loading ? (
          <div className="text-center text-gray-500 py-20">
            <RefreshCw className="animate-spin mx-auto mb-3" size={24} />
            Loading...
          </div>
        ) : data.length === 0 ? (
          <div className="text-center text-gray-500 py-20">No data yet</div>
        ) : (
          <div className="space-y-2">
            {data.map((entry) => (
              <div
                key={entry.rank}
                className={`flex items-center gap-4 p-3 rounded-xl border transition-all hover:scale-[1.01] ${getRankColor(entry.rank)}`}
              >
                <div className="w-10 flex justify-center">{getRankIcon(entry.rank)}</div>
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-sm text-gray-300 truncate block">
                    {entry.wallet}
                  </span>
                </div>
                <div className="text-right">
                  <span className={`font-bold text-sm ${entry.rank <= 3 ? 'text-yellow-400' : 'text-white'}`}>
                    {entry.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-gray-500 text-xs ml-1">GSTD</span>
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
