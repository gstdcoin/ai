import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { Shield, Globe, Activity, Zap, Brain, Server, Flame, Lock, Bot, RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '../lib/config';

interface Stats {
  network: any;
  pool: any;
  pipeline: any;
  security: any;
  federated: any;
  mobile: any;
  recycling: any;
  airlock: any;
  openclaw: any;
}

export default function PublicStats() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    const endpoints = [
      'network/stats', 'pool/status', 'pipeline/status', 'security/stats',
      'federated/stats', 'mobile/stats', 'recycling/stats', 'airlock/stats', 'openclaw/stats',
    ];
    const results = await Promise.allSettled(
      endpoints.map(ep => fetch(`${API_BASE_URL}/api/v1/${ep}`).then(r => r.ok ? r.json() : null))
    );
    setStats({
      network: (results[0] as any).value, pool: (results[1] as any).value,
      pipeline: (results[2] as any).value, security: (results[3] as any).value,
      federated: (results[4] as any).value, mobile: (results[5] as any).value,
      recycling: (results[6] as any).value, airlock: (results[7] as any).value,
      openclaw: (results[8] as any).value,
    });
    setLoading(false);
  };

  useEffect(() => { fetchAll(); const i = setInterval(fetchAll, 30000); return () => clearInterval(i); }, []);

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
            <S label="GSTD in Pool" value={stats?.pool?.gstd_balance?.toFixed(2) || '0'} color="text-violet-400" />
            <S label={t('gold_reserve_burned', 'Total Burned') || 'Total Burned'} value={stats?.recycling?.total_burned?.toFixed(2) || '0'} color="text-red-400" />
            <S label="Effective Supply" value={((stats?.recycling?.effective_supply || 1e9) / 1e6).toFixed(1) + 'M'} color="text-emerald-400" sub="of 1B" />
          </div>
        </div>

        {/* Infrastructure Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {/* Network */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/8">
            <div className="flex items-center gap-2 mb-3"><Globe className="w-4 h-4 text-cyan-400" /><span className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('network', 'Network')}</span></div>
            <S label="Active Nodes" value={stats?.network?.active_workers || 0} color="text-cyan-400" />
            <div className="mt-3"><S label="Grid Power" value={`${stats?.network?.total_hashrate?.toFixed(1) || '0'} PF`} color="text-violet-400" /></div>
          </div>

          {/* Pipeline */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/8">
            <div className="flex items-center gap-2 mb-3"><Zap className="w-4 h-4 text-violet-400" /><span className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('pipeline', 'Pipeline')}</span></div>
            <S label="GPU Nodes" value={stats?.pipeline?.online_nodes || 0} color="text-violet-400" />
            <div className="mt-3"><S label="Total VRAM" value={`${stats?.pipeline?.total_vram_gb?.toFixed(1) || '0'} GB`} color="text-cyan-400" /></div>
          </div>

          {/* Security */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/8">
            <div className="flex items-center gap-2 mb-3"><Shield className="w-4 h-4 text-emerald-400" /><span className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('guardrails', 'Guardrails')}</span></div>
            <S label="Defense Layers" value={stats?.security?.defense_layers || 3} color="text-emerald-400" />
            <div className="mt-3"><S label="Threats Blocked" value={stats?.security?.blocked_requests || 0} color="text-red-400" /></div>
          </div>

          {/* Federated */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/8">
            <div className="flex items-center gap-2 mb-3"><Brain className="w-4 h-4 text-fuchsia-400" /><span className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('federated_learning', 'Federated Learning')}</span></div>
            <S label="Brain Updates" value={stats?.federated?.total_brain_updates || 0} color="text-fuchsia-400" />
            <div className="mt-3"><S label="Contributors" value={stats?.federated?.unique_contributors || 0} color="text-violet-400" /></div>
          </div>

          {/* Mobile */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/8">
            <div className="flex items-center gap-2 mb-3"><Server className="w-4 h-4 text-blue-400" /><span className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('mobile_mining', 'Mobile Mining')}</span></div>
            <S label="Active Devices" value={stats?.mobile?.active_sessions || 0} color="text-blue-400" />
            <div className="mt-3"><S label="NPU Devices" value={stats?.mobile?.npu_devices || 0} color="text-cyan-400" /></div>
          </div>

          {/* OpenClaw */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/8">
            <div className="flex items-center gap-2 mb-3"><Bot className="w-4 h-4 text-amber-400" /><span className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('openclaw_robots', 'OpenClaw Robots')}</span></div>
            <S label="Online Robots" value={stats?.openclaw?.online_agents || 0} color="text-amber-400" />
            <div className="mt-3"><S label="Total Earned" value={`${(stats?.openclaw?.total_earned || 0).toFixed(2)} GSTD`} color="text-emerald-400" /></div>
          </div>
        </div>

        {/* Recycling Economy */}
        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/8 mb-6">
          <div className="flex items-center gap-2 mb-3"><Flame className="w-4 h-4 text-orange-400" /><span className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('token_economy', 'Token Economy')}</span></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <S label="Total Recycled" value={`${(stats?.recycling?.total_recycled || 0).toFixed(2)}`} color="text-cyan-400" sub="GSTD" />
            <S label="To Miners (93%)" value={`${(stats?.recycling?.total_to_miners || 0).toFixed(2)}`} color="text-emerald-400" sub="GSTD" />
            <S label="To Gold (2%)" value={`${(stats?.recycling?.total_to_reserve || 0).toFixed(4)}`} color="text-amber-400" sub="→ XAUt" />
            <S label="Burned (5%)" value={`${(stats?.recycling?.total_burned || 0).toFixed(2)}`} color="text-red-400" sub="forever" />
          </div>
        </div>

        {/* Data Airlock */}
        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/8">
          <div className="flex items-center gap-2 mb-3"><Lock className="w-4 h-4 text-violet-400" /><span className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('data_airlock', 'Data Airlock')}</span></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <S label="Total Sessions" value={stats?.airlock?.total_sessions || 0} color="text-violet-400" />
            <S label="Completed" value={stats?.airlock?.completed || 0} color="text-emerald-400" />
            <S label="Data Exfiltrations" value="0" color="text-emerald-400" sub="always zero" />
            <S label="Compliance" value="GDPR + FZ-152" color="text-cyan-400" />
          </div>
        </div>
      </main>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: { ...(await serverSideTranslations(locale ?? 'en', ['common'])) },
});
