import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { Shield, Globe, Activity, Zap, Brain, Server, Flame, RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '../lib/config';

interface NetworkSection { active_workers?: number; total_hashrate?: number; }
interface PoolSection { xaut_balance?: number; gstd_balance?: number; }
interface PipelineSection { online_nodes?: number; total_vram_gb?: number; }
interface SecuritySection { defense_layers?: number; blocked_requests?: number; }
interface FederatedSection { total_brain_updates?: number; unique_contributors?: number; }
interface MobileSection { active_sessions?: number; npu_devices?: number; }
interface RecyclingSection {
  total_burned?: number;
  effective_supply?: number;
  total_recycled?: number;
  total_to_miners?: number;
  total_to_reserve?: number;
}
interface AirlockSection { total_sessions?: number; completed?: number; }
interface OpenclawSection { online_agents?: number; total_earned?: number; }

interface Stats {
  network: NetworkSection | null;
  pool: PoolSection | null;
  pipeline: PipelineSection | null;
  security: SecuritySection | null;
  federated: FederatedSection | null;
  mobile: MobileSection | null;
  recycling: RecyclingSection | null;
  airlock: AirlockSection | null;
  openclaw: OpenclawSection | null;
  tokenomics?: any;
  nodes?: any;
}

const getSettledValue = <T,>(result: PromiseSettledResult<T>): T | null =>
  result.status === 'fulfilled' ? result.value : null;

export default function PublicStats() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const endpoints = [
      'network/stats', 'sovereign/tokenomics', 'nodes/rewards/network',
      'burn/stats',
    ];
    const results = await Promise.allSettled(
      endpoints.map((ep) => fetch(`${API_BASE_URL}/api/v1/${ep}`).then((r) => (r.ok ? r.json() : null)))
    );
    const networkData = getSettledValue<any>(results[0]);
    const tokenomicsData = getSettledValue<any>(results[1]);
    const nodesData = getSettledValue<any>(results[2]);
    const burnData = getSettledValue<any>(results[3]);
    setStats({
      network: networkData,
      pool: { xaut_balance: networkData?.gold_reserve || 0, gstd_balance: tokenomicsData?.circulating_supply || 0 },
      pipeline: { online_nodes: nodesData?.online_nodes || 0, total_vram_gb: 0 },
      security: null,
      federated: null,
      mobile: null,
      recycling: {
        total_burned: burnData?.total_burned || 0,
        effective_supply: burnData?.current_supply || 1e9,
        total_recycled: tokenomicsData?.total_minted || 0,
        total_to_miners: tokenomicsData?.total_minted ? tokenomicsData.total_minted * 0.93 : 0,
        total_to_reserve: networkData?.gold_reserve || 0,
      },
      airlock: null,
      openclaw: null,
      tokenomics: tokenomicsData,
      nodes: nodesData,
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); const i = setInterval(fetchAll, 30000); return () => clearInterval(i); }, [fetchAll]);

  const changeLanguage = () => {
    router.push(router.pathname, router.asPath, { locale: router.locale === 'ru' ? 'en' : 'ru' });
  };

  const S = ({ label, value, color = 'text-white', sub = '' }: { label: string; value: string | number; color?: string; sub?: string }) => (
    <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/8">
      <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-xl font-black tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-[9px] text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#030014] text-white">
      {/* Header */}
      <header className="py-3 px-6 border-b border-white/5 backdrop-blur-xl bg-black/20">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <a href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="GSTD" width={28} height={28} className="rounded-full" />
            <span className="text-sm font-bold bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">GSTD</span>
            <span className="text-xs text-gray-500 font-medium">/ {t('stats', 'Statistics') || 'Network Stats'}</span>
          </a>
          <div className="flex items-center gap-3">
            <button onClick={fetchAll} disabled={loading} className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-white transition-all disabled:opacity-50">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={changeLanguage} className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-medium">
              {router.locale === 'ru' ? 'EN' : 'RU'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-black mb-6 tracking-tight">{t('public_dash_title', 'GSTD Network — Live Dashboard') || 'GSTD Network — Live Dashboard'}</h1>

        {/* Golden Reserve Hero */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-900/10 via-yellow-900/5 to-transparent border border-amber-500/20 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-6 h-6 text-amber-400" />
            <h2 className="text-lg font-black">{t('gold_reserve_title', 'Gold Reserve Fund') || 'Golden Reserve'}</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <S label="XAUt Reserve" value={stats?.pool?.xaut_balance?.toFixed(6) || '0.000000'} color="text-amber-400" />
            <S label="Circulating" value={stats?.pool?.gstd_balance?.toFixed(0) || '0'} color="text-violet-400" />
            <S label={t('gold_reserve_burned', 'Total Burned') || 'Total Burned'} value={stats?.recycling?.total_burned?.toFixed(4) || '0'} color="text-red-400" />
            <S label="Effective Supply" value={((stats?.recycling?.effective_supply || 1e9) / 1e6).toFixed(1) + 'M'} color="text-emerald-400" sub="of 1B" />
          </div>
        </div>

        {/* Infrastructure Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {/* Node Network */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/8">
            <div className="flex items-center gap-2 mb-3"><Globe className="w-4 h-4 text-cyan-400" /><span className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('network', 'Network')}</span></div>
            <S label="Total Nodes" value={stats?.nodes?.total_nodes || stats?.network?.active_workers || 0} color="text-cyan-400" />
            <div className="mt-3"><S label="Online Now" value={stats?.nodes?.online_nodes || 0} color="text-emerald-400" /></div>
          </div>

          {/* Tokenomics */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/8">
            <div className="flex items-center gap-2 mb-3"><Zap className="w-4 h-4 text-violet-400" /><span className="text-xs font-bold uppercase tracking-wider text-gray-400">Tokenomics</span></div>
            <S label="Total Minted" value={stats?.tokenomics?.total_minted?.toFixed(0) || '0'} color="text-violet-400" sub="GSTD" />
            <div className="mt-3"><S label="Epoch" value={stats?.tokenomics?.epoch || 1} color="text-cyan-400" sub={`Halving in ${stats?.tokenomics?.next_halving_in_days || '?'}d`} /></div>
          </div>

          {/* Node Rewards */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/8">
            <div className="flex items-center gap-2 mb-3"><Shield className="w-4 h-4 text-emerald-400" /><span className="text-xs font-bold uppercase tracking-wider text-gray-400">Node Rewards</span></div>
            <S label="Today" value={`${(stats?.nodes?.today_rewards_gstd || 0).toFixed(2)} GSTD`} color="text-emerald-400" />
            <div className="mt-3"><S label="All-Time" value={`${(stats?.nodes?.total_rewards_gstd || 0).toFixed(2)} GSTD`} color="text-amber-400" /></div>
          </div>

          {/* Price */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/8">
            <div className="flex items-center gap-2 mb-3"><Activity className="w-4 h-4 text-fuchsia-400" /><span className="text-xs font-bold uppercase tracking-wider text-gray-400">Market</span></div>
            <S label="GSTD Price" value={stats?.network?.gstd_price_usd ? `$${stats.network.gstd_price_usd.toFixed(6)}` : '$0'} color="text-fuchsia-400" />
            <div className="mt-3"><S label="Tasks" value={stats?.network?.total_tasks || 0} color="text-cyan-400" /></div>
          </div>

          {/* Supply */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/8">
            <div className="flex items-center gap-2 mb-3"><Brain className="w-4 h-4 text-blue-400" /><span className="text-xs font-bold uppercase tracking-wider text-gray-400">Supply</span></div>
            <S label="Circulating" value={stats?.tokenomics?.circulating_supply?.toFixed(0) || '0'} color="text-blue-400" sub="GSTD" />
            <div className="mt-3"><S label="Remaining" value={`${((stats?.tokenomics?.remaining_supply || 1e9) / 1e6).toFixed(1)}M`} color="text-violet-400" sub={`${(stats?.tokenomics?.supply_mined_pct || 0).toFixed(4)}% mined`} /></div>
          </div>

          {/* Base Reward */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/8">
            <div className="flex items-center gap-2 mb-3"><Server className="w-4 h-4 text-amber-400" /><span className="text-xs font-bold uppercase tracking-wider text-gray-400">Mining</span></div>
            <S label="Base/Hour" value={`${stats?.tokenomics?.base_reward_per_hour || 0} GSTD`} color="text-amber-400" />
            <div className="mt-3"><S label="Burn Rate" value={`${stats?.tokenomics?.burn_rate_pct || 5}%`} color="text-red-400" sub="deflationary" /></div>
          </div>
        </div>

        {/* Token Economy */}
        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/8 mb-6">
          <div className="flex items-center gap-2 mb-3"><Flame className="w-4 h-4 text-orange-400" /><span className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('token_economy', 'Token Economy')}</span></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <S label="Total Minted" value={`${(stats?.tokenomics?.total_minted || 0).toFixed(0)}`} color="text-cyan-400" sub="GSTD" />
            <S label="To Node Operators" value={`${(stats?.nodes?.total_rewards_gstd || 0).toFixed(2)}`} color="text-emerald-400" sub="GSTD" />
            <S label="Gold Reserve" value={`${(stats?.pool?.xaut_balance || 0).toFixed(6)}`} color="text-amber-400" sub="XAUt" />
            <S label="Burned 🔥" value={`${(stats?.recycling?.total_burned || 0).toFixed(4)}`} color="text-red-400" sub="forever" />
          </div>
        </div>


      </main>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: { ...(await serverSideTranslations(locale ?? 'en', ['common'])) },
});
