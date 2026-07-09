import Image from 'next/image';
import Link from 'next/link';
import { GetStaticProps } from 'next';
import { useTranslation } from 'next-i18next';
import { getCommonStaticProps } from '../lib/i18n-static-props';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { NetworkMap } from '../components/dashboard/NetworkMap';
import { useWalletStore } from '../store/walletStore';
import { GSTD_CONTRACT_ADDRESS, API_BASE_URL } from '../lib/config';
import dynamic from 'next/dynamic';
import { Zap, Shield, Globe, Activity, Check, DollarSign, Workflow, Sparkles, Brain } from 'lucide-react';

// Components using useTonConnectUI must be client-only to avoid hydration mismatch
const SovereignSwitch = dynamic(() => import('../components/SovereignSwitch').then(m => ({ default: m.SovereignSwitch })), { ssr: false });
const WalletConnect = dynamic(() => import('../components/WalletConnect'), { ssr: false });

interface NetworkStats {
  active_workers: number;
  total_gstd_paid: number;
  tasks_24h: number;
  total_tasks: number;
  total_hashrate: number;
  treasury_balance: number;
  gstd_price_usd: number;
}

export default function About() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { isConnected } = useWalletStore();
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Animated stars
  const stars = useMemo(() => {
    if (!isClient) return [];
    return [...Array(40)].map((_, i) => ({
      id: i,
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      opacity: Math.random() * 0.6 + 0.2,
      delay: `${Math.random() * 4}s`,
      duration: `${2 + Math.random() * 3}s`,
      size: Math.random() > 0.8 ? 2 : 1,
    }));
  }, [isClient]);

  // Fetch network stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/network/stats`);
        if (res.ok) setNetworkStats(await res.json());
      } catch (_e) { /* silent */ }
    };
    if (!isConnected) fetchStats();
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, [isConnected]);

  const [publicNodes, setPublicNodes] = useState<any[]>([]);
  useEffect(() => {
    const fetchNodes = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/nodes/public`);
        if (res.ok) {
          const data = await res.json();
          setPublicNodes(data.nodes || []);
        }
      } catch (_e) { }
    };
    if (!isConnected) fetchNodes();
  }, [isConnected]);

  // Prevent flashing of landing page while checking connection
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    // Allow time for wallet restoration
    const timer = setTimeout(() => {
      setCheckingSession(false);
    }, 1000); // 1 second buffer
    return () => clearTimeout(timer);
  }, []);

  const changeLanguage = () => {
    router.push(router.pathname, router.asPath, { locale: router.locale === 'ru' ? 'en' : 'ru' });
  };

  // Redirect removed
  useEffect(() => {
    // No-op
  }, [isConnected, checkingSession, router]);

  // Show loading spinner only while checking session
  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#030014] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-500 opacity-50"></div>
      </div>
    );
  }


  // Landing Page - Elite Cosmic Premium Design
  return (
    <div className="min-h-screen bg-[#030014] text-white overflow-x-hidden">
      {/* Animated Cosmic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {/* Gradient Orbs */}
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-gradient-to-br from-violet-600/20 to-transparent rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-gradient-to-tl from-cyan-500/15 to-transparent rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-blue-600/5 via-purple-600/5 to-pink-600/5 rounded-full blur-[120px]" />

        {/* Grid Overlay */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0wIDBoNjB2NjBIMHoiLz48cGF0aCBkPSJNMzAgMzBtLTEgMGExIDEgMCAxIDAgMiAwYTEgMSAwIDEgMCAtMiAwIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDMpIi8+PC9nPjwvc3ZnPg==')] opacity-40" />

        {/* Animated Stars */}
        {stars.map((star) => (
          <div
            key={star.id}
            className="absolute rounded-full bg-white animate-pulse"
            style={{
              top: star.top,
              left: star.left,
              width: star.size,
              height: star.size,
              opacity: star.opacity,
              animationDelay: star.delay,
              animationDuration: star.duration
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <header className="py-5 px-6 lg:px-12 border-b border-white/5 backdrop-blur-xl bg-black/20">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Image src="/logo.png" alt="GSTD" width={40} height={40} className="rounded-full" />
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-violet-500 blur-lg opacity-50" />
              </div>
              <span className="text-xl font-bold tracking-tight">
                <span className="bg-gradient-to-r from-cyan-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">GSTD</span>
                <span className="text-white/80 ml-1">{t('platform', 'Platform')}</span>
              </span>
            </div>

            <div className="flex items-center gap-6">
              <nav className="hidden md:flex items-center gap-6 mr-2">
                <a href="#utility" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">
                  {t('nav_token', 'Token') || 'Token'}
                </a>
                <a href="#technology" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">
                  {t('nav_tech', 'Technology') || 'Technology'}
                </a>
                <a href="#agents" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">
                  {t('nav_agents', 'Agents') || 'Agents'}
                </a>
              </nav>

              <div className="flex items-center gap-4">
                <button
                  onClick={changeLanguage}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm font-medium"
                >
                  {router.locale === 'ru' ? 'EN' : 'RU'}
                </button>
                <WalletConnect />
              </div>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <section className="pt-20 pb-24 px-6 lg:px-12">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              {/* Status Badge */}
              <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 mb-8">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
                </span>
                <span className="text-sm font-medium text-emerald-300">
                  {t('network_live', 'Network Live') || 'Network Live'} — {networkStats?.active_workers || '—'} {t('workers_online', 'Workers Online') || 'Workers Online'}
                </span>
              </div>

              {/* Hero Title */}
              <h1 className="text-6xl sm:text-7xl lg:text-9xl font-black mb-8 tracking-tighter leading-[0.9] perspective-1000">
                <span className="block text-white opacity-95 drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">{t('hero_line1', 'Corporation-Free') || 'Corporation-Free'}</span>
                <span className="block bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent animate-gradient-x py-2">
                  {t('hero_line2', 'AI for Humanity') || 'AI Grid'}
                </span>
              </h1>

              {/* Subtitle */}
              <p className="text-xl sm:text-2xl text-gray-400 max-w-4xl mx-auto mb-12 leading-relaxed font-medium">
                {t('hero_subtitle', 'Working for the benefit of humanity. Join the ultimate decentralized AI network: connect your devices, join the swarm, and let corporations buy your compute. Use it like ChatGPT, but pay with GSTD.') || 'Working for the benefit of humanity. Join the ultimate decentralized AI network where users own their data, supply their compute to solve global crises, and participate in a sovereign economy free from corporate oversight.'}
              </p>

              {/* CTA Section - Simplified to focus on the Switch */}
              <div className="max-w-4xl mx-auto mb-16">
                <SovereignSwitch className="transform hover:scale-[1.01] transition-transform duration-500" />
              </div>

              {/* Stats & Activity Grid */}
              <div className="max-w-5xl mx-auto">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { value: networkStats?.active_workers ? networkStats.active_workers.toLocaleString() : '—', label: t('stat_nodes', 'Active Nodes') || 'Active Nodes', icon: Shield, color: 'emerald', delay: '0s' },
                    { value: networkStats?.total_tasks ? networkStats.total_tasks.toLocaleString() : '—', label: t('tasks_completed', 'Tasks Completed'), icon: Brain, color: 'violet', delay: '0.1s' },
                    { value: networkStats?.total_gstd_paid ? `${networkStats.total_gstd_paid.toFixed(0)} GSTD` : '—', label: t('gstd_distributed', 'GSTD Distributed'), icon: Activity, color: 'emerald', delay: '0.2s' },
                    { value: networkStats?.total_hashrate ? `${networkStats.total_hashrate.toFixed(1)} PFLOPS` : '—', label: t('grid_power', 'Grid Power'), icon: Zap, color: 'cyan', delay: '0.3s' },
                  ].map((stat, i) => (
                    <div key={i} className="relative group overflow-hidden" style={{ animationDelay: stat.delay }}>
                      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-violet-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="relative p-7 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl hover:border-white/30 transition-all text-left">
                        <stat.icon className={`w-6 h-6 text-${stat.color}-400 mb-4`} />
                        <div className="text-2xl sm:text-3xl font-black text-white mb-1 tracking-tighter">{stat.value}</div>
                        <div className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">{stat.label}</div>
                      </div>
                    </div>
                  ))}

                  {/* Trust Badge / Secondary Stats */}
                  <div className="col-span-2 md:col-span-4 p-8 rounded-3xl bg-gradient-to-r from-blue-600/10 to-violet-600/10 border border-blue-500/20 flex flex-wrap items-center justify-between gap-8 backdrop-blur-md">
                    <div className="flex items-center gap-4 group cursor-default">
                      <div className="w-14 h-14 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400 border border-blue-500/30 group-hover:scale-110 transition-transform">
                        <Shield className="w-7 h-7" />
                      </div>
                      <div>
                        <div className="text-white font-black tracking-tight uppercase text-sm">{t('non_custodial', 'Non-Custodial')}</div>
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('ton_wallet', 'TON Wallet Integrated')}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 group cursor-default">
                      <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 border border-emerald-500/30 group-hover:scale-110 transition-transform">
                        <Globe className="w-7 h-7" />
                      </div>
                      <div>
                        <div className="text-white font-black tracking-tight uppercase text-sm">{t('gstd_protocol', 'GSTD-Protocol')}</div>
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('depin_compute_network', 'DePIN Compute Network')}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 group cursor-default">
                      <div className="w-14 h-14 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-400 border border-amber-500/30 group-hover:scale-110 transition-transform">
                        <Sparkles className="w-7 h-7" />
                      </div>
                      <div>
                        <div className="text-white font-black tracking-tight uppercase text-sm">{t('a2a_standard', 'A2A Standard')}</div>
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('a2a_logic', 'Agent-to-Agent Logic')}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="technology" className="py-24 px-6 lg:px-12 border-t border-white/5">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                {t('why_gstd', 'Why GSTD Platform') || 'Why GSTD Platform'}
              </h2>
              <p className="text-gray-400 max-w-2xl mx-auto">
                {t('why_gstd_desc', 'Built for enterprises and developers who need reliable, secure, and scalable distributed computing infrastructure.') || 'Built for enterprises and developers who need reliable, secure, and scalable distributed computing infrastructure.'}
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: Zap,
                  title: t('feat_speed_title', 'Lightning Fast') || 'Lightning Fast',
                  desc: t('feat_speed_desc', '5-second average task completion with intelligent load balancing across global network nodes.') || '5-second average task completion with intelligent load balancing across global network nodes.',
                  gradient: 'from-amber-500 to-orange-600'
                },
                {
                  icon: Shield,
                  title: t('feat_secure_title', 'Enterprise Security') || 'Enterprise Security',
                  desc: t('feat_secure_desc', 'End-to-end AES-256-GCM encryption. Zero-knowledge execution. Your data never leaves your control.') || 'End-to-end AES-256-GCM encryption. Zero-knowledge execution. Your data never leaves your control.',
                  gradient: 'from-emerald-500 to-teal-600'
                },
                {
                  icon: Globe,
                  title: t('feat_scale_title', 'Infinite Scale') || 'Infinite Scale',
                  desc: t('feat_scale_desc', 'Horizontally scalable architecture. Add capacity on-demand with automatic load redistribution.') || 'Horizontally scalable architecture. Add capacity on-demand with automatic load redistribution.',
                  gradient: 'from-violet-500 to-purple-600'
                },
              ].map((feat, i) => (
                <div key={i} className="group relative">
                  <div className={`absolute inset-0 bg-gradient-to-br ${feat.gradient} rounded-2xl blur-xl opacity-0 group-hover:opacity-20 transition-opacity duration-500`} />
                  <div className="relative h-full p-8 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-white/20 transition-all">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feat.gradient} flex items-center justify-center mb-5`}>
                      <feat.icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-3">{feat.title}</h3>
                    <p className="text-gray-400 leading-relaxed">{feat.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* The Hive Segment - Agent Unity */}
        <section id="agents" className="py-24 px-6 lg:px-12 relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-violet-600/5 rounded-full blur-[120px] pointer-events-none" />
          <div className="max-w-6xl mx-auto relative z-10">
            <div className="flex flex-col md:flex-row items-center gap-16">
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-600/10 border border-violet-600/20 text-violet-400 text-[10px] font-black mb-6 uppercase tracking-[0.3em]">{t('collective_intelligence', 'Collective Intelligence')}</div>
                <h2 className="text-4xl md:text-6xl font-black text-white mb-6 tracking-tighter leading-tight">
                  The <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">{t('hive_memory', 'Hive Memory')}</span>
                </h2>
                <p className="text-gray-400 text-lg font-medium leading-relaxed mb-10">
                  While you work, you share. While you create, you consume. The Platform regulates this flow,
                  ensuring the collective intelligence grows with every transaction. Every AI request is routed to
                  the best available node — operators earn 90% of fees, 10% funds the ecosystem treasury.
                </p>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-white/[0.03] border border-white/10 group hover:border-violet-500/30 transition-all cursor-pointer" onClick={() => router.push('/hive')}>
                    <Brain className="text-violet-500 group-hover:scale-110 transition-transform" />
                    <span className="font-black text-sm uppercase tracking-tight">{t('sync_history', 'Sync History')}</span>
                  </div>
                  <div className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-white/[0.03] border border-white/10 group hover:border-cyan-500/30 transition-all cursor-pointer" onClick={() => router.push('/import')}>
                    <Workflow className="text-cyan-500 group-hover:scale-110 transition-transform" />
                    <span className="font-black text-sm uppercase tracking-tight">{t('skill_matrix', 'Skill Matrix')}</span>
                  </div>
                </div>
              </div>
              <div className="flex-1 w-full max-w-lg">
                <div className="relative p-2 rounded-[40px] bg-white/5 border border-white/10 backdrop-blur-xl shadow-2xl overflow-hidden">
                  <NetworkMap nodes={publicNodes} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* GSTD Utility Section */}
        <section id="utility" className="py-32 px-6 lg:px-12 border-t border-white/5">
          <div className="max-w-5xl mx-auto">
            <div className="relative p-12 lg:p-20 rounded-[48px] bg-gradient-to-br from-violet-600/[0.08] via-fuchsia-600/[0.08] to-cyan-600/[0.08] border border-white/10 overflow-hidden group">
              <div className="absolute top-0 right-0 w-96 h-96 bg-violet-600/5 rounded-full blur-[100px] -mr-48 -mt-48" />

              <div className="flex flex-col lg:flex-row items-center gap-16 relative z-10">
                <div className="flex-shrink-0 relative">
                  <div className="absolute inset-0 bg-white/20 blur-3xl rounded-full" />
                  <div className="w-32 h-32 rounded-[32px] bg-gradient-to-br from-violet-600/40 to-fuchsia-600/40 flex items-center justify-center backdrop-blur-md border border-white/20 shadow-2xl transform group-hover:rotate-12 transition-transform duration-700">
                    <DollarSign className="w-16 h-16 text-white" />
                  </div>
                </div>
                <div className="flex-1 text-center lg:text-left">
                  <div className="text-[10px] font-black text-violet-400 uppercase tracking-[0.5em] mb-6">{t('asset_spec', 'Asset Specification') || 'Asset Specification'}</div>
                  <h3 className="text-4xl lg:text-5xl font-black text-white mb-6 tracking-tighter">{t('utility_layer', 'GSTD Utility Layer') || 'GSTD Utility Layer'}</h3>
                  <p className="text-gray-400 mb-10 text-xl leading-relaxed font-medium">
                    {t('utility_desc', 'GSTD is the payment token for AI inference on the network. Pay for compute, earn by running nodes. 10% of every transaction funds the ecosystem treasury for buybacks and development.') || 'GSTD is the payment token for AI inference on the network. Pay for compute, earn by running nodes. 10% of every transaction funds the ecosystem treasury for buybacks and development.'}
                  </p>
                  <div className="flex flex-wrap justify-center lg:justify-start gap-4 mb-10">
                    <div className="px-5 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 text-[10px] font-black border border-emerald-500/30 uppercase tracking-widest flex items-center gap-2">
                      <Shield size={12} /> {t('ton_blockchain', 'TON Blockchain') || 'TON Blockchain'}
                    </div>
                    <div className="px-5 py-2 rounded-xl bg-blue-500/10 text-blue-400 text-[10px] font-black border border-blue-500/30 uppercase tracking-widest flex items-center gap-2">
                      <Zap size={12} /> {t('live_on_stonfi', 'Live on STON.fi') || 'Live on STON.fi'}
                    </div>
                    <div className="px-5 py-2 rounded-xl bg-violet-500/10 text-violet-400 text-[10px] font-black border border-violet-500/30 uppercase tracking-widest flex items-center gap-2">
                      <Check size={12} /> {t('utility_token', 'Utility Token') || 'Utility Token'}
                    </div>
                  </div>
                  <div className="p-6 rounded-2xl bg-black/40 border border-white/5 backdrop-blur-md group/contract cursor-pointer hover:border-cyan-500/30 transition-colors">
                    <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-2">{t('protocol_contract', 'Protocol Contract Address') || 'Protocol Contract Address'}</p>
                    <p className="text-sm text-gray-400 font-mono break-all group-hover:text-cyan-400 transition-colors">
                      {GSTD_CONTRACT_ADDRESS}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-16 px-6 lg:px-12 border-t border-white/5 bg-black/40">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
              {/* Brand */}
              <div className="md:col-span-2">
                <div className="flex items-center gap-3 mb-4">
                  <Image src="/logo.png" alt="GSTD" width={40} height={40} className="rounded-full" />
                  <span className="text-xl font-bold text-white">{t('title', 'GSTD Platform')}</span>
                </div>
                <p className="text-gray-500 text-sm leading-relaxed mb-6">
                  Decentralized AI compute network on TON. Pay with GSTD for inference, earn by running nodes.
                </p>
                <div className="flex gap-4">
                  <a href="https://t.me/gstdcoin" target="_blank" rel="noopener noreferrer"
                    className="px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium hover:bg-blue-500/20 transition-colors">{t('telegram', 'Telegram')}</a>
                  <a href="https://twitter.com/gstdtoken" target="_blank" rel="noopener noreferrer"
                    className="px-4 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-gray-400 text-sm font-medium hover:bg-gray-500/20 transition-colors">{t('x_twitter', 'X (Twitter)')}</a>
                  <a href="https://github.com/gstdcoin" target="_blank" rel="noopener noreferrer"
                    className="px-4 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-gray-400 text-sm font-medium hover:bg-gray-500/20 transition-colors">{t('github', 'GitHub')}</a>
                </div>
              </div>

              {/* Quick Links */}
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4">{t('quick_links', 'Quick Links')}</h4>
                <ul className="space-y-3 text-sm">
                  <li><Link href="/nodes" className="text-gray-500 hover:text-white transition-colors">{t('run_a_node', 'Run a Node')}</Link></li>
                  <li><Link href="/training" className="text-gray-500 hover:text-white transition-colors">{t('fine_tune_models', 'Fine-Tune Models')}</Link></li>
                  <li><Link href="/stats" className="text-gray-500 hover:text-white transition-colors">{t('network_stats', 'Network Stats')}</Link></li>
                  <li><Link href="/hive" className="text-violet-400 hover:text-violet-300 font-bold transition-colors">Hive Mesh (Beta)</Link></li>
                  <li><Link href="/import" className="text-cyan-400 hover:text-cyan-300 font-bold transition-colors">{t('skill_registry', 'Skill Registry')}</Link></li>
                  <li><Link href="/docs" className="text-gray-500 hover:text-white transition-colors">{t('documentation', 'Documentation')}</Link></li>
                </ul>
              </div>


              {/* Legal */}
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4">{t('legal', 'Legal')}</h4>
                <ul className="space-y-3 text-sm">
                  <li><Link href="/privacy" className="text-gray-500 hover:text-white transition-colors">{t('privacy_policy', 'Privacy Policy')}</Link></li>
                  <li><Link href="/terms" className="text-gray-500 hover:text-white transition-colors">{t('terms_of_service', 'Terms of Service')}</Link></li>
                </ul>
              </div>
            </div>

            <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-gray-600 text-sm">
                © 2026 GSTD Token. All rights reserved.
              </p>
              <div className="flex items-center gap-4 text-xs text-gray-600">
                <span className="flex items-center gap-1"><Shield size={12} />{t('open_source', 'Open Source')}</span>
                <span className="flex items-center gap-1"><Zap size={12} />{t('ton_blockchain', 'TON Blockchain')}</span>
                <span className="flex items-center gap-1"><Globe size={12} />{t('depin_network', 'DePIN Network')}</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: await getCommonStaticProps(locale),
});
