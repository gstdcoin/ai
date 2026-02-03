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
import { Zap, Shield, Globe, ArrowRight, Users, Activity, Coins, Code, BookOpen, Terminal, Server, Cpu, Download, Copy, Check, Play, DollarSign, Monitor, Layers } from 'lucide-react';

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
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold mb-6 tracking-tight leading-[1.1]">
                <span className="block text-white">{t('hero_line1') || 'Distribute Your'}</span>
                <span className="block bg-gradient-to-r from-cyan-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                  {t('hero_line2') || 'AI Workloads Globally'}
                </span>
              </h1>

              {/* Subtitle */}
              <p className="text-lg sm:text-xl text-gray-400 max-w-3xl mx-auto mb-10 leading-relaxed">
                {t('hero_subtitle') || 'Enterprise-grade decentralized computing infrastructure on TON blockchain. Process AI inference, validation, and data tasks with cryptographic certainty.'}
              </p>

              {/* CTA Section */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 w-full px-4">
                <div className="flex gap-4">
                  <a
                    href="#hire-compute"
                    className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 shadow-lg shadow-violet-500/25 transition-all text-white font-bold text-lg"
                  >
                    <Server className="w-5 h-5" />
                    {t('cta_hire') || 'Hire Compute'}
                  </a>
                  <a
                    href="#become-worker"
                    className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white font-bold text-lg"
                  >
                    <Download className="w-5 h-5" />
                    {t('cta_worker') || 'Become Worker'}
                  </a>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
                {[
                  { value: networkStats?.total_hashrate ? `${networkStats.total_hashrate.toFixed(1)} PFLOPS` : '—', label: t('stat_hashrate') || 'Network Power', icon: Zap, color: 'cyan' },
                  { value: networkStats?.tasks_24h || '—', label: t('stat_tasks') || 'Tasks (24h)', icon: Activity, color: 'violet' },
                  { value: networkStats?.total_gstd_paid?.toFixed(0) || '—', label: t('stat_paid') || 'GSTD Paid', icon: Coins, color: 'emerald' },
                  { value: networkStats?.gold_reserve ? `${networkStats.gold_reserve.toFixed(2)} XAUt` : '—', label: t('stat_gold') || 'Gold Reserve', icon: Shield, color: 'amber' },
                ].map((stat, i) => (
                  <div key={i} className="relative group">
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-violet-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative p-5 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
                      <stat.icon className={`w-5 h-5 text-${stat.color}-400 mb-2`} />
                      <div className="text-2xl sm:text-3xl font-bold text-white">{stat.value}</div>
                      <div className="text-sm text-gray-500">{stat.label}</div>
                    </div>
                  </div>
                ))}
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
        <section id="hire-compute" className="py-24 px-6 lg:px-12 border-t border-white/5 bg-gradient-to-b from-black to-violet-950/20">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-5xl font-bold text-white mb-4">
                {t('hire_title') || 'Deploy in Seconds'}
              </h2>
              <p className="text-gray-400 max-w-2xl mx-auto text-lg">
                {t('hire_subtitle') || 'Access a global supercomputer without the enterprise overhead. Pay with GSTD.'}
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Step 1: Select Power */}
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold">1</div>
                  <h3 className="text-xl font-bold text-white">Select Power</h3>
                </div>
                <div className="space-y-3">
                  <button
                    onClick={() => setSelectedPlan('standard')}
                    className={`w-full p-4 rounded-xl border text-left transition-all ${selectedPlan === 'standard'
                      ? 'bg-blue-600/20 border-blue-500 ring-1 ring-blue-500'
                      : 'bg-white/5 border-white/10 hover:border-white/20'
                      }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-white">Standard</span>
                      <span className="text-sm text-blue-300">$0.04/hr</span>
                    </div>
                    <div className="text-sm text-gray-400">2 vCPU • 4GB RAM</div>
                  </button>

                  <button
                    onClick={() => setSelectedPlan('pro')}
                    className={`w-full p-4 rounded-xl border text-left transition-all ${selectedPlan === 'pro'
                      ? 'bg-violet-600/20 border-violet-500 ring-1 ring-violet-500'
                      : 'bg-white/5 border-white/10 hover:border-white/20'
                      }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-white">Pro Max</span>
                      <span className="text-sm text-violet-300">$0.08/hr</span>
                    </div>
                    <div className="text-sm text-gray-400">4 vCPU • 8GB RAM</div>
                  </button>

                  <button disabled className="w-full p-4 rounded-xl border border-white/5 bg-white/[0.02] text-left opacity-50 cursor-not-allowed">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-white">NVIDIA A100</span>
                      <span className="text-xs uppercase bg-white/10 px-2 py-0.5 rounded text-gray-300">Soon</span>
                    </div>
                    <div className="text-sm text-gray-500">80GB VRAM High-Bandwidth</div>
                  </button>
                </div>
              </div>

              {/* Step 2: Select Region */}
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-lg bg-fuchsia-500/20 flex items-center justify-center text-fuchsia-400 font-bold">2</div>
                  <h3 className="text-xl font-bold text-white">Select Region</h3>
                </div>
                <div className="space-y-3">
                  {[
                    { id: 'global', label: 'Global (Cheapest)', icon: Globe },
                    { id: 'eu', label: 'Europe (Low Latency)', icon: Globe },
                    { id: 'asia', label: 'Asia (High Availability)', icon: Globe },
                  ].map((region) => (
                    <button
                      key={region.id}
                      onClick={() => setSelectedRegion(region.id as any)}
                      className={`w-full p-4 rounded-xl border text-left transition-all flex items-center gap-3 ${selectedRegion === region.id
                        ? 'bg-fuchsia-600/20 border-fuchsia-500 ring-1 ring-fuchsia-500'
                        : 'bg-white/5 border-white/10 hover:border-white/20'
                        }`}
                    >
                      <region.icon className="w-5 h-5 text-gray-400" />
                      <span className="font-medium text-white">{region.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 3: Action */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-violet-600/20 to-fuchsia-600/20 border border-violet-500/30 backdrop-blur-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">3</div>
                    <h3 className="text-xl font-bold text-white">Launch</h3>
                  </div>

                  <div className="mb-8">
                    <div className="text-sm text-gray-400 mb-2">Estimated Cost</div>
                    <div className="text-4xl font-bold text-white flex items-baseline gap-2">
                      {selectedPlan === 'standard'
                        ? (0.04 / (networkStats?.gstd_price_usd || 0.02)).toFixed(2)
                        : (0.08 / (networkStats?.gstd_price_usd || 0.02)).toFixed(2)}
                      <span className="text-lg text-gray-500 font-normal">GSTD/hr</span>
                    </div>
                  </div>
                </div>

                <div>
                  <button
                    onClick={() => isConnected ? router.push('/dashboard') : tonConnectUI.openModal()}
                    className="w-full py-4 rounded-xl bg-white text-black font-bold hover:bg-gray-100 transition-all mb-3 flex items-center justify-center gap-2"
                  >
                    <Coins className="w-5 h-5" />
                    Buy Credits & Launch
                  </button>
                  <p className="text-xs text-center text-gray-400">
                    Pay with TON. No credit card required.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Become Worker Section */}
        <section id="become-worker" className="py-24 px-6 lg:px-12 border-t border-white/5">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-16 items-center">

              {/* Steps */}
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm font-medium mb-6">
                  <Zap className="w-4 h-4" />
                  For Passive Income
                </div>
                <h2 className="text-3xl sm:text-5xl font-bold text-white mb-6">
                  {t('worker_title') || 'Monetize Your Idle Hardware'}
                </h2>
                <p className="text-gray-400 text-lg mb-10">
                  Turn your PC into a passive income stream. Join 500+ nodes powering the next generation of AI.
                </p>

                <div className="space-y-8">
                  <div className="flex gap-5">
                    <div className="mt-1 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0 font-bold text-white">1</div>
                    <div>
                      <h4 className="text-xl font-bold text-white mb-2">Download Agent</h4>
                      <p className="text-gray-400 mb-4">
                        Run this on Linux/Mac/WSL. For mobile, just <a href="#" onClick={(e) => { e.preventDefault(); tonConnectUI.openModal() }} className="text-cyan-400 hover:underline">Connect Wallet</a> and start browser mining/worker.
                      </p>
                      <div className="relative group">
                        <code className="block w-full p-4 rounded-xl bg-black/50 border border-white/10 text-emerald-400 font-mono text-sm overflow-x-auto">
                          curl -sL https://raw.githubusercontent.com/gstdcoin/ai/main/install.sh | bash
                        </code>
                        <button
                          onClick={copyToClipboard}
                          className="absolute right-2 top-2 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all"
                        >
                          {copiedCommand ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-5">
                    <div className="mt-1 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0 font-bold text-white">2</div>
                    <div>
                      <h4 className="text-xl font-bold text-white mb-2">Connect Wallet</h4>
                      <p className="text-gray-400">Link your TON wallet in the dashboard to receive payouts.</p>
                    </div>
                  </div>

                  <div className="flex gap-5">
                    <div className="mt-1 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0 font-bold text-white">3</div>
                    <div>
                      <h4 className="text-xl font-bold text-white mb-2">Earn GSTD</h4>
                      <p className="text-gray-400">Get paid automatically every 24 hours for completed tasks.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Calculator */}
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 to-pink-500/10 blur-[100px] rounded-full" />
                <div className="relative p-8 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl">
                  <h3 className="text-2xl font-bold text-white mb-8 text-center">Earnings Calculator</h3>

                  <div className="mb-10">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-gray-400 font-medium">Uptime / Day</span>
                      <span className="text-white font-bold">{workerHours} Hours</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="24"
                      value={workerHours}
                      onChange={(e) => setWorkerHours(parseInt(e.target.value))}
                      className="w-full h-2 rounded-lg appearance-none bg-white/10 cursor-pointer accent-orange-500 hover:accent-orange-400"
                    />
                    <div className="flex justify-between mt-2 text-xs text-gray-500">
                      <span>1h</span>
                      <span>12h</span>
                      <span>24h</span>
                    </div>
                  </div>

                  <div className="p-6 rounded-2xl bg-black/40 border border-white/5 text-center mb-8">
                    <div className="text-sm text-gray-400 mb-2">Estimated Monthly Earnings</div>
                    <div className="text-4xl font-bold text-emerald-400 mb-1">
                      {(workerHours * (0.10 / (networkStats?.gstd_price_usd || 0.10)) * 30).toFixed(1)} GSTD
                    </div>
                    <div className="text-sm text-gray-500">
                      ≈ ${(workerHours * 0.10 * 30).toFixed(2)} USD
                    </div>
                  </div>

                  <button className="w-full py-4 rounded-xl bg-white text-black font-bold hover:bg-gray-100 transition-all flex items-center justify-center gap-2">
                    Start Earning Now <ArrowRight className="w-4 h-4" />
                  </button>
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
