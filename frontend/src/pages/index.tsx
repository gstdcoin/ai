import Image from 'next/image';
import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useTonConnectUI } from '@tonconnect/ui-react';
import WalletConnect from '../components/WalletConnect';
import { ActivityFeed } from '../components/dashboard/ActivityFeed';
import { NetworkMap } from '../components/dashboard/NetworkMap';
import { useWalletStore } from '../store/walletStore';
import { GSTD_CONTRACT_ADDRESS, API_BASE_URL } from '../lib/config';
import { Zap, Shield, Globe, ArrowRight, Users, Activity, Coins, Code, BookOpen, Terminal, Server, Cpu, Download, Copy, Check, Play, DollarSign, Monitor, Layers, Radio, Pulse, Workflow, Sparkles, MapPin } from 'lucide-react';

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

  // Connected - Redirect to Dashboard
  useEffect(() => {
    if (isConnected && !checkingSession) {
      router.push('/dashboard');
    }
  }, [isConnected, checkingSession, router]);

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
              <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black mb-8 tracking-tighter leading-[0.95] perspective-1000">
                <span className="block text-white opacity-95 drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">{t('hero_line1') || 'Distribute Your'}</span>
                <span className="block bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent animate-gradient-x py-2">
                  {t('hero_line2') || 'AI Workloads Globally'}
                </span>
              </h1>

              {/* Subtitle */}
              <p className="text-xl sm:text-2xl text-gray-400 max-w-3xl mx-auto mb-12 leading-relaxed font-medium">
                {t('hero_subtitle') || 'Enterprise-grade decentralized computing infrastructure on TON blockchain. Process AI inference, validation, and data tasks with cryptographic certainty.'}
              </p>

              {/* CTA Section */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-20 w-full px-4">
                <a
                  href="#hire-compute"
                  className="group relative flex items-center justify-center gap-3 px-10 py-5 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 shadow-2xl shadow-violet-500/40 transition-all duration-300 scale-100 hover:scale-105 active:scale-95 text-white font-black text-xl overflow-hidden"
                >
                  <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-[-20deg]" />
                  <Server className="w-6 h-6 animate-pulse" />
                  {t('cta_hire') || 'Hire Compute'}
                </a>
                <a
                  href="#become-worker"
                  className="flex items-center justify-center gap-3 px-10 py-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300 text-white font-bold text-xl backdrop-blur-md"
                >
                  <Download className="w-6 h-6" />
                  {t('cta_worker') || 'Become Worker'}
                </a>
              </div>

              {/* Stats & Activity Grid */}
              <div className="grid lg:grid-cols-12 gap-6 max-w-7xl mx-auto items-start">
                <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { value: networkStats?.total_hashrate ? `${networkStats.total_hashrate.toFixed(1)} PFLOPS` : '4.2 PFLOPS', label: t('stat_hashrate') || 'Network Power', icon: Zap, color: 'cyan', delay: '0s' },
                    { value: networkStats?.tasks_24h || '12.4k', label: t('stat_tasks') || 'Tasks (24h)', icon: Activity, color: 'violet', delay: '0.1s' },
                    { value: networkStats?.total_gstd_paid?.toFixed(0) || '842k', label: t('stat_paid') || 'GSTD Paid', icon: Coins, color: 'emerald', delay: '0.2s' },
                    { value: networkStats?.gold_reserve ? `${networkStats.gold_reserve.toFixed(2)} XAUt` : '154.2 XAUt', label: t('stat_gold') || 'Gold Reserve', icon: Shield, color: 'amber', delay: '0.3s' },
                  ].map((stat, i) => (
                    <div key={i} className="relative group overflow-hidden" style={{ animationDelay: stat.delay }}>
                      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-violet-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="relative p-6 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl hover:border-white/30 transition-all text-left">
                        <stat.icon className={`w-6 h-6 text-${stat.color}-400 mb-4`} />
                        <div className="text-2xl sm:text-3xl font-black text-white mb-1">{stat.value}</div>
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">{stat.label}</div>
                      </div>
                    </div>
                  ))}

                  {/* Trust Badge / Secondary Stats */}
                  <div className="col-span-2 md:col-span-4 p-6 rounded-2xl bg-gradient-to-r from-blue-600/10 to-violet-600/10 border border-blue-500/20 flex flex-wrap items-center justify-between gap-6 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                        <Shield className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-white font-bold">AES-256-GCM Secured</div>
                        <div className="text-xs text-gray-500">End-to-end encrypted workloads</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                        <Globe className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-white font-bold">100% On-Chain</div>
                        <div className="text-xs text-gray-500">Transparent settlement on TON</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                        <Sparkles className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-white font-bold">Genesis Verified</div>
                        <div className="text-xs text-gray-500">Autonomous node reputation</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-4">
                  <ActivityFeed />
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
              {/* Step 1: Select Power */}
              <div className="p-8 rounded-[24px] bg-white/[0.03] border border-white/10 backdrop-blur-xl hover:border-white/20 transition-all flex flex-col group/card">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 font-black text-xl shadow-[0_0_15px_rgba(59,130,246,0.2)]">1</div>
                  <h3 className="text-2xl font-black text-white uppercase tracking-tight">Select Power</h3>
                </div>
                <div className="space-y-4 flex-1">
                  {[
                    { id: 'standard', title: 'Standard', price: '$0.04/hr', specs: '2 vCPU • 4GB RAM', color: 'blue' },
                    { id: 'pro', title: 'Pro Max', price: '$0.08/hr', specs: '4 vCPU • 8GB RAM', color: 'violet' }
                  ].map((plan) => (
                    <button
                      key={plan.id}
                      onClick={() => setSelectedPlan(plan.id as any)}
                      className={`w-full p-5 rounded-2xl border text-left transition-all duration-300 relative overflow-hidden group ${selectedPlan === plan.id
                        ? `bg-${plan.color}-600/10 border-${plan.color}-500/50 ring-1 ring-${plan.color}-500/20 shadow-2xl shadow-${plan.color}-500/10`
                        : 'bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/[0.07]'
                        }`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className={`font-black text-lg ${selectedPlan === plan.id ? `text-${plan.color}-400` : 'text-white'}`}>{plan.title}</span>
                        <span className={`text-sm font-bold ${selectedPlan === plan.id ? `text-${plan.color}-300` : 'text-gray-500'}`}>{plan.price}</span>
                      </div>
                      <div className="text-sm font-medium text-gray-500">{plan.specs}</div>
                      {selectedPlan === plan.id && (
                        <div className={`absolute right-0 top-0 h-full w-1 bg-${plan.color}-500`} />
                      )}
                    </button>
                  ))}

                  <div className="p-5 rounded-2xl border border-white/5 bg-white/[0.01] opacity-40 cursor-not-allowed">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-black text-white">NVIDIA A100</span>
                      <span className="text-[10px] uppercase bg-white/10 px-2 py-0.5 rounded-md text-gray-300 font-bold">In Queue</span>
                    </div>
                    <div className="text-xs font-medium text-gray-600">80GB VRAM High-Bandwidth</div>
                  </div>
                </div>
              </div>

              {/* Step 2: Select Region */}
              <div className="p-8 rounded-[24px] bg-white/[0.03] border border-white/10 backdrop-blur-xl hover:border-white/20 transition-all flex flex-col group/card">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-fuchsia-500/20 flex items-center justify-center text-fuchsia-400 font-black text-xl shadow-[0_0_15px_rgba(232,121,249,0.2)]">2</div>
                  <h3 className="text-2xl font-black text-white uppercase tracking-tight">Set Region</h3>
                </div>
                <div className="space-y-4 flex-1">
                  {[
                    { id: 'global', label: 'Global (Auto)', desc: 'Lowest cost selection', icon: Globe },
                    { id: 'eu', label: 'Europe', desc: 'Low latency (GDPR ok)', icon: MapPin },
                    { id: 'asia', label: 'Asia Pacific', desc: 'High availability', icon: Globe },
                  ].map((region) => (
                    <button
                      key={region.id}
                      onClick={() => setSelectedRegion(region.id as any)}
                      className={`w-full p-5 rounded-2xl border text-left transition-all duration-300 flex items-center gap-4 relative overflow-hidden ${selectedRegion === region.id
                        ? 'bg-fuchsia-600/10 border-fuchsia-500/50 ring-1 ring-fuchsia-500/20 shadow-2xl shadow-fuchsia-500/10'
                        : 'bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/[0.07]'
                        }`}
                    >
                      <div className={`p-2 rounded-lg ${selectedRegion === region.id ? 'bg-fuchsia-500/20 text-fuchsia-400' : 'bg-white/5 text-gray-500'}`}>
                        <Globe className="w-5 h-5" />
                      </div>
                      <div>
                        <span className={`block font-black text-lg ${selectedRegion === region.id ? 'text-white' : 'text-gray-300'}`}>{region.label}</span>
                        <span className="text-xs font-medium text-gray-500">{region.desc}</span>
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
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-black text-xl shadow-[0_0_15px_rgba(52,211,153,0.2)]">3</div>
                    <h3 className="text-2xl font-black text-white uppercase tracking-tight">Finalize</h3>
                  </div>

                  <div className="mb-12 bg-black/40 p-6 rounded-2xl border border-white/5">
                    <div className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-widest">Estimated Commitment</div>
                    <div className="text-5xl font-black text-white flex items-baseline gap-2 tabular-nums">
                      {selectedPlan === 'standard'
                        ? (0.04 / (networkStats?.gstd_price_usd || 0.02)).toFixed(2)
                        : (0.08 / (networkStats?.gstd_price_usd || 0.02)).toFixed(2)}
                      <span className="text-xl text-violet-400 font-black">GSTD/hr</span>
                    </div>
                  </div>
                </div>

                <div className="relative z-10">
                  <button
                    onClick={() => isConnected ? router.push('/dashboard') : tonConnectUI.openModal()}
                    className="w-full py-5 rounded-2xl bg-white text-black font-black hover:bg-gray-100 transition-all active:scale-[0.98] mb-4 flex items-center justify-center gap-3 text-lg shadow-2xl"
                  >
                    <Coins className="w-6 h-6" />
                    Launch Compute Instance
                  </button>
                  <p className="text-xs text-center text-gray-500 font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    Instance spinning up in ~15s
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Become Worker Section */}
        <section id="become-worker" className="py-32 px-6 lg:px-12 border-t border-white/5 relative overflow-hidden">
          <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-orange-600/10 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2" />

          <div className="max-w-6xl mx-auto relative z-10">
            <div className="grid lg:grid-cols-2 gap-20 items-center">

              {/* Steps */}
              <div>
                <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm font-bold mb-8 uppercase tracking-widest">
                  <Zap className="w-4 h-4" />
                  Yield Generation
                </div>
                <h2 className="text-4xl sm:text-6xl font-black text-white mb-8 tracking-tighter">
                  {t('worker_title') || 'Monetize Your Idle Hardware'}
                </h2>
                <p className="text-gray-400 text-xl mb-12 leading-relaxed">
                  Turn your PC into a high-performance node. Join the global compute grid and earn GSTD tokens for every task processed.
                </p>

                <div className="space-y-10">
                  {[
                    {
                      step: 1,
                      title: 'Download Agent',
                      content: (
                        <>
                          Run this on Linux/Mac/WSL. For mobile, just <a href="#" onClick={(e) => { e.preventDefault(); tonConnectUI.openModal() }} className="text-cyan-400 hover:text-cyan-300 font-bold underline decoration-cyan-400/30 underline-offset-4 transition-all">Connect Wallet</a> and start browser mining.
                          <div className="relative group mt-5">
                            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-2xl blur opacity-25 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                            <code className="relative block w-full p-5 rounded-xl bg-black/60 border border-white/10 text-emerald-400 font-mono text-sm overflow-x-auto shadow-2xl">
                              curl -sL https://raw.githubusercontent.com/gstdcoin/ai/main/install.sh | bash
                            </code>
                            <button
                              onClick={copyToClipboard}
                              className="absolute right-3 top-3 p-2.5 rounded-lg bg-white/5 hover:bg-white/15 text-white transition-all backdrop-blur-md border border-white/10"
                            >
                              {copiedCommand ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        </>
                      )
                    },
                    {
                      step: 2,
                      title: 'Connect Wallet',
                      content: 'Link your TON wallet in the dashboard to receive real-time payouts via our automated settlement layer.'
                    },
                    {
                      step: 3,
                      title: 'Earn GSTD',
                      content: 'Get paid automatically every 24 hours for completed tasks. Your earnings are secured by gold-backed liquidity.'
                    }
                  ].map((item, i) => (
                    <div key={i} className="flex gap-6 group">
                      <div className="mt-1 w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 font-black text-white group-hover:bg-violet-600/20 group-hover:border-violet-500/50 transition-all duration-300">
                        {item.step}
                      </div>
                      <div>
                        <h4 className="text-2xl font-black text-white mb-3 group-hover:text-violet-400 transition-colors uppercase tracking-tight">{item.title}</h4>
                        <div className="text-gray-400 text-lg leading-relaxed">{item.content}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Calculator */}
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-orange-600 to-fuchsia-600 rounded-[32px] blur opacity-20 group-hover:opacity-40 transition duration-1000" />
                <div className="relative p-10 rounded-[32px] bg-black/40 border border-white/10 backdrop-blur-2xl overflow-hidden">
                  {/* Decorative Elements */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-orange-600/10 rounded-full blur-3xl -mr-16 -mt-16" />

                  <h3 className="text-2xl font-black text-white mb-10 text-center uppercase tracking-widest flex items-center justify-center gap-3">
                    <DollarSign className="w-6 h-6 text-emerald-400" />
                    Earnings Calculator
                  </h3>

                  <div className="mb-12">
                    <div className="flex justify-between items-center mb-6">
                      <span className="text-gray-400 font-bold uppercase tracking-wider text-sm">Target Uptime / Day</span>
                      <span className="px-4 py-1 rounded-lg bg-orange-600/20 border border-orange-500/30 text-orange-400 font-black text-lg">
                        {workerHours} Hours
                      </span>
                    </div>
                    <div className="relative h-12 flex items-center">
                      <input
                        type="range"
                        min="1"
                        max="24"
                        value={workerHours}
                        onChange={(e) => setWorkerHours(parseInt(e.target.value))}
                        className="w-full h-1.5 focus:outline-none bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-500"
                      />
                    </div>
                    <div className="flex justify-between mt-4 text-[10px] font-black text-gray-600 uppercase tracking-widest">
                      <span>Low Power</span>
                      <span>Balanced</span>
                      <span>Compute Node</span>
                    </div>
                  </div>

                  <div className="p-8 rounded-2xl bg-white/[0.03] border border-white/5 text-center mb-10 relative overflow-hidden group/screen">
                    <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover/screen:opacity-100 transition-opacity" />
                    <div className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-[0.2em]">Estimated Monthly Payout</div>
                    <div className="text-5xl font-black text-emerald-400 mb-2 drop-shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                      {(workerHours * (0.10 / (networkStats?.gstd_price_usd || 0.10)) * 30).toFixed(0)} <span className="text-xl opacity-60">GSTD</span>
                    </div>
                    <div className="text-lg font-bold text-gray-400">
                      ≈ ${(workerHours * 0.10 * 30).toFixed(2)} USD
                    </div>
                  </div>

                  <button
                    onClick={() => tonConnectUI.openModal()}
                    className="w-full py-5 rounded-2xl bg-white text-black font-black hover:bg-gray-100 transition-all active:scale-[0.98] flex items-center justify-center gap-3 text-lg shadow-xl"
                  >
                    Start Earning Now
                    <ArrowRight className="w-5 h-5" />
                  </button>

                  <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-500 font-medium">
                    <Shield className="w-3.5 h-3.5 text-emerald-500/60" />
                    Withdrawals available any time via TON
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Network Proof Section */}
        <section className="py-24 px-6 lg:px-12 border-t border-white/5">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
                  {router.locale === 'ru' ? 'Доказательство Глобальной Связности' : 'Proof of Global Connectivity'}
                </h2>
                <p className="text-gray-400 mb-8 leading-relaxed">
                  {router.locale === 'ru'
                    ? 'В отличие от централизованных облаков, GSTD работает на базе реальных физических устройств по всему миру. Каждый узел проходит проверку через Genesis Task, подтверждая свою задержку и местоположение.'
                    : 'Unlike centralized clouds, GSTD is powered by real physical devices worldwide. Every node is verified via the Genesis Task, proving its latency and location with cryptographic certainty.'}
                </p>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)]">1</div>
                    <span className="text-gray-300 font-medium">{router.locale === 'ru' ? 'Верифицированная телеметрия' : 'Verified Telemetry'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400">2</div>
                    <span className="text-gray-300 font-medium">{router.locale === 'ru' ? 'Геолокация узлов в реальном времени' : 'Real-time Node Geolocation'}</span>
                  </div>
                </div>
              </div>
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500/10 blur-[100px] rounded-full" />
                <div className="relative transform hover:scale-[1.02] transition-transform duration-500">
                  <NetworkMap nodes={publicNodes} />
                </div>
              </div>
            </div>
          </div>
        </section>
        <section id="docs" className="py-24 px-6 lg:px-12 border-t border-white/5">
          <div className="max-w-4xl mx-auto">
            <div className="p-8 lg:p-12 rounded-3xl bg-gradient-to-br from-violet-500/5 via-fuchsia-500/5 to-cyan-500/5 border border-white/10">
              <div className="flex flex-col lg:flex-row items-start gap-8">
                <div className="flex-shrink-0">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 flex items-center justify-center backdrop-blur-sm border border-white/10">
                    <span className="text-4xl">💎</span>
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-white mb-3">{t('gstd_title') || 'GSTD Utility Token'}</h3>
                  <p className="text-gray-400 mb-6 leading-relaxed">
                    {t('gstd_desc') || 'GSTD (Guaranteed Service Time Depth) is a utility token for platform operations. Fully compliant with MiCA (EU) and SEC (US) requirements. Backed by XAUt gold through the GSTD/XAUt liquidity pool.'}
                  </p>
                  <div className="flex flex-wrap gap-3 mb-6">
                    <span className="px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium border border-emerald-500/20">✓ MiCA Compliant</span>
                    <span className="px-4 py-1.5 rounded-full bg-blue-500/10 text-blue-400 text-sm font-medium border border-blue-500/20">✓ SEC Compliant</span>
                    <span className="px-4 py-1.5 rounded-full bg-violet-500/10 text-violet-400 text-sm font-medium border border-violet-500/20">✓ Gold Backed</span>
                  </div>
                  <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                    <p className="text-xs text-gray-500 font-mono break-all">
                      Contract: {GSTD_CONTRACT_ADDRESS}
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
