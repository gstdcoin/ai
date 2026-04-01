import { GetStaticProps } from 'next';
import { useTranslation } from 'next-i18next';
import { getCommonStaticProps } from '../lib/i18n-static-props';
import { useState, useEffect, useCallback, startTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '../lib/config';

interface NetworkSection { active_workers?: number; total_hashrate?: number; gstd_price_usd?: number; total_tasks?: number; total_users?: number; total_nodes?: number; }
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
  health?: any;
}

const getSettledValue = <T,>(result: PromiseSettledResult<T>): T | null =>
  result.status === 'fulfilled' ? result.value : null;

type StatCardProps = Readonly<{
  label: string;
  value: string | number;
  color?: string;
  sub?: string;
}>;

function StatCard({
  label,
  value,
  color = 'text-white',
  sub = '',
}: StatCardProps) {
  return (
    <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/8">
      <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-xl font-black tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-[9px] text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function PublicStats() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const endpoints = [
      'network/stats', 'sovereign/tokenomics', 'nodes/rewards/network',
      'burn/stats', 'health',
    ];
    const results = await Promise.allSettled(
      endpoints.map((ep) => fetch(`${API_BASE_URL}/api/v1/${ep}`).then((r) => (r.ok ? r.json() : null)))
    );
    const networkData = getSettledValue<any>(results[0]);
    const tokenomicsData = getSettledValue<any>(results[1]);
    const nodesData = getSettledValue<any>(results[2]);
    const burnData = getSettledValue<any>(results[3]);
    const healthData = getSettledValue<any>(results[4]);

    // Merge health data for more accurate/current values
    const hTokenomics = healthData?.tokenomics;
    const hNetwork = healthData?.network;
    const hRewards = healthData?.rewards;

    setStats({
      network: networkData,
      pool: { xaut_balance: networkData?.gold_reserve || 0, gstd_balance: hTokenomics?.circulating || tokenomicsData?.circulating_supply || 0 },
      pipeline: { online_nodes: hNetwork?.online_nodes || nodesData?.online_nodes || 0, total_vram_gb: 0 },
      security: null,
      federated: null,
      mobile: null,
      recycling: {
        total_burned: hTokenomics?.total_burned || tokenomicsData?.total_burned || burnData?.total_burned || 0,
        effective_supply: hTokenomics?.max_supply || tokenomicsData?.remaining_supply || 1e9,
        total_recycled: hTokenomics?.total_minted || tokenomicsData?.total_minted || 0,
        total_to_miners: hRewards?.all_time_gstd || (tokenomicsData?.total_minted ? tokenomicsData.total_minted * 0.93 : 0),
        total_to_reserve: networkData?.gold_reserve || 0,
      },
      airlock: null,
      openclaw: null,
      tokenomics: { ...tokenomicsData, ...hTokenomics, epoch: hTokenomics?.epoch || tokenomicsData?.epoch, burn_rate_pct: hTokenomics?.burn_rate_pct || tokenomicsData?.burn_rate_pct },
      nodes: { ...nodesData, total_nodes: hNetwork?.total_nodes || nodesData?.total_nodes || networkData?.total_nodes, online_nodes: hNetwork?.online_nodes || nodesData?.online_nodes || 0 },
      health: healthData,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void fetchAll();
    });
    const i = setInterval(() => {
      void fetchAll();
    }, 30000);
    return () => clearInterval(i);
  }, [fetchAll]);

  const changeLanguage = () => {
    router.push(router.pathname, router.asPath, { locale: router.locale === 'ru' ? 'en' : 'ru' });
  };

  return (
    <div className="min-h-screen bg-[#030014] text-white">
      {/* Header */}
      <header className="py-3 px-6 border-b border-white/5 backdrop-blur-xl bg-black/20">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="GSTD" width={28} height={28} className="rounded-full" />
            <span className="text-sm font-bold bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">GSTD</span>
            <span className="text-xs text-gray-500 font-medium">/ {t('stats', 'Statistics') || 'Network Stats'}</span>
          </Link>
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

      <main className="max-w-6xl mx-auto px-6 py-8 sovereign-section">
        <div className="sec-tag cyan fu d1">{t('public_dash_title', 'GSTD Network — Live Dashboard') || 'GSTD Network — Live Dashboard'}</div>
        <h1 className="sec-title fu d2">Real-Time Telemetry</h1>
        
        {/* Golden Reserve Hero */}
        <div className="p-8 rounded-3xl bg-gradient-to-br from-amber-400/10 via-amber-900/10 to-transparent border border-amber-500/20 mb-10 fu d3 shadow-[0_8px_32px_rgba(255,215,0,0.1)] backdrop-blur-md">
          <div className="flex items-center gap-3 mb-6">
            <div style={{ fontSize: 32, lineHeight: 1 }}>🥇</div>
            <h2 className="text-2xl font-black text-white">{t('gold_reserve_title', 'Gold Reserve Fund') || 'Golden Reserve'}</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <StatCard label="XAUt Reserve" value={stats?.pool?.xaut_balance?.toFixed(6) || '0.000000'} color="text-amber-400" />
            <StatCard label="Circulating" value={stats?.pool?.gstd_balance?.toFixed(0) || '0'} color="text-violet-400" />
            <StatCard label={t('gold_reserve_burned', 'Total Burned') || 'Total Burned'} value={stats?.recycling?.total_burned?.toFixed(4) || '0'} color="text-red-400" />
            <StatCard label="Remaining Supply" value={((stats?.recycling?.effective_supply || 1e9) / 1e9).toFixed(3) + 'B'} color="text-emerald-400" sub="of 1B" />
          </div>
        </div>

        {/* Infrastructure Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10 fu d4">
          {/* Node Network */}
          <div className="sov-card cyan-top p-6">
            <div className="flex items-center gap-2 mb-4"><div style={{ fontSize: 18, lineHeight: 1 }}>📡</div><span className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('network', 'Network')}</span></div>
            <StatCard label="Total Nodes" value={stats?.nodes?.total_nodes || stats?.network?.active_workers || 0} color="text-cyan-400" />
            <div className="mt-4 pt-4 border-t border-white/[0.06]"><StatCard label="Online Now" value={stats?.nodes?.online_nodes || 0} color="text-emerald-400" /></div>
          </div>

          {/* Tokenomics */}
          <div className="sov-card violet-top p-6">
            <div className="flex items-center gap-2 mb-4"><div style={{ fontSize: 18, lineHeight: 1 }}>⚡</div><span className="text-xs font-bold uppercase tracking-wider text-gray-400">Tokenomics</span></div>
            <StatCard label="Total Minted" value={stats?.tokenomics?.total_minted?.toFixed(0) || '0'} color="text-violet-400" sub="GSTD" />
            <div className="mt-4 pt-4 border-t border-white/[0.06]"><StatCard label="Epoch" value={stats?.tokenomics?.epoch || 1} color="text-cyan-400" sub={`Halving in ${stats?.tokenomics?.next_halving_in_days || '?'}d`} /></div>
          </div>

          {/* Node Rewards */}
          <div className="sov-card emerald-top p-6">
            <div className="flex items-center gap-2 mb-4"><div style={{ fontSize: 18, lineHeight: 1 }}>💎</div><span className="text-xs font-bold uppercase tracking-wider text-gray-400">Node Rewards</span></div>
            <StatCard label="Today" value={`${(stats?.nodes?.today_rewards_gstd || 0).toFixed(2)} GSTD`} color="text-emerald-400" />
            <div className="mt-4 pt-4 border-t border-white/[0.06]"><StatCard label="All-Time" value={`${(stats?.nodes?.total_rewards_gstd || 0).toFixed(2)} GSTD`} color="text-amber-400" /></div>
          </div>

          {/* Price */}
          <div className="sov-card gold-top p-6">
            <div className="flex items-center gap-2 mb-4"><div style={{ fontSize: 18, lineHeight: 1 }}>📈</div><span className="text-xs font-bold uppercase tracking-wider text-gray-400">Market</span></div>
            <StatCard label="GSTD Price" value={stats?.network?.gstd_price_usd ? `$${stats.network.gstd_price_usd.toFixed(6)}` : '$0'} color="text-amber-400" />
            <div className="mt-4 pt-4 border-t border-white/[0.06]"><StatCard label="Tasks" value={stats?.network?.total_tasks || 0} color="text-cyan-400" /></div>
          </div>

          {/* Supply */}
          <div className="sov-card cyan-top p-6">
            <div className="flex items-center gap-2 mb-4"><div style={{ fontSize: 18, lineHeight: 1 }}>🌐</div><span className="text-xs font-bold uppercase tracking-wider text-gray-400">Supply</span></div>
            <StatCard label="Circulating" value={stats?.tokenomics?.circulating_supply?.toFixed(0) || '0'} color="text-cyan-400" sub="GSTD" />
            <div className="mt-4 pt-4 border-t border-white/[0.06]"><StatCard label="Remaining" value={`${((stats?.tokenomics?.remaining_supply || 1e9) / 1e9).toFixed(3)}B`} color="text-violet-400" sub={`${(stats?.tokenomics?.supply_mined_pct || 0).toFixed(4)}% mined`} /></div>
          </div>

          {/* Base Reward */}
          <div className="sov-card amber-top p-6">
            <div className="flex items-center gap-2 mb-4"><div style={{ fontSize: 18, lineHeight: 1 }}>⛏️</div><span className="text-xs font-bold uppercase tracking-wider text-gray-400">Mining</span></div>
            <StatCard label="Base/Hour" value={`${stats?.tokenomics?.base_reward_per_hour || 0} GSTD`} color="text-amber-400" />
            <div className="mt-4 pt-4 border-t border-white/[0.06]"><StatCard label="Burn Rate" value={`${stats?.tokenomics?.burn_rate_pct || 2}%`} color="text-red-400" sub="deflationary" /></div>
          </div>
        </div>

        {/* Token Economy */}
        <div className="sov-card p-8 mb-10 fu d5 bg-gradient-to-br from-violet-500/5 to-transparent">
          <div className="flex items-center gap-3 mb-6"><div style={{ fontSize: 24, lineHeight: 1 }}>🏛️</div><h3 className="text-xl font-bold uppercase tracking-wider text-white border-b border-white/10 pb-4 w-full">{t('token_economy', 'Token Economy')}</h3></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <StatCard label="Total Minted" value={`${(stats?.tokenomics?.total_minted || 0).toFixed(0)}`} color="text-cyan-400" sub="GSTD" />
            <StatCard label="To Node Operators" value={`${(stats?.health?.rewards?.all_time_gstd || stats?.nodes?.total_rewards_gstd || 0).toFixed(2)}`} color="text-emerald-400" sub="GSTD" />
            <StatCard label="Gold Reserve" value={`${(stats?.pool?.xaut_balance || 0).toFixed(6)}`} color="text-amber-400" sub="XAUt" />
            <StatCard label="Burned 🔥" value={`${(stats?.recycling?.total_burned || 0).toFixed(4)}`} color="text-red-400" sub="forever" />
          </div>
        </div>

        {/* Live Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10 fu d6">
          {/* Active Workers */}
          <div className="sov-card emerald-top p-6">
            <div className="flex items-center gap-2 mb-4"><div style={{ fontSize: 18, lineHeight: 1 }}>⚡</div><span className="text-xs font-bold uppercase tracking-wider text-gray-400">Workers</span></div>
            <StatCard label="Active Workers" value={stats?.health?.network?.active_workers || 0} color="text-emerald-400" />
            <div className="mt-4 pt-4 border-t border-white/[0.06]"><StatCard label="Users" value={stats?.health?.network?.total_users || stats?.network?.total_users || 0} color="text-cyan-400" /></div>
          </div>

          {/* Staking */}
          <div className="sov-card violet-top p-6">
            <div className="flex items-center gap-2 mb-4"><div style={{ fontSize: 18, lineHeight: 1 }}>🔒</div><span className="text-xs font-bold uppercase tracking-wider text-gray-400">Staking</span></div>
            <StatCard label="Total Staked" value={`${(stats?.health?.tokenomics?.total_staked || stats?.tokenomics?.total_staked || 0).toFixed(2)} GSTD`} color="text-violet-400" />
            <div className="mt-4 pt-4 border-t border-white/[0.06]"><StatCard label="Active Stakers" value={stats?.health?.tokenomics?.active_stakers || 0} color="text-cyan-400" /></div>
          </div>

          {/* Revenue & Platform */}
          <div className="sov-card gold-top p-6">
            <div className="flex items-center gap-2 mb-4"><div style={{ fontSize: 18, lineHeight: 1 }}>🤖</div><span className="text-xs font-bold uppercase tracking-wider text-gray-400">Autonomy</span></div>
            <StatCard label="AI Departments" value={stats?.health?.autonomy?.departments || 9} color="text-amber-400" sub="active 24/7" />
            <div className="mt-4 pt-4 border-t border-white/[0.06]"><StatCard label="Today Rewards" value={`${(stats?.health?.rewards?.today_gstd || 0).toFixed(2)} GSTD`} color="text-emerald-400" />
            </div>
          </div>
        </div>


      </main>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: await getCommonStaticProps(locale),
});
