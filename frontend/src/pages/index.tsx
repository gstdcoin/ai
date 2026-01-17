import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Dashboard from '../components/dashboard/Dashboard';
import WalletConnect from '../components/WalletConnect';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { useWalletStore } from '../store/walletStore';
import { logger } from '../lib/logger';
import { GSTD_CONTRACT_ADDRESS, ADMIN_WALLET_ADDRESS, API_BASE_URL } from '../lib/config';
import { Zap, Shield, Globe, ArrowRight, Users, Activity, Coins, Code, BookOpen, Terminal } from 'lucide-react';

interface NetworkStats {
  active_workers: number;
  total_gstd_paid: number;
  tasks_24h: number;
  total_tasks: number;
}

export default function Home() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { isConnected, disconnect } = useWalletStore();
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

  const changeLanguage = () => {
    router.push(router.pathname, router.asPath, { locale: router.locale === 'ru' ? 'en' : 'ru' });
  };

  // Prevent flashing of landing page while checking connection
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    // Allow time for wallet restoration
    const timer = setTimeout(() => {
      setCheckingSession(false);
    }, 1000); // 1 second buffer
    return () => clearTimeout(timer);
  }, []);

  // Connected - Show Dashboard
  if (isConnected) {
    return <Dashboard />;
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
                <img src="/logo.svg" alt="GSTD" className="w-10 h-10" />
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-violet-500 blur-lg opacity-50" />
              </div>
              <span className="text-xl font-bold tracking-tight">
                <span className="bg-gradient-to-r from-cyan-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">GSTD</span>
                <span className="text-white/80 ml-1">Platform</span>
              </span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={changeLanguage}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm font-medium"
              >
                {router.locale === 'ru' ? 'EN' : 'RU'}
              </button>
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
              <div className="flex flex-col items-center justify-center gap-4 mb-16 w-full px-4">
                <div className="w-full max-w-xs sm:max-w-sm mx-auto">
                  <WalletConnect />
                </div>
                <a
                  href="#docs"
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white font-medium mx-auto"
                >
                  <BookOpen className="w-5 h-5" />
                  {t('read_docs') || 'Read Documentation'}
                </a>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
                {[
                  { value: networkStats?.active_workers || '—', label: t('stat_workers') || 'Active Workers', icon: Users, color: 'cyan' },
                  { value: networkStats?.tasks_24h || '—', label: t('stat_tasks') || 'Tasks (24h)', icon: Activity, color: 'violet' },
                  { value: networkStats?.total_gstd_paid?.toFixed(0) || '—', label: t('stat_paid') || 'GSTD Paid', icon: Coins, color: 'emerald' },
                  { value: '<5s', label: t('stat_latency') || 'Avg Latency', icon: Zap, color: 'amber' },
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

        {/* For Creators & Workers */}
        <section className="py-24 px-6 lg:px-12 bg-gradient-to-b from-transparent via-violet-950/10 to-transparent">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-8">
              {/* For Task Creators */}
              <div className="p-8 rounded-2xl bg-gradient-to-br from-cyan-500/5 to-blue-500/5 border border-cyan-500/10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                    <Code className="w-5 h-5 text-cyan-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-white">{t('for_creators') || 'For Task Creators'}</h3>
                </div>
                <ul className="space-y-4 mb-6">
                  {[
                    t('creator_1') || 'Create tasks via Web UI, REST API, or SDK',
                    t('creator_2') || 'Pay only for completed work in TON',
                    t('creator_3') || 'Real-time status and result delivery',
                    t('creator_4') || 'Cryptographic proof of execution',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-gray-300">
                      <ArrowRight className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <a href="#api-docs" className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 font-medium">
                  <Terminal className="w-4 h-4" />
                  {t('view_api_docs') || 'View API Documentation'}
                </a>
              </div>

              {/* For Workers */}
              <div className="p-8 rounded-2xl bg-gradient-to-br from-violet-500/5 to-purple-500/5 border border-violet-500/10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
                    <Activity className="w-5 h-5 text-violet-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-white">{t('for_workers') || 'For Workers'}</h3>
                </div>
                <ul className="space-y-4 mb-6">
                  {[
                    t('worker_1') || 'Register any device as computing node',
                    t('worker_2') || 'Automatic task assignment based on capability',
                    t('worker_3') || 'Instant withdrawals in TON',
                    t('worker_4') || 'Build reputation for premium tasks',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-gray-300">
                      <ArrowRight className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <a href="#worker-guide" className="inline-flex items-center gap-2 text-violet-400 hover:text-violet-300 font-medium">
                  <BookOpen className="w-4 h-4" />
                  {t('worker_guide') || 'Worker Quick Start'}
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Token Section */}
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
                <img src="/logo.svg" alt="GSTD" className="w-8 h-8" />
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
