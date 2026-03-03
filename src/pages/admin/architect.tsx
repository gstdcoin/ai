import { GetServerSideProps } from 'next';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import { apiGet } from '../../lib/apiClient';
import { Activity, Shield, Zap, Coins, Server, ArrowLeft, Trophy } from 'lucide-react';

interface ArchitectNetwork {
  active_nodes: number;
  completed_tasks: number;
  total_burned_gstd: number;
  golden_reserve_oz: number;
  total_gstd_paid: number;
  health: string;
}

interface ArchitectParams {
  platform_fee_percent: number;
  admin_wallet: string;
  treasury_wallet: string;
}

interface ArchitectVision {
  nodes_influx_7d: number;
  tasks_completed_7d: number;
  tasks_per_node_ratio: number;
  projected_nodes_30d: number;
  estimated_iq_growth_30d: number;
  message: string;
}

interface AgentsLeaderboardEntry {
  rank: number;
  wallet: string;
  total_gstd: number;
  period: string;
}

export default function ArchitectPage() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { address, isConnected } = useWalletStore();
  const [network, setNetwork] = useState<ArchitectNetwork | null>(null);
  const [params, setParams] = useState<ArchitectParams | null>(null);
  const [vision, setVision] = useState<ArchitectVision | null>(null);
  const [leaderboard, setLeaderboard] = useState<AgentsLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) {
      router.push('/');
      return;
    }

    const load = async () => {
      try {
        const [net, prm, vis, lb] = await Promise.all([
          apiGet<ArchitectNetwork>('/admin/architect/network'),
          apiGet<ArchitectParams>('/admin/architect/params'),
          apiGet<ArchitectVision>('/admin/architect/vision'),
          apiGet<{ leaderboard: AgentsLeaderboardEntry[] }>('/admin/agents/leaderboard?limit=10').catch(() => ({ leaderboard: [] })),
        ]);
        setNetwork(net);
        setParams(prm);
        setVision(vis);
        setLeaderboard(lb?.leaderboard ?? []);
      } catch (e: any) {
        setError(e?.message || 'Access denied. Admin wallet required.');
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [isConnected, address, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#030014] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#030014] flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <Shield className="w-16 h-16 text-amber-500/50 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">{t('architect_access', 'Architect Access')}</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 rounded-xl bg-white/10 text-white font-bold hover:bg-white/20 transition-colors"
          >{t('back_to_home', 'Back to Home')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030014] text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-black">{t('architect_masterdashboard', 'Architect Master-Dashboard')}</h1>
              <p className="text-sm text-gray-500">Infrastructure Supremacy • Network Health</p>
            </div>
          </div>
          <div className="px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-sm font-bold">
            {network?.health || '—'}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <div className="glass-card p-6 border-cyan-500/20">
            <div className="flex items-center gap-3 mb-4">
              <Server className="w-8 h-8 text-cyan-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{t('active_nodes', 'Active Nodes')}</span>
            </div>
            <p className="text-3xl font-black text-white">{network?.active_nodes ?? '—'}</p>
          </div>
          <div className="glass-card p-6 border-emerald-500/20">
            <div className="flex items-center gap-3 mb-4">
              <Activity className="w-8 h-8 text-emerald-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{t('completed_tasks', 'Completed Tasks')}</span>
            </div>
            <p className="text-3xl font-black text-white">{(network?.completed_tasks ?? 0).toLocaleString()}</p>
          </div>
          <div className="glass-card p-6 border-amber-500/20">
            <div className="flex items-center gap-3 mb-4">
              <Coins className="w-8 h-8 text-amber-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{t('golden_reserve_oz', 'Golden Reserve (oz)')}</span>
            </div>
            <p className="text-3xl font-black text-amber-400">{(network?.golden_reserve_oz ?? 0).toFixed(4)}</p>
          </div>
          <div className="glass-card p-6 border-violet-500/20">
            <div className="flex items-center gap-3 mb-4">
              <Zap className="w-8 h-8 text-violet-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{t('total_gstd_paid', 'Total GSTD Paid')}</span>
            </div>
            <p className="text-3xl font-black text-white">{(network?.total_gstd_paid ?? 0).toFixed(2)}</p>
          </div>
          <div className="glass-card p-6 border-red-500/20">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-4">{t('total_burned', 'Total Burned')}</span>
            <p className="text-3xl font-black text-red-400">{(network?.total_burned_gstd ?? 0).toFixed(2)} GSTD</p>
          </div>
        </div>

        {/* Eternal Synergy: Top-10 Agents by GSTD Contribution (7d) */}
        {leaderboard.length > 0 && (
          <div className="glass-card p-6 border-amber-500/20 mb-8">
            <h3 className="text-lg font-bold text-amber-400 mb-4 flex items-center gap-2">
              <Trophy size={20} />
              Top-10 Agents (7d)
            </h3>
            <p className="text-sm text-gray-500 mb-4">By GSTD economy contribution — workers + referrers</p>
            <div className="space-y-2">
              {leaderboard.map((e) => (
                <div key={e.wallet} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02] hover:bg-white/5">
                  <span className="text-sm font-mono text-gray-500 w-6">#{e.rank}</span>
                  <span className="text-sm font-mono text-gray-300 truncate flex-1 mx-2">{e.wallet?.slice(0, 8)}...{e.wallet?.slice(-6)}</span>
                  <span className="text-sm font-bold text-amber-400">{e.total_gstd.toFixed(4)} GSTD</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Architect's Vision: IQ Growth Forecast */}
        {vision && (
          <div className="glass-card p-6 border-amber-500/20 mb-8">
            <h3 className="text-lg font-bold text-amber-400 mb-4">Architect&apos;s Vision</h3>
            <p className="text-sm text-gray-400 mb-4">{vision.message}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <span className="text-[10px] text-gray-500 block">Node Influx (7d)</span>
                <span className="text-xl font-bold text-white">{vision.nodes_influx_7d}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-500 block">Tasks Completed (7d)</span>
                <span className="text-xl font-bold text-emerald-400">{vision.tasks_completed_7d}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-500 block">Projected Nodes (30d)</span>
                <span className="text-xl font-bold text-cyan-400">{vision.projected_nodes_30d}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-500 block">Estimated IQ Growth (30d)</span>
                <span className="text-xl font-bold text-amber-400">{vision.estimated_iq_growth_30d.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        <div className="glass-card p-6 border-white/10">
          <h3 className="text-lg font-bold text-white mb-4">{t('emission__commission_parameters', 'Emission & Commission Parameters')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-500 block">{t('platform_fee', 'Platform Fee')}</span>
              <span className="text-white font-bold">{params?.platform_fee_percent ?? '—'}%</span>
            </div>
            <div>
              <span className="text-gray-500 block">{t('admin_wallet', 'Admin Wallet')}</span>
              <span className="text-violet-400 font-mono text-xs break-all">{params?.admin_wallet?.slice(0, 12)}...{params?.admin_wallet?.slice(-8)}</span>
            </div>
            <div>
              <span className="text-gray-500 block">{t('treasury_wallet', 'Treasury Wallet')}</span>
              <span className="text-amber-400 font-mono text-xs break-all">{params?.treasury_wallet?.slice(0, 12)}...{params?.treasury_wallet?.slice(-8)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
  props: { ...(await serverSideTranslations(locale ?? 'en', ['common'])) },
});
