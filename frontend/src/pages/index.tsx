import Image from 'next/image';
import Link from 'next/link';
import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import WalletConnect from '../components/WalletConnect';
import { API_BASE_URL } from '../lib/config';
import { Activity, Zap, MessageSquare, ArrowRight, Bot } from 'lucide-react';
import dynamic from 'next/dynamic';

// Lazy-load heavy canvas components (no SSR)
const AmbientMesh = dynamic(() => import('../components/home/AmbientMesh'), { ssr: false });
const LivePulse = dynamic(() => import('../components/home/LivePulse'), { ssr: false });

interface NetworkStats {
  active_workers: number;
  total_gstd_paid: number;
  tasks_24h: number;
  total_tasks: number;
  total_hashrate: number;
  gold_reserve: number;
  gstd_price_usd: number;
  network_iq?: number;
  global_brain_latency_ms?: number;
}

// ─── Reactive Stat Card ──────────────────────────────────────
function StatCard({ value, label, color }: { value: string; label: string; color: string }) {
  const [flash, setFlash] = useState(false);
  const prevValue = useRef(value);

  useEffect(() => {
    if (prevValue.current !== value && prevValue.current !== '—') {
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 1000);
      prevValue.current = value;
      return () => clearTimeout(timer);
    }
    prevValue.current = value;
  }, [value]);

  return (
    <div className={`p-6 rounded-2xl glass-pro shine-on-hover transition-all duration-500 text-center ${flash ? 'stat-flash' : ''}`}>
      <div className={`text-3xl font-black ${color} mb-1 counter-value`}>{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{label}</div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function Home() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => { setIsClient(true); }, []);

  // Fetch network stats (real data only)
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/network/stats`);
        if (res.ok) setNetworkStats(await res.json());
      } catch { /* silent */ }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, []);

  const changeLanguage = () => {
    router.push(router.pathname, router.asPath, { locale: router.locale === 'ru' ? 'en' : 'ru' });
  };

  // No auto-redirect — users choose Chat or Monitor from nav

  const goldReserve = networkStats?.gold_reserve?.toFixed(4) || '—';
  const activeNodes = networkStats?.active_workers?.toLocaleString() || '—';
  const totalTasks = networkStats?.total_tasks?.toLocaleString() || '—';
  const gstdPrice = networkStats?.gstd_price_usd && networkStats.gstd_price_usd > 0 ? networkStats.gstd_price_usd.toFixed(6) : '—';

  return (
    <div className="min-h-screen bg-[#030014] text-white overflow-x-hidden font-sans selection:bg-violet-500/30">
      {/* ═══════ AMBIENT MESH BACKGROUND ═══════ */}
      {isClient && (
        <AmbientMesh activeNodes={networkStats?.active_workers ?? 0} />
      )}

      {/* Subtle gradient overlay on top of mesh */}
      <div className="fixed inset-0 z-[1] pointer-events-none">
        <div className="absolute top-0 left-0 right-0 h-[40%] bg-gradient-to-b from-[#030014] to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-[30%] bg-gradient-to-t from-[#030014] to-transparent" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Live stats ribbon — only shows when data arrives */}
        {networkStats != null && (
          <div className="bg-black/50 backdrop-blur-xl border-b border-white/[0.04] px-4 py-1.5 text-center text-[11px] font-medium text-cyan-400/80">
            <span className="inline-flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              {networkStats.active_workers?.toLocaleString() ?? '—'} {t('nodes', 'nodes')}
            </span>
            <span className="mx-2 text-white/10">•</span>
            <span>{networkStats.total_tasks?.toLocaleString() ?? '—'} {t('tasks', 'tasks')}</span>
            {networkStats.gstd_price_usd > 0 && (
              <>
                <span className="mx-2 text-white/10">•</span>
                <span className="text-amber-400/80">${networkStats.gstd_price_usd.toFixed(6)}</span>
              </>
            )}
          </div>
        )}

        {/* ═══════ HEADER ═══════ */}
        <header className="px-6 py-5 flex justify-between items-center max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10">
              <Image src="/logo.png" alt="GSTD" width={40} height={40} className="rounded-full relative z-10" />
              <div className="absolute inset-0 bg-violet-500/40 blur-lg rounded-full animate-pulse" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight block leading-none">GSTD</span>
              <span className="text-[10px] text-amber-400 font-bold tracking-widest uppercase">{t('gold_standard', 'Gold Standard')}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-400">
              <a href="#features" className="hover:text-white transition-colors">{t('features', 'Features')}</a>
              <a href="#pulse" className="hover:text-white transition-colors">{t('pulse', 'Pulse')}</a>
              <Link href="/docs" className="hover:text-white transition-colors">{t('docs', 'Docs')}</Link>
            </nav>
            <div className="h-6 w-px bg-white/10 hidden md:block" />
            <button onClick={changeLanguage} className="text-xs font-bold text-gray-500 hover:text-white uppercase transition-colors">
              {router.locale === 'ru' ? 'EN' : 'RU'}
            </button>
            <WalletConnect />
          </div>
        </header>

        {/* ═══════ HERO ═══════ */}
        <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12 lg:py-20 w-full max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto mb-16 stagger-in">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-pro text-[11px] font-bold tracking-wide text-cyan-400 mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
              </span>
              {t('depin_compute_protocol_live', 'DePIN Compute Protocol • Live')}
            </div>

            <h1 className="text-5xl sm:text-7xl font-black tracking-tight mb-6 leading-[1.08]">
              <span className="block text-white">{t('corporation_free', 'Corporation-Free AI.')}</span>
              <span className="block bg-gradient-to-r from-violet-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent animate-gradient bg-[length:200%_200%]">{t('working_humanity', 'Working for Humanity.')}</span>
            </h1>

            <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed mb-10">
              {t('hero_desc', 'GSTD forms a decentralized planetary brain. By contributing your unused compute power, you become a neural node—helping humanity solve complex global problems. Access the Hive Mind, or')} <span className="text-emerald-400 font-bold">{t('connect_devices', 'connect your devices')}</span> {t('connect_devices_earn', 'to earn GSTD.')}
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-lg mx-auto">
              <Link
                href="/chat"
                className="group relative w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-bold text-lg shadow-xl shadow-violet-500/20 hover:shadow-violet-500/40 hover:scale-[1.03] active:scale-[0.98] transition-all duration-300"
              >
                <Bot size={22} className="group-hover:scale-110 transition-transform" />
                <span>{t('try_sovereign_ai', 'Try Sovereign AI') || 'Try Sovereign AI'}</span>
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <a
                href="https://gstdbot.gstdtoken.com"
                className="group relative w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl glass-pro text-white font-bold text-lg hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 shine-on-hover"
                style={{ textDecoration: 'none' }}
              >
                <Zap size={22} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                <span>{t('run_a_node', 'Run a Node')}</span>
              </a>
            </div>
          </div>

          {/* ═══════ DUAL PATHWAY CARDS ═══════ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-5xl mb-20 stagger-in" id="features">
            <div className="group p-8 rounded-3xl glass-pro gradient-border shine-on-hover transition-all duration-500 flex flex-col justify-between">
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-violet-500/15 flex items-center justify-center mb-6 glow-breathe">
                  <MessageSquare className="text-violet-400 group-hover:scale-110 transition-transform" size={24} />
                </div>
                <h2 className="text-2xl font-black tracking-tight mb-3 text-white">{t('tap_hive', 'Tap the Hive Mind')}</h2>
                <p className="text-gray-400 mb-8 leading-relaxed font-medium">
                  {t('tap_hive_desc', 'Use the Global Brain to solve any task. Pay with GSTD to route your queries through the collective intelligence of thousands of nodes. True privacy, open-source models, zero corporate control.')}
                </p>
                <Link
                  href="/chat"
                  className="flex items-center gap-2 text-violet-400 font-black hover:gap-3 transition-all"
                  style={{ textDecoration: 'none' }}
                >
                  {t('access_intelligence', 'Access Intelligence')} <ArrowRight size={16} />
                </Link>
              </div>
            </div>

            <div className="group p-8 rounded-3xl glass-pro gradient-border shine-on-hover transition-all duration-500 flex flex-col justify-between">
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-6 glow-breathe" style={{ animationDelay: '2s' }}>
                  <Zap className="text-emerald-400 group-hover:scale-110 transition-transform" size={24} />
                </div>
                <h2 className="text-2xl font-black tracking-tight mb-3 text-white">{t('become_node', 'Become a Neural Node')}</h2>
                <p className="text-gray-400 mb-8 leading-relaxed font-medium">
                  {t('become_node_desc', 'Turn your phone or PC into a neuron of the Sovereign Organism. Earn GSTD dynamically while your device processes distributed AI tasks contributing to the greater good of humanity.')}
                </p>
                <a
                  href="https://gstdbot.gstdtoken.com"
                  className="flex items-center gap-2 text-emerald-400 font-black hover:gap-3 transition-all"
                  style={{ textDecoration: 'none' }}
                >
                  {t('ignite_your_node', 'Ignite Your Node')} <ArrowRight size={16} />
                </a>
              </div>
            </div>
          </div>

          {/* ═══════ LIVE NETWORK PULSE ═══════ */}
          <div className="w-full max-w-5xl mb-16" id="pulse">
            {isClient && <LivePulse className="glow-breathe" />}
          </div>

          {/* ═══════ NETWORK STATS (Reactive) ═══════ */}
          <div className="w-full max-w-5xl grid grid-cols-2 md:grid-cols-4 gap-4 mb-20 stagger-in" id="stats">
            <StatCard value={goldReserve} label={t('xaut_reserve', 'XAUt Reserve')} color="text-amber-400" />
            <StatCard value={activeNodes} label={t('active_nodes', 'Active Nodes')} color="text-emerald-400" />
            <StatCard value={totalTasks} label={t('tasks_completed', 'Tasks Completed')} color="text-cyan-400" />
            <StatCard value={gstdPrice} label={t('gstd_price_usd', 'GSTD Price ($)')} color="text-violet-400" />
          </div>

          {/* ═══════ MANIFESTO STRIP ═══════ */}
          <div className="w-full max-w-5xl mb-20">
            <div className="p-8 rounded-3xl glass-pro gradient-border">
              <h3 className="text-sm font-bold text-white/90 mb-4 flex items-center gap-2">
                <Activity size={18} className="text-cyan-400" />{t('supercomputer_for_humanity', 'Supercomputer for Humanity')}</h3>
              <p className="text-sm text-gray-400 text-center max-w-md mx-auto leading-relaxed">
                {t('manifesto_desc', 'Any device joins the swarm. No tokens? Earn by contributing. Have tokens? Unlock advanced AI. The network learns and grows with every request.')}
              </p>
            </div>
          </div>

          {/* ═══════ HOW IT WORKS ═══════ */}
          <div className="w-full max-w-2xl stagger-in" id="docs-section">
            <h3 className="text-lg font-bold text-white mb-4">{t('how_it_works', 'How it works')}</h3>
            <div className="space-y-3 text-sm text-gray-400">
              <p><strong className="text-white">{t('no_tokens', 'No tokens?')}</strong> {t('no_tokens_desc', 'Connect your device and earn GSTD by contributing compute. Any device can join the swarm.')}</p>
              <p><strong className="text-white">{t('have_tokens', 'Have tokens?')}</strong> {t('have_tokens_desc', 'Unlock advanced AI features: better models, Hive Memory, and priority access.')}</p>
              <p><strong className="text-white">{t('goldbacked', 'Gold-backed.')}</strong> {t('gold_backed_desc', 'GSTD is secured by physical gold reserves. Decentralized. Uncensored.')}</p>
            </div>
          </div>

        </main>

        {/* ═══════ FOOTER ═══════ */}
        <footer className="border-t border-white/[0.04] bg-black/40 backdrop-blur-xl py-12 px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2 opacity-50">
              <Image src="/logo.png" alt="GSTD" width={24} height={24} className="grayscale" />
              <span className="text-sm font-medium">© 2026 Gold Standard DePIN</span>
            </div>
            <div className="flex gap-6 text-sm text-gray-500">
              <a href="#" className="hover:text-white transition-colors">{t('privacy', 'Privacy')}</a>
              <a href="#" className="hover:text-white transition-colors">{t('terms', 'Terms')}</a>
              <a href="https://t.me/goldstandardcoin" className="hover:text-white transition-colors text-amber-500/80">{t('telegram', 'Telegram')}</a>
              <a href="https://github.com/gstdcoin" className="hover:text-white transition-colors">{t('github', 'GitHub')}</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: { ...(await serverSideTranslations(locale ?? 'en', ['common'])) },
});
