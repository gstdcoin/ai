import Image from 'next/image';
import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useTonConnectUI } from '@tonconnect/ui-react';
import WalletConnect from '../components/WalletConnect';

import { NetworkMap } from '../components/dashboard/NetworkMap';
import { useWalletStore } from '../store/walletStore';
import { GSTD_CONTRACT_ADDRESS, API_BASE_URL } from '../lib/config';
import { Zap, Shield, Globe, ArrowRight, Users, Activity, Coins, Code, BookOpen, Terminal, Server, Cpu, Download, Copy, Check, Play, DollarSign, Monitor, Layers, Radio, Workflow, Sparkles, MapPin } from 'lucide-react';

interface NetworkStats {
  active_workers: number;
  total_gstd_paid: number;
  tasks_24h: number;
  total_tasks: number;
  total_hashrate: number;
  gold_reserve: number;
  gstd_price_usd: number;
}

export default function Home() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { isConnected } = useWalletStore();
  const [tonConnectUI] = useTonConnectUI();
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Animated stars
  const stars = useMemo(() => {
    if (!isClient) return [];
    return [...Array(80)].map((_, i) => ({
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
      } catch { /* silent */ }
    };
    if (!isConnected) fetchStats();
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, [isConnected]);

  // Landing Page Interactive State
  const [selectedPlan, setSelectedPlan] = useState<'standard' | 'pro' | 'gpu'>('standard');
  const [selectedRegion, setSelectedRegion] = useState<'global' | 'eu' | 'asia'>('global');
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [workerHours, setWorkerHours] = useState(24);

  const copyToClipboard = () => {
    navigator.clipboard.writeText('curl -sL get.gstd.io | bash');
    setCopiedCommand(true);
    setTimeout(() => setCopiedCommand(false), 2000);
  };

  const [publicNodes, setPublicNodes] = useState<any[]>([]);
  useEffect(() => {
    const fetchNodes = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/nodes/public`);
        if (res.ok) {
          const data = await res.json();
          setPublicNodes(data.nodes || []);
        }
      } catch { }
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

  /* 
   * Removed automatic redirect to dashboard.
   * User can navigate manually via the 'Launch' or 'Dashboard' buttons.
   */


  if (isConnected) {
    return (
      <div className="min-h-screen bg-[#030014] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-500 opacity-50"></div>
      </div>
    );
  }

  // Loading state
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
                <span className="text-white/80 ml-1">Platform</span>
              </span>
            </div>

            <div className="flex items-center gap-6">
              <nav className="hidden md:flex items-center gap-6 mr-2">
                <a href="/docs?type=investment" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">
                  {t('nav_invest') || 'Invest'}
                </a>
                <a href="/docs?type=technical" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">
                  {t('nav_tech') || 'Technology'}
                </a>
                <a href="/docs?type=agents" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">
                  {t('nav_agents') || 'Agents'}
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
                  {t('network_live') || 'Network Live'} — {networkStats?.active_workers || '—'} {t('workers_online') || 'Workers Online'}
                </span>
              </div>

              {/* Hero Title */}
              <h1 className="text-6xl sm:text-7xl lg:text-9xl font-black mb-8 tracking-tighter leading-[0.9] perspective-1000">
                <span className="block text-white opacity-95 drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">{t('hero_line1') || 'The Sovereign'}</span>
                <span className="block bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent animate-gradient-x py-2">
                  {t('hero_line2') || 'AI Economy'}
                </span>
              </h1>

              {/* Subtitle */}
              <p className="text-xl sm:text-2xl text-gray-400 max-w-4xl mx-auto mb-12 leading-relaxed font-medium">
                {t('hero_subtitle') || 'A non-custodial, decentralized orchestration layer for the autonomous agent era. Hire globally distributed compute or monetize your hardware using the GSTD A2A Protocol.'}
              </p>

              {/* CTA Section */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-20 w-full px-4">
                <a
                  href="#hire-compute"
                  className="group relative flex items-center justify-center gap-3 px-10 py-5 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 shadow-2xl shadow-violet-500/40 transition-all duration-300 scale-100 hover:scale-105 active:scale-95 text-white font-black text-xl overflow-hidden"
                >
                  <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-[-20deg]" />
                  <Cpu className="w-6 h-6 animate-pulse" />
                  {t('cta_hire') || 'Acquire Compute'}
                </a>
                <a
                  href="#become-worker"
                  className="flex items-center justify-center gap-3 px-10 py-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300 text-white font-bold text-xl backdrop-blur-md"
                >
                  <Workflow className="w-6 h-6" />
                  {t('cta_worker') || 'Ignite Node'}
                </a>
              </div>

              {/* Stats & Activity Grid */}
              <div className="max-w-5xl mx-auto">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { value: networkStats?.total_hashrate ? `${networkStats.total_hashrate.toFixed(1)} PFLOPS` : '4.2 PFLOPS', label: t('stat_hashrate') || 'Grid Power', icon: Zap, color: 'cyan', delay: '0s' },
                    { value: networkStats?.tasks_24h || '12.4k', label: t('stat_tasks') || 'Protocol Operations', icon: Activity, color: 'violet', delay: '0.1s' },
                    { value: networkStats?.total_gstd_paid?.toFixed(0) || '842k', label: t('stat_paid') || 'Sovereign Yield', icon: Coins, color: 'emerald', delay: '0.2s' },
                    { value: networkStats?.gold_reserve ? `${networkStats.gold_reserve.toFixed(2)} XAUt` : '154.2 XAUt', label: t('stat_gold') || 'Golden Reserve', icon: Shield, color: 'amber', delay: '0.3s' },
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
                        <div className="text-white font-black tracking-tight uppercase text-sm">Non-Custodial</div>
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">TON Wallet Integrated</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 group cursor-default">
                      <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 border border-emerald-500/30 group-hover:scale-110 transition-transform">
                        <Globe className="w-7 h-7" />
                      </div>
                      <div>
                        <div className="text-white font-black tracking-tight uppercase text-sm">GSTD-Protocol</div>
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">MiCA Compliant Asset</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 group cursor-default">
                      <div className="w-14 h-14 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-400 border border-amber-500/30 group-hover:scale-110 transition-transform">
                        <Sparkles className="w-7 h-7" />
                      </div>
                      <div>
                        <div className="text-white font-black tracking-tight uppercase text-sm">A2A Standard</div>
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Agent-to-Agent Logic</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 px-6 lg:px-12 border-t border-white/5">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                {t('why_gstd') || 'Why GSTD Platform'}
              </h2>
              <p className="text-gray-400 max-w-2xl mx-auto">
                {t('why_gstd_desc') || 'Built for enterprises and developers who need reliable, secure, and scalable distributed computing infrastructure.'}
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: Zap,
                  title: t('feat_speed_title') || 'Lightning Fast',
                  desc: t('feat_speed_desc') || '5-second average task completion with intelligent load balancing across global network nodes.',
                  gradient: 'from-amber-500 to-orange-600'
                },
                {
                  icon: Shield,
                  title: t('feat_secure_title') || 'Enterprise Security',
                  desc: t('feat_secure_desc') || 'End-to-end AES-256-GCM encryption. Zero-knowledge execution. Your data never leaves your control.',
                  gradient: 'from-emerald-500 to-teal-600'
                },
                {
                  icon: Globe,
                  title: t('feat_scale_title') || 'Infinite Scale',
                  desc: t('feat_scale_desc') || 'Horizontally scalable architecture. Add capacity on-demand with automatic load redistribution.',
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

        {/* Hire Compute Section - Quick Launch Widget */}
        <section id="hire-compute" className="py-32 px-6 lg:px-12 border-t border-white/5 bg-gradient-to-b from-black via-violet-950/10 to-transparent">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-20">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-bold mb-6 uppercase tracking-[0.2em]">
                Fast Deployment
              </div>
              <h2 className="text-4xl sm:text-6xl font-black text-white mb-6 tracking-tighter">
                {t('hire_title') || 'Deploy in Seconds'}
              </h2>
              <p className="text-gray-400 max-w-2xl mx-auto text-xl leading-relaxed font-medium">
                {t('hire_subtitle') || 'Access a global supercomputer without the enterprise overhead. Pay only for what you use.'}
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
              {/* Step 1: Select Instance Type */}
              <div className="p-8 rounded-[24px] bg-white/[0.03] border border-white/10 backdrop-blur-xl hover:border-white/20 transition-all flex flex-col group/card">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-black text-xl">1</div>
                  <h3 className="text-2xl font-black text-white uppercase tracking-tight">Node Class</h3>
                </div>
                <div className="space-y-4 flex-1">
                  {[
                    { id: 'standard', title: 'Edge Node', price: '$0.04/hr', specs: 'Shared CPU • 4GB RAM', color: 'blue' },
                    { id: 'pro', title: 'Compute Cluster', price: '$0.08/hr', specs: 'Dedicated vCPU • 8GB RAM', color: 'violet' }
                  ].map((plan) => (
                    <button
                      key={plan.id}
                      onClick={() => setSelectedPlan(plan.id as any)}
                      className={`w-full p-5 rounded-2xl border text-left transition-all duration-300 relative overflow-hidden group ${selectedPlan === plan.id
                        ? `bg-${plan.color}-600/10 border-${plan.color}-500/50 ring-1 ring-${plan.color}-500/20`
                        : 'bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/[0.07]'
                        }`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className={`font-black uppercase tracking-tight ${selectedPlan === plan.id ? `text-${plan.color}-400` : 'text-white'}`}>{plan.title}</span>
                        <span className={`text-xs font-black ${selectedPlan === plan.id ? `text-${plan.color}-300` : 'text-gray-500'}`}>{plan.price}</span>
                      </div>
                      <div className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{plan.specs}</div>
                    </button>
                  ))}

                  <div className="p-5 rounded-2xl border border-white/5 bg-white/[0.01] opacity-40 cursor-not-allowed">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-black text-white uppercase tracking-tight">NVIDIA H100</span>
                      <span className="text-[9px] uppercase bg-white/10 px-2 py-0.5 rounded-md text-gray-300 font-bold">Mainnet Beta</span>
                    </div>
                    <div className="text-[10px] font-black text-gray-700 uppercase tracking-widest">80GB HBM3 Memory</div>
                  </div>
                </div>
              </div>

              {/* Step 2: Protocol Selection */}
              <div className="p-8 rounded-[24px] bg-white/[0.03] border border-white/10 backdrop-blur-xl hover:border-white/20 transition-all flex flex-col group/card">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-400 font-black text-xl">2</div>
                  <h3 className="text-2xl font-black text-white uppercase tracking-tight">Routing</h3>
                </div>
                <div className="space-y-4 flex-1">
                  {[
                    { id: 'global', label: 'Balanced (A2A)', desc: 'Lowest latency routing', icon: Globe },
                    { id: 'eu', label: 'Western Europe', desc: 'Sovereign DC access', icon: MapPin },
                    { id: 'asia', label: 'APAC Hub', desc: 'Edge processing', icon: Activity },
                  ].map((region) => (
                    <button
                      key={region.id}
                      onClick={() => setSelectedRegion(region.id as any)}
                      className={`w-full p-5 rounded-2xl border text-left transition-all duration-300 flex items-center gap-4 relative overflow-hidden ${selectedRegion === region.id
                        ? 'bg-fuchsia-600/10 border-fuchsia-500/50 ring-1 ring-fuchsia-500/20'
                        : 'bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/[0.07]'
                        }`}
                    >
                      <div className={`p-2.5 rounded-xl ${selectedRegion === region.id ? 'bg-fuchsia-500/20 text-fuchsia-400' : 'bg-white/5 text-gray-500'}`}>
                        <region.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <span className={`block font-black text-sm uppercase tracking-tight ${selectedRegion === region.id ? 'text-white' : 'text-gray-400'}`}>{region.label}</span>
                        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">{region.desc}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 3: Action */}
              <div className="p-8 rounded-[24px] bg-gradient-to-br from-violet-600/20 to-fuchsia-600/20 border border-violet-500/40 backdrop-blur-2xl flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full blur-3xl -mr-20 -mt-20" />

                <div>
                  <div className="flex items-center gap-4 mb-10">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-black text-xl">3</div>
                    <h3 className="text-2xl font-black text-white uppercase tracking-tight">Deploy</h3>
                  </div>

                  <div className="mb-12 bg-black/40 p-8 rounded-3xl border border-white/5">
                    <div className="text-[10px] font-black text-gray-500 mb-4 uppercase tracking-[0.2em]">Estimated Usage Rate</div>
                    <div className="text-5xl font-black text-white flex items-baseline gap-2 tabular-nums">
                      {selectedPlan === 'standard'
                        ? (0.04 / (networkStats?.gstd_price_usd || 0.02)).toFixed(2)
                        : (0.08 / (networkStats?.gstd_price_usd || 0.02)).toFixed(2)}
                      <span className="text-xl text-violet-400 font-black tracking-tighter uppercase">GSTD/hr</span>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                      <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Real-time settlement</span>
                    </div>
                  </div>
                </div>

                <div className="relative z-10">
                  <button
                    onClick={() => {
                      if (!isConnected) {
                        tonConnectUI.openModal();
                      } else {
                        // Simple buy & launch logic: if connected, trigger small deposit or go to dashboard
                        router.push('/dashboard?action=deposit');
                      }
                    }}
                    className="w-full py-6 rounded-2xl bg-white text-black font-black hover:bg-gray-100 transition-all active:scale-[0.98] mb-4 flex items-center justify-center gap-3 text-lg shadow-2xl uppercase tracking-tighter"
                  >
                    <Cpu className="w-6 h-6 text-violet-600" />
                    {t('cta_hire_launch') || 'Launch Sovereign Node'}
                  </button>
                  <p className="text-[9px] text-center text-gray-500 font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_#10b981]" />
                    {t('booting_node') || 'Booting Environment in ~15s'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Become Worker Section */}
        <section id="become-worker" className="py-32 px-6 lg:px-12 border-t border-white/5 relative overflow-hidden bg-gradient-to-b from-transparent to-black/40">
          <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-orange-600/10 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2" />

          <div className="max-w-6xl mx-auto relative z-10">
            <div className="grid lg:grid-cols-2 gap-24 items-center">

              {/* Steps */}
              <div>
                <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-orange-500/5 border border-orange-500/20 text-orange-400 text-[10px] font-black mb-8 uppercase tracking-[0.3em]">
                  Universal Access Protocol
                </div>
                <h2 className="text-4xl sm:text-7xl font-black text-white mb-8 tracking-tighter">
                  Monetize Any <span className="bg-gradient-to-r from-orange-400 to-amber-500 bg-clip-text text-transparent">Device</span>
                </h2>
                <div className="space-y-6 text-gray-400 text-lg leading-relaxed font-medium mb-12">
                  <p>
                    GSTD unifies mobile and desktop computing into a single, unstoppable swarm.
                    <span className="text-white"> Mobile users</span> simply open their dashboard to solve tasks instantly via browser.
                    <span className="text-white"> PC & Server owners</span> run dedicated agents that not only compute but learn.
                  </p>
                  <p className="text-sm border-l-2 border-orange-500/50 pl-4 italic">
                    "Agents form a distributed, encrypted knowledge base stored across user devices. The network builds itself, is impossible to hack or shut down, and offers a freedom-centric alternative to corporate AI."
                  </p>
                </div>

                <div className="space-y-12">
                  {[
                    {
                      step: 'A',
                      title: 'Mobile & Browser',
                      content: 'No installation required. Log in to your dashboard, click "Ignite", and your device immediately starts solving tasks and earning GSTD while the tab is open.',
                      icon: Monitor
                    },
                    {
                      step: 'B',
                      title: 'PC & Server Nodes',
                      content: (
                        <>
                          Run a dedicated Sovereign Agent for maximum yield. Agents operate autonomously, learning and optimizing their task solving strategies.
                          <div className="relative group mt-4">
                            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 rounded-2xl blur opacity-25 group-hover:opacity-100 transition duration-1000"></div>
                            <code className="relative block w-full p-4 rounded-xl bg-black/80 border border-white/5 text-emerald-400 font-mono text-xs overflow-x-auto shadow-2xl">
                              curl -sL get.gstd.io | bash -s ignite
                            </code>
                          </div>
                        </>
                      ),
                      icon: Server
                    },
                    {
                      step: 'C',
                      title: 'Encrypted & Unstoppable',
                      content: 'Your agent contributes to a decentralized knowledge base. Data is sharded and encrypted across the network—yielding true digital sovereignty.',
                      icon: Shield
                    }
                  ].map((item, i) => (
                    <div key={i} className="flex gap-8 group">
                      <div className="mt-1 w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center shrink-0 font-black text-white group-hover:bg-orange-500/10 group-hover:border-orange-500/30 transition-all duration-500">
                        {typeof item.step === 'string' ? item.step : i + 1}
                      </div>
                      <div>
                        <h4 className="text-2xl font-black text-white mb-3 group-hover:text-orange-400 transition-colors uppercase tracking-tight">{item.title}</h4>
                        <div className="text-gray-500 text-lg leading-relaxed font-medium">{item.content}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Calculator */}
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-orange-600/30 to-fuchsia-600/30 rounded-[40px] blur-2xl opacity-20 group-hover:opacity-40 transition duration-1000" />
                <div className="relative p-12 rounded-[40px] bg-black/60 border border-white/5 backdrop-blur-3xl overflow-hidden shadow-2xl">
                  {/* Decorative Elements */}
                  <div className="absolute top-0 right-0 w-48 h-48 bg-orange-600/5 rounded-full blur-3xl -mr-24 -mt-24 animate-pulse" />

                  <h3 className="text-sm font-black text-gray-400 mb-12 text-center uppercase tracking-[0.4em] flex items-center justify-center gap-3">
                    Node Yield Estimator
                  </h3>

                  <div className="mb-14">
                    <div className="flex justify-between items-center mb-8">
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Target Node Uptime</span>
                      <span className="px-5 py-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 font-black text-xl tabular-nums shadow-[0_0_15px_rgba(249,115,22,0.1)]">
                        {workerHours} Hours/Day
                      </span>
                    </div>
                    <div className="relative h-12 flex items-center px-2">
                      <div className="absolute left-0 right-0 h-1 bg-white/5 rounded-full" />
                      <div className="absolute left-0 h-1 bg-gradient-to-r from-orange-500 to-amber-500 rounded-full" style={{ width: `${(workerHours / 24) * 100}%` }} />
                      <input
                        type="range"
                        min="1"
                        max="24"
                        value={workerHours}
                        onChange={(e) => setWorkerHours(parseInt(e.target.value))}
                        className="w-full h-1 appearance-none bg-transparent cursor-pointer z-10 accent-orange-500"
                      />
                    </div>
                    <div className="flex justify-between mt-6 text-[9px] font-black text-gray-700 uppercase tracking-widest">
                      <span>Mobile</span>
                      <span>Desktop</span>
                      <span>Server Cluster</span>
                    </div>
                  </div>

                  <div className="p-10 rounded-3xl bg-white/[0.02] border border-white/5 text-center mb-10 relative overflow-hidden group/screen shadow-inner">
                    <div className="absolute inset-0 bg-emerald-500/[0.02] opacity-0 group-hover/screen:opacity-100 transition-opacity" />
                    <div className="text-[10px] font-black text-gray-500 mb-5 uppercase tracking-[0.3em]">Estimated Sovereign Yield</div>
                    <div className="text-6xl font-black text-white mb-3 tracking-tighter drop-shadow-[0_0_20px_rgba(34,197,94,0.2)]">
                      {(workerHours * (0.10 / (networkStats?.gstd_price_usd || 0.10)) * 30).toFixed(0)} <span className="text-xl text-emerald-500 opacity-80 uppercase font-black ml-1">GSTD</span>
                    </div>
                    <div className="text-sm font-black text-gray-600 uppercase tracking-widest flex items-center justify-center gap-2">
                      ≈ <span className="text-white">${(workerHours * 0.10 * 30).toFixed(2)}</span> Equivalent
                    </div>
                  </div>

                  <button
                    onClick={() => tonConnectUI.openModal()}
                    className="w-full py-6 rounded-2xl bg-orange-600 text-white font-black hover:bg-orange-500 transition-all active:scale-[0.98] flex items-center justify-center gap-3 text-lg shadow-[0_10px_30px_rgba(234,88,12,0.3)] uppercase tracking-tighter"
                  >
                    Activate My Node
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>

                  <div className="mt-8 flex items-center justify-center gap-3 text-[10px] text-gray-600 font-black uppercase tracking-widest">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Settlement verified on TON mainnet
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Network Proof Section */}
        <section className="py-24 px-6 lg:px-12 border-t border-white/5 bg-black/20">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-20 items-center">
              <div>
                <div className="text-cyan-400 text-xs font-black uppercase tracking-[0.4em] mb-6">Execution Transparency</div>
                <h2 className="text-4xl sm:text-6xl font-black text-white mb-8 tracking-tighter">
                  Proof of Connectivity
                </h2>
                <p className="text-gray-400 mb-10 text-xl leading-relaxed font-medium">
                  Unlike centralized black-box cloud providers, GSTD operates on real physical entropy. Every node is verified via the <span className="text-white">Genesis Protocol</span>, proving latency and capacity with cryptographic certainty.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 group hover:border-cyan-500/30 transition-all">
                    <Radio className="w-6 h-6 text-cyan-400 mb-4" />
                    <div className="text-white font-black text-sm uppercase tracking-tight mb-2">Verified Telemetry</div>
                    <p className="text-xs text-gray-500 font-bold leading-relaxed">Real-time health monitoring of every grid node.</p>
                  </div>
                  <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 group hover:border-violet-500/30 transition-all">
                    <Activity className="w-6 h-6 text-violet-400 mb-4" />
                    <div className="text-white font-black text-sm uppercase tracking-tight mb-2">A2A Consensus</div>
                    <p className="text-xs text-gray-500 font-bold leading-relaxed">Agent-driven task validation and settlement.</p>
                  </div>
                </div>
              </div>
              <div className="relative group">
                <div className="absolute inset-0 bg-blue-500/5 blur-[100px] rounded-full group-hover:bg-blue-500/10 transition-colors" />
                <div className="relative p-2 rounded-[40px] bg-white/5 border border-white/10 backdrop-blur-xl shadow-2xl">
                  <div className="absolute top-4 left-6 z-20 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">Live Node Cluster Distribution</span>
                  </div>
                  <NetworkMap nodes={publicNodes} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* GSTD Utility Section */}
        <section id="docs" className="py-32 px-6 lg:px-12 border-t border-white/5">
          <div className="max-w-5xl mx-auto">
            <div className="relative p-12 lg:p-20 rounded-[48px] bg-gradient-to-br from-violet-600/[0.08] via-fuchsia-600/[0.08] to-cyan-600/[0.08] border border-white/10 overflow-hidden group">
              <div className="absolute top-0 right-0 w-96 h-96 bg-violet-600/5 rounded-full blur-[100px] -mr-48 -mt-48" />

              <div className="flex flex-col lg:flex-row items-center gap-16 relative z-10">
                <div className="flex-shrink-0 relative">
                  <div className="absolute inset-0 bg-white/20 blur-3xl rounded-full" />
                  <div className="w-32 h-32 rounded-[32px] bg-gradient-to-br from-violet-600/40 to-fuchsia-600/40 flex items-center justify-center backdrop-blur-md border border-white/20 shadow-2xl transform group-hover:rotate-12 transition-transform duration-700">
                    <Coins className="w-16 h-16 text-white" />
                  </div>
                </div>
                <div className="flex-1 text-center lg:text-left">
                  <div className="text-[10px] font-black text-violet-400 uppercase tracking-[0.5em] mb-6">Asset Specification</div>
                  <h3 className="text-4xl lg:text-5xl font-black text-white mb-6 tracking-tighter">GSTD Utility Layer</h3>
                  <p className="text-gray-400 mb-10 text-xl leading-relaxed font-medium">
                    GSTD (Guaranteed Service Time Depth) is the atomic fuel of the sovereign AI economy. Fully compliant with MiCA (EU) standards and backed by physical gold via the XAUt-Reserve-Pool.
                  </p>
                  <div className="flex flex-wrap justify-center lg:justify-start gap-4 mb-10">
                    <div className="px-5 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 text-[10px] font-black border border-emerald-500/30 uppercase tracking-widest flex items-center gap-2">
                      <Shield size={12} /> MiCA Verified
                    </div>
                    <div className="px-5 py-2 rounded-xl bg-blue-500/10 text-blue-400 text-[10px] font-black border border-blue-500/30 uppercase tracking-widest flex items-center gap-2">
                      <Zap size={12} /> Gasless Swaps
                    </div>
                    <div className="px-5 py-2 rounded-xl bg-amber-500/10 text-amber-400 text-[10px] font-black border border-amber-500/30 uppercase tracking-widest flex items-center gap-2">
                      <Check size={12} /> Gold Backed
                    </div>
                  </div>
                  <div className="p-6 rounded-2xl bg-black/40 border border-white/5 backdrop-blur-md group/contract cursor-pointer hover:border-cyan-500/30 transition-colors">
                    <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-2">Protocol Contract Address</p>
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
        <footer className="py-12 px-6 lg:px-12 border-t border-white/5">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-3">
                <Image src="/logo.png" alt="GSTD" width={32} height={32} className="rounded-full" />
                <span className="text-lg font-bold text-white/80">GSTD Platform</span>
              </div>
              <p className="text-gray-500 text-sm text-center lg:text-left">
                © 2026 GSTD Platform • DePIN • TON Blockchain • AES-256-GCM • Ed25519
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale ?? 'ru', ['common'])),
    },
  };
};
