import Image from 'next/image';
import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useTonConnectUI } from '@tonconnect/ui-react';
import WalletConnect from '../components/WalletConnect';
import { useWalletStore } from '../store/walletStore';
import { API_BASE_URL } from '../lib/config';
import { Send, Shield, Globe, Activity, Sparkles, Brain, Zap, MessageSquare, Server, Cpu, ArrowRight, Wallet, Bot, ChevronDown, BookOpen, Terminal, Code2, Link2 } from 'lucide-react';

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
    if (isConnected && !checkingSession) router.push('/dashboard');
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
    <div className="min-h-screen bg-[#030014] text-white overflow-x-hidden">
      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-gradient-to-br from-violet-600/12 to-transparent rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-gradient-to-tl from-cyan-500/8 to-transparent rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <header className="py-3 px-4 sm:px-6 lg:px-12 backdrop-blur-xl bg-black/20 sticky top-0 z-30">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <Image src="/logo.png" alt="GSTD" width={32} height={32} className="rounded-full" />
              <span className="text-lg font-bold bg-gradient-to-r from-cyan-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">GSTD</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <a href="/stats" className="hidden md:block text-xs font-medium text-gray-500 hover:text-white transition-colors">{t('stats') || 'Stats'}</a>
              <a href="#docs-section" className="hidden md:block text-xs font-medium text-gray-500 hover:text-white transition-colors">{t('docs_title') || 'Docs'}</a>
              <button onClick={changeLanguage} className="px-2 sm:px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-medium hover:bg-white/10 transition-all flex-shrink-0">
                {router.locale === 'ru' ? 'EN' : 'RU'}
              </button>
              <WalletConnect />
            </div>
          </div>
        </header>

        {/* HERO */}
        <main className="flex-1 flex flex-col items-center px-4 sm:px-6 py-8 lg:py-12 overflow-y-auto">
          <div className="w-full max-w-3xl mx-auto">
            {/* Badge */}
            <div className="flex justify-center mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
                <span className="text-[11px] font-semibold text-emerald-300">{activeNodes} {t('workers_online') || 'nodes online'}</span>
              </div>
            </div>

            {/* Title */}
            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-black text-center mb-3 tracking-tight leading-[1.1]">
              <span className="text-white">{t('home_title_1') || 'Sovereign AI'}</span>{' '}
              <span className="bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">{t('home_title_2') || 'for Everyone'}</span>
            </h1>
            <p className="text-center text-gray-400 text-base mb-8 max-w-xl mx-auto">{t('home_subtitle') || 'More powerful than corporate AI. Decentralized. Uncensored. Gold-backed.'}</p>

            {/* Chat Input */}
            <div className="relative mb-6">
              <div className="flex items-end gap-2 p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-violet-500/20 focus-within:border-violet-500/30 transition-all shadow-[0_0_50px_rgba(139,92,246,0.04)]">
                <MessageSquare size={18} className="text-gray-500 mb-0.5 flex-shrink-0" />
                <textarea
                  ref={inputRef} value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder={t('home_chat_placeholder') || 'Ask anything — connect wallet to start...'}
                  rows={1} className="flex-1 bg-transparent text-white placeholder-gray-500 resize-none outline-none text-sm font-medium max-h-20 min-h-[24px]"
                  onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 80) + 'px'; }}
                />
                <button onClick={handleChatSubmit} className="flex-shrink-0 p-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition-all active:scale-95 shadow-lg shadow-violet-600/20">
                  <Send size={16} />
                </button>
              </div>
            </div>

            {/* === 3 VALUE PROPS === */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
              {/* Advanced Miner — No OpenClaw */}
              <button onClick={() => tonConnectUI.openModal()} className="group p-5 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-amber-500/30 hover:bg-amber-500/[0.03] transition-all text-left">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Zap className="w-5 h-5 text-amber-400" />
                </div>
                <h3 className="font-bold text-white text-sm mb-1">{t('vp_advanced_miner_title') || 'Advanced Miner (No OpenClaw)'}</h3>
                <p className="text-gray-500 text-xs leading-relaxed">{t('vp_advanced_miner_desc') || 'Personal AI assistant + miner + node for any device. Free hardware? Run our advanced miner — no OpenClaw required.'}</p>
              </button>
              {/* Earn */}
              <button onClick={() => tonConnectUI.openModal()} className="group p-5 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-emerald-500/30 hover:bg-emerald-500/[0.03] transition-all text-left">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Cpu className="w-5 h-5 text-emerald-400" />
                </div>
                <h3 className="font-bold text-white text-sm mb-1">{t('vp_earn_title') || 'Earn with your GPU'}</h3>
                <p className="text-gray-500 text-xs leading-relaxed">{t('vp_earn_desc') || 'Turn idle hardware into income. Your device processes AI tasks and earns GSTD tokens automatically.'}</p>
              </button>
              {/* Hire */}
              <button onClick={() => tonConnectUI.openModal()} className="group p-5 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-violet-500/30 hover:bg-violet-500/[0.03] transition-all text-left">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Brain className="w-5 h-5 text-violet-400" />
                </div>
                <h3 className="font-bold text-white text-sm mb-1">{t('vp_hire_title') || 'Hire Sovereign Agents'}</h3>
                <p className="text-gray-500 text-xs leading-relaxed">{t('vp_hire_desc') || 'Access uncensored AI models. No data collection. No corporate middlemen. Just sovereign intelligence.'}</p>
              </button>
              {/* Robots */}
              <button onClick={() => tonConnectUI.openModal()} className="group p-5 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-cyan-500/30 hover:bg-cyan-500/[0.03] transition-all text-left">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Bot className="w-5 h-5 text-cyan-400" />
                </div>
                <h3 className="font-bold text-white text-sm mb-1">{t('vp_robot_title') || 'Power OpenClaw Robots'}</h3>
                <p className="text-gray-500 text-xs leading-relaxed">{t('vp_robot_desc') || 'Connect physical robots to the AI grid. They earn GSTD for real-world tasks via the OpenClaw protocol.'}</p>
              </button>
            </div>

            {/* JOIN CTA */}
            <div className="flex justify-center mb-8">
              <button onClick={() => tonConnectUI.openModal()}
                className="group flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-600 text-white font-bold text-sm hover:opacity-90 transition-all active:scale-[0.98] shadow-[0_0_40px_rgba(139,92,246,0.2)]">
                <Sparkles size={18} />
                <span className="uppercase tracking-wider">{t('home_cta_join') || 'Join the Revolution'}</span>
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {/* 3-Step Guide - mobile-friendly vertical on xs, horizontal on sm+ */}
            <div className="flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-6 mb-8 text-center">
              {[
                { step: '1', label: t('step_connect') || 'Connect Wallet', icon: <Wallet size={14} /> },
                { step: '2', label: t('step_role') || 'Choose Role', icon: <Zap size={14} /> },
                { step: '3', label: t('step_start') || 'Start Earning', icon: <Activity size={14} /> },
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  {i > 0 && <div className="hidden sm:block w-6 h-px bg-white/10" />}
                  <div className="flex items-center gap-2 text-gray-400">
                    <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-bold flex-shrink-0">{s.step}</div>
                    <span className="text-xs font-medium">{s.label}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Stats */}
            <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-center mb-12">
              {[
                { value: `${goldReserve} XAUt`, label: t('stat_gold') || 'Golden Reserve', color: 'text-amber-400' },
                { value: activeNodes, label: t('stat_workers') || 'Active Nodes', color: 'text-emerald-400' },
                { value: `$${gstdPrice}`, label: 'GSTD Price', color: 'text-cyan-400' },
              ].map((s, i) => (
                <div key={i}>
                  <div className={`text-lg font-black ${s.color} tabular-nums`}>{s.value}</div>
                  <div className="text-[9px] text-gray-600 font-bold uppercase tracking-wider mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

          </div>

          {/* === DOCUMENTATION SECTION === */}
          <div id="docs-section" className="w-full max-w-3xl mx-auto mt-8 mb-12 px-2 scroll-mt-20">
            <div className="flex items-center justify-center gap-2 mb-6">
              <BookOpen size={18} className="text-violet-400" />
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">{t('docs_title') || 'Getting Started'}</h2>
            </div>
            <div className="space-y-3">
              <AccordionItem title={t('docs_users_title') || 'For Users — AI Chat'} icon={<MessageSquare size={16} />} defaultOpen={true}>
                <p><span className="text-white font-semibold">1.</span> Open <a href="https://app.gstdtoken.com" className="text-cyan-400 hover:underline">app.gstdtoken.com</a></p>
                <p><span className="text-white font-semibold">2.</span> Connect your TON wallet (Tonkeeper, TonHub, or any TonConnect wallet)</p>
                <p><span className="text-white font-semibold">3.</span> Start chatting — the AI responds instantly via sovereign models</p>
                <p className="text-gray-500 text-xs mt-2">Your queries are processed by decentralized compute nodes. No data is stored. No censorship.</p>
                <p className="mt-2 text-xs"><span className="text-emerald-400 font-bold">Cost:</span> Each query costs a small amount of GSTD tokens. New users receive a welcome bonus.</p>
              </AccordionItem>

              <AccordionItem title={t('vp_advanced_miner_title') || 'Advanced Miner (No OpenClaw)'} icon={<Zap size={16} />}>
                <p>Personal AI assistant + miner + node for any device. Free hardware but no OpenClaw? Use our advanced miner.</p>
                <p className="mt-2"><span className="text-white font-semibold">1.</span> Open <a href="https://app.gstdtoken.com" className="text-cyan-400 hover:underline">app.gstdtoken.com</a></p>
                <p><span className="text-white font-semibold">2.</span> Connect wallet → go to <a href="https://app.gstdtoken.com/agent" className="text-cyan-400 hover:underline">/agent</a></p>
                <p><span className="text-white font-semibold">3.</span> Ignite — AI chat, skill import, mining. All in one.</p>
                <p className="text-amber-400 text-xs mt-2 font-bold">Works on PC, laptop, phone. No OpenClaw required.</p>
              </AccordionItem>

              <AccordionItem title={t('docs_workers_title') || 'For Workers — Earn GSTD'} icon={<Terminal size={16} />}>
                <p className="font-semibold text-white mb-1">Desktop / Server (Recommended)</p>
                <div className="bg-black/40 rounded-xl p-3 font-mono text-xs text-cyan-300 overflow-x-auto">
                  curl -fsSL https://app.gstdtoken.com/install.sh | bash
                </div>
                <p className="mt-2 text-xs">This script will detect your system, install Docker & Ollama, pull optimized AI models, register your device as a compute node, and start earning GSTD automatically.</p>
                <p className="text-xs mt-1"><span className="text-amber-400 font-bold">Requirements:</span> 8GB+ RAM, modern CPU. GPU optional but increases earnings.</p>
                <p className="font-semibold text-white mt-3 mb-1">Mobile (Telegram)</p>
                <p className="text-xs">Open the GSTD Telegram Bot, tap <span className="text-emerald-400 font-bold">Start Mining</span>. Your phone processes lightweight tasks in the background (only when charging + WiFi).</p>
              </AccordionItem>

              <AccordionItem title={t('docs_developers_title') || 'For Developers — API Access'} icon={<Code2 size={16} />}>
                <p>GSTD offers an <span className="text-white font-semibold">OpenAI-compatible API</span>. Any tool that supports OpenAI can use GSTD.</p>
                <div className="bg-black/40 rounded-xl p-3 font-mono text-xs text-cyan-300 overflow-x-auto mt-2 whitespace-pre">{`curl https://api.gstdtoken.com/v1/chat/completions \\
  -H "Authorization: Bearer gstd_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gstd-sovereign","messages":[...]}'`}</div>
                <p className="text-xs mt-2"><span className="text-violet-400 font-bold">Compatible with:</span> Cursor, VS Code Copilot, LangChain, AutoGPT, CrewAI, and any OpenAI SDK client.</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
                  <div className="bg-white/5 rounded-lg p-2 text-center"><span className="text-emerald-400 font-bold block">gstd-fast</span>Instant / 0.01 GSTD</div>
                  <div className="bg-white/5 rounded-lg p-2 text-center"><span className="text-violet-400 font-bold block">gstd-sovereign</span>Fast / 0.05 GSTD</div>
                  <div className="bg-white/5 rounded-lg p-2 text-center"><span className="text-cyan-400 font-bold block">gstd-ultra</span>Best / 0.10 GSTD</div>
                </div>
              </AccordionItem>

              <AccordionItem title={t('docs_robots_title') || 'For Robots — OpenClaw Protocol'} icon={<Bot size={16} />}>
                <p>Physical robots and IoT devices connect via JSON-RPC to earn GSTD for real-world tasks.</p>
                <div className="bg-black/40 rounded-xl p-3 font-mono text-xs text-cyan-300 overflow-x-auto mt-2 whitespace-pre">{`POST https://api.gstdtoken.com/v1/openclaw/rpc
{
  "method": "claw.register",
  "params": { "wallet_address": "EQ...", "agent_type": "manipulator" }
}`}</div>
                <p className="text-xs mt-2">Robots earn GSTD for completed physical tasks. Rewards are credited automatically via the OpenClaw protocol.</p>
              </AccordionItem>

              <AccordionItem title={t('docs_links_title') || 'Useful Links'} icon={<Link2 size={16} />}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <a href="https://app.gstdtoken.com" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-cyan-400 text-xs font-medium">Dashboard</a>
                  <a href="https://app.gstdtoken.com/agent" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-violet-400 text-xs font-medium">Agent Node</a>
                  <a href="https://api.gstdtoken.com/v1" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-violet-400 text-xs font-medium">API Gateway</a>
                  <a href="/stats" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-emerald-400 text-xs font-medium">Network Stats</a>
                  <a href="https://t.me/goldstandardcoin" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-amber-400 text-xs font-medium">Telegram</a>
                </div>
              </AccordionItem>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-white/5">
          {/* Stats ticker */}
          <div className="overflow-hidden border-b border-white/5 bg-black/20">
            <div className="flex animate-marquee w-max py-2">
              <div className="flex items-center gap-8 px-6 shrink-0 text-[11px] text-gray-400">
                <span><span className="text-amber-400/90 font-semibold">{goldReserve}</span> XAUt Reserve</span>
                <span><span className="text-emerald-400/90 font-semibold">{activeNodes}</span> {t('workers_online')}</span>
                <span><span className="text-violet-400/90 font-semibold">{gstdPrice}</span> $/GSTD</span>
                <span><span className="text-cyan-400/90 font-semibold">{totalTasks}</span> {t('stat_tasks')}</span>
              </div>
              <div className="flex items-center gap-8 px-6 shrink-0 text-[11px] text-gray-400" aria-hidden="true">
                <span><span className="text-amber-400/90 font-semibold">{goldReserve}</span> XAUt Reserve</span>
                <span><span className="text-emerald-400/90 font-semibold">{activeNodes}</span> {t('workers_online')}</span>
                <span><span className="text-violet-400/90 font-semibold">{gstdPrice}</span> $/GSTD</span>
                <span><span className="text-cyan-400/90 font-semibold">{totalTasks}</span> {t('stat_tasks')}</span>
              </div>
            </div>
          </div>
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3 py-4 px-6">
            <div className="flex items-center gap-4 text-[10px] text-gray-600">
              <span className="flex items-center gap-1"><Shield size={10} /> MiCA</span>
              <span className="flex items-center gap-1"><Zap size={10} /> TON</span>
              <span className="flex items-center gap-1"><Globe size={10} /> DePIN</span>
            </div>
            <div className="flex items-center gap-4 text-[10px]">
              <a href="https://t.me/goldstandardcoin" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-white transition-colors">Telegram</a>
              <a href="https://github.com/gstdcoin" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-white transition-colors">GitHub</a>
              <a href="/docs" className="text-gray-500 hover:text-white transition-colors">{t('docs_title') || 'Docs'}</a>
              <span className="text-gray-700">&copy; 2026 GSTD</span>
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
