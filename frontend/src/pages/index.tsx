import Image from 'next/image';
import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useTonConnectUI } from '@tonconnect/ui-react';
import WalletConnect from '../components/WalletConnect';
import LeviathanLiveTicker from '../components/LeviathanLiveTicker';
import { useWalletStore } from '../store/walletStore';
import { API_BASE_URL } from '../lib/config';
import { Send, Shield, Globe, Activity, Sparkles, Brain, Zap, MessageSquare, Server, Cpu, ArrowRight, Wallet, Bot, ChevronDown, BookOpen, Terminal, Code2, Link2, DollarSign, TrendingDown, TrendingUp } from 'lucide-react';
import SwarmVisualization from '../components/home/SwarmVisualization';

function AccordionItem({ title, icon, children, defaultOpen = false }: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-white/10 rounded-2xl overflow-hidden bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-3 p-4 sm:p-5 text-left">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400 flex-shrink-0">{icon}</div>
          <span className="text-sm sm:text-base font-bold text-white">{title}</span>
        </div>
        <ChevronDown size={16} className={`text-gray-500 transition-transform duration-300 flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-0 text-sm text-gray-400 leading-relaxed space-y-2">
          {children}
        </div>
      </div>
    </div>
  );
}

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

export default function Home() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { isConnected } = useWalletStore();
  const [tonConnectUI] = useTonConnectUI();
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setIsClient(true); }, []);

  // Fetch network stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/network/stats`);
        if (res.ok) setNetworkStats(await res.json());
      } catch { /* silent */ }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setCheckingSession(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const changeLanguage = () => {
    router.push(router.pathname, router.asPath, { locale: router.locale === 'ru' ? 'en' : 'ru' });
  };

  useEffect(() => {
    if (isConnected && !checkingSession) {
      const source = router.query.source as string;
      const mode = router.query.mode as string;
      const params = new URLSearchParams();
      if (source) params.set('source', source);
      if (mode) params.set('mode', mode);
      const q = params.toString() ? '?' + params.toString() : '';
      router.push('/dashboard' + q);
    }
  }, [isConnected, checkingSession, router]);

  const handleChatSubmit = () => {
    if (!chatInput.trim()) return;
    if (typeof window !== 'undefined') window.sessionStorage.setItem('pending_chat', chatInput);
    tonConnectUI.openModal();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSubmit(); }
  };

  if (isConnected || checkingSession) {
    return (
      <div className="min-h-screen bg-[#030014] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-violet-500 opacity-50" />
      </div>
    );
  }

  const goldReserve = networkStats?.gold_reserve?.toFixed(4) || '0.0000';
  const activeNodes = networkStats?.active_workers?.toLocaleString() || '—';
  const totalTasks = networkStats?.total_tasks?.toLocaleString() || '—';
  const gstdPrice = networkStats?.gstd_price_usd?.toFixed(6) || '0.015000';

  return (
    <div className="min-h-screen bg-[#030014] text-white overflow-x-hidden font-sans selection:bg-violet-500/30">
      {/* Background Ambience */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-violet-600/10 rounded-full blur-[120px] mix-blend-screen" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[120px] mix-blend-screen" />
        <div className="absolute top-[40%] left-[20%] w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-[100px] mix-blend-screen" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Leviathan Ticker + Public Proof of Intelligence */}
        <div className="bg-black/40 backdrop-blur-md border-b border-white/5">
          {networkStats != null && (
            <div className="px-4 py-1.5 text-center text-[11px] font-medium text-cyan-400/90 border-b border-white/5">
              Current Network IQ: {networkStats.network_iq != null ? networkStats.network_iq.toFixed(1) : '—'} | Global Brain Latency: {networkStats.global_brain_latency_ms ?? '—'}ms
            </div>
          )}
          <LeviathanLiveTicker />
        </div>

        {/* Header */}
        <header className="px-6 py-5 flex justify-between items-center max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10">
              <Image src="/logo.png" alt="GSTD" width={40} height={40} className="rounded-full relative z-10" />
              <div className="absolute inset-0 bg-violet-500/50 blur-lg rounded-full animate-pulse" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight block leading-none">GSTD</span>
              <span className="text-[10px] text-amber-400 font-bold tracking-widest uppercase">Gold Standard</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-400">
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#stats" className="hover:text-white transition-colors">Network</a>
              <a href="/docs" className="hover:text-white transition-colors">Docs</a>
            </nav>
            <div className="h-6 w-px bg-white/10 hidden md:block" />
            <button onClick={changeLanguage} className="text-xs font-bold text-gray-500 hover:text-white uppercase transition-colors">
              {router.locale === 'ru' ? 'EN' : 'RU'}
            </button>
            <WalletConnect />
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12 lg:py-20 w-full max-w-7xl mx-auto">

          {/* HERO SECTION */}
          <div className="text-center max-w-4xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-bold tracking-wide text-cyan-400 mb-6 animate-in fade-in slide-in-from-top-4 duration-700">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              DePIN Compute Protocol • Live
            </div>

            <h1 className="text-5xl sm:text-7xl font-black tracking-tight mb-6 leading-[1.1]">
              <span className="block text-white">Sovereign Intelligence.</span>
              <span className="block bg-gradient-to-r from-amber-300 via-amber-500 to-yellow-600 bg-clip-text text-transparent">Backed by Gold.</span>
            </h1>

            <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed mb-10">
              The first distributed AI network where compute power is tokenized and secured by physical gold reserves (XAUt).
              <span className="block mt-2 text-gray-500 text-base">Uncensored. Decentralized. Permanent.</span>
            </p>

            {/* Interactive Chat Hook */}
            <div className="w-full max-w-2xl mx-auto relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 to-cyan-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
              <div className="relative bg-[#0a0a0a] rounded-xl border border-white/10 p-2 pl-4 flex items-center gap-3 shadow-2xl">
                <Bot className="text-violet-500 animate-pulse" size={24} />
                <input
                  ref={inputRef}
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('home_chat_placeholder') || "Ask the Hive Intelligence anything..."}
                  className="flex-1 bg-transparent border-none outline-none text-white h-12 placeholder-gray-600"
                />
                <button
                  onClick={handleChatSubmit}
                  className="h-10 px-6 rounded-lg bg-white text-black font-bold hover:bg-gray-200 transition-colors flex items-center gap-2"
                >
                  <span>Try AI</span>
                  <ArrowRight size={16} />
                </button>
              </div>
              <div className="flex gap-4 mt-3 ml-2">
                <button onClick={() => setChatInput("Analyze the ETH chart")} className="text-xs text-xs text-gray-600 hover:text-cyan-400 transition-colors border border-white/5 px-2 py-1 rounded-md">Analyze ETH</button>
                <button onClick={() => setChatInput("Generate a Python script")} className="text-xs text-xs text-gray-600 hover:text-violet-400 transition-colors border border-white/5 px-2 py-1 rounded-md">Code Python</button>
                <button onClick={() => setChatInput("Explain Quantum Physics")} className="text-xs text-xs text-gray-600 hover:text-emerald-400 transition-colors border border-white/5 px-2 py-1 rounded-md">Explain Physics</button>
              </div>
            </div>
          </div>

          {/* DUAL PATHWAY CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-5xl mb-20" id="features">
            {/* Consumer Path */}
            <div className="group relative p-8 rounded-3xl bg-white/[0.02] border border-white/10 hover:bg-white/[0.04] transition-all overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-40 transition-opacity">
                <Brain size={120} className="text-violet-500" />
              </div>
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-violet-500/20 flex items-center justify-center mb-6">
                  <MessageSquare className="text-violet-400" size={24} />
                </div>
                <h2 className="text-2xl font-bold mb-3 text-white">Use Intelligence</h2>
                <p className="text-gray-400 mb-8 leading-relaxed h-12">
                  Access censorship-free AI models. Pay per request with privacy-preserving architecture.
                </p>
                <button
                  onClick={() => tonConnectUI.openModal()}
                  className="flex items-center gap-2 text-violet-400 font-bold hover:gap-3 transition-all"
                >
                  Start Chatting <ArrowRight size={16} />
                </button>
              </div>
            </div>

            {/* Provider Path */}
            <div className="group relative p-8 rounded-3xl bg-white/[0.02] border border-white/10 hover:bg-white/[0.04] transition-all overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-40 transition-opacity">
                <Server size={120} className="text-emerald-500" />
              </div>
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center mb-6">
                  <Zap className="text-emerald-400" size={24} />
                </div>
                <h2 className="text-2xl font-bold mb-3 text-white">Provide Compute</h2>
                <p className="text-gray-400 mb-8 leading-relaxed h-12">
                  Turn your idle device into a node. Earn GSTD backed by real gold reserves.
                </p>
                <button
                  onClick={() => tonConnectUI.openModal()}
                  className="flex items-center gap-2 text-emerald-400 font-bold hover:gap-3 transition-all"
                >
                  Ignite Miner <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* GLOBAL VISUALIZATION: 3D-like Swarm + Gold Backing */}
          <div className="w-full max-w-5xl mb-16">
            <SwarmVisualization
              activeNodes={networkStats?.active_workers ?? 0}
              goldReserve={networkStats?.gold_reserve ?? 0}
              className="h-[320px] sm:h-[400px]"
            />
          </div>

          {/* NETWORK STATS STRIP */}
          <div className="w-full max-w-5xl grid grid-cols-2 md:grid-cols-4 gap-4 mb-20" id="stats">
            <div className="p-6 rounded-2xl bg-black/40 border border-white/5 text-center">
              <div className="text-3xl font-black text-amber-400 mb-1">{goldReserve}</div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">XAUt Reserve</div>
            </div>
            <div className="p-6 rounded-2xl bg-black/40 border border-white/5 text-center">
              <div className="text-3xl font-black text-emerald-400 mb-1">{activeNodes}</div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Active Nodes</div>
            </div>
            <div className="p-6 rounded-2xl bg-black/40 border border-white/5 text-center">
              <div className="text-3xl font-black text-cyan-400 mb-1">{totalTasks}</div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Tasks Completed</div>
            </div>
            <div className="p-6 rounded-2xl bg-black/40 border border-white/5 text-center">
              <div className="text-3xl font-black text-violet-400 mb-1">{gstdPrice}</div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">GSTD Price ($)</div>
            </div>
          </div>

          {/* VISUAL EVOLUTION: Nodes → Latency ↓, IQ ↑ */}
          <div className="w-full max-w-5xl mb-20">
            <div className="p-6 rounded-2xl bg-gradient-to-br from-violet-500/5 to-cyan-500/5 border border-white/10">
              <h3 className="text-sm font-bold text-white/90 mb-4 flex items-center gap-2">
                <Activity size={18} className="text-cyan-400" />
                Visual Evolution: Network Intelligence
              </h3>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-8">
                <div className="flex flex-col items-center">
                  <div className="text-2xl font-black text-emerald-400">{activeNodes}</div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Nodes</div>
                </div>
                <ArrowRight size={24} className="text-white/30 rotate-90 sm:rotate-0" />
                <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-1">
                      <TrendingDown size={16} className="text-cyan-400" />
                      <span className="text-xl font-black text-cyan-400">{networkStats?.global_brain_latency_ms ?? '—'}ms</span>
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Latency</div>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-1">
                      <TrendingUp size={16} className="text-amber-400" />
                      <span className="text-xl font-black text-amber-400">{networkStats?.network_iq != null ? networkStats.network_iq.toFixed(1) : '—'}</span>
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Network IQ</div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-4 text-center max-w-md mx-auto">
                More nodes → lower latency, higher intelligence. Join the swarm to strengthen the collective brain.
              </p>
            </div>
          </div>

          {/* DOCUMENTATION / FAQ */}
          <div className="w-full max-w-3xl" id="docs-section">
            <div className="flex items-center gap-3 mb-8">
              <BookOpen className="text-gray-400" size={20} />
              <h3 className="text-xl font-bold text-white">Documentation & Guide</h3>
            </div>
            <div className="space-y-4">
              <AccordionItem title="How does Gold Backing work?" icon={<Shield size={18} />} defaultOpen={true}>
                <p>Every GSTD token is backed by real physical gold (XAUt). The protocol automatically converts 70% of net revenue into gold reserves, creating a rising floor price. A cryptographic Nightly Audit verifies the reserves every 24 hours.</p>
              </AccordionItem>
              <AccordionItem title="How do I earn?" icon={<DollarSign size={18} />}>
                <p>Connect your wallet and click "Ignite Miner". Your device will process small AI tasks (inference) in the background. You are paid in GSTD for every valid result. No specialized hardware is required for basic mining.</p>
              </AccordionItem>
              <AccordionItem title="Is it decentralized?" icon={<Globe size={18} />}>
                <p>Yes. The GSTD network uses a swarm architecture. There is no central server controlling the intelligence. Your data is processed across distributed nodes using secure multi-party computation.</p>
              </AccordionItem>
            </div>
          </div>

        </main>

        <footer className="border-t border-white/5 bg-black/40 py-12 px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2 opacity-50">
              <Image src="/logo.png" alt="GSTD" width={24} height={24} className="grayscale" />
              <span className="text-sm font-medium">© 2026 Gold Standard DePIN</span>
            </div>
            <div className="flex gap-6 text-sm text-gray-500">
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
              <a href="https://t.me/goldstandardcoin" className="hover:text-white transition-colors text-amber-500/80">Telegram</a>
              <a href="https://github.com/gstdcoin" className="hover:text-white transition-colors">GitHub</a>
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
