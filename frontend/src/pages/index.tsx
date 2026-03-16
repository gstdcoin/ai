import Link from 'next/link';
import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../lib/config';
import { MessageSquare, ArrowRight, Bot, Brain, Building2, Activity, Zap, Server, Shield, Globe } from 'lucide-react';
import dynamic from 'next/dynamic';

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
  total_burned?: number;
  total_users?: number;
  total_nodes?: number;
}

interface Tokenomics {
  circulating_supply: number;
  max_supply: number;
  total_burned: number;
  total_minted: number;
  remaining_supply: number;
  supply_mined_pct: number;
  burn_rate_pct: number;
  base_reward_per_hour: number;
  epoch: number;
  next_halving_in_days: number;
}

function StatCard({ value, label, color, icon, emoji, sub }: {
  value: string;
  label: string;
  color: string;
  icon?: React.ReactNode;
  emoji?: string;
  sub?: string;
}) {
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
    <div className={`p-6 rounded-2xl glass-pro shine-on-hover transition-all duration-500 text-center relative overflow-hidden ${flash ? 'stat-flash' : ''}`}>
      {/* Emoji icon (gstdbot style) */}
      {emoji && <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.85, lineHeight: 1 }}>{emoji}</div>}
      {/* Lucide icon fallback */}
      {!emoji && icon && <div className="mb-2 flex justify-center opacity-50">{icon}</div>}
      {/* Value */}
      <div className={`text-3xl font-black ${color} mb-0.5 counter-value leading-none`}>{value}</div>
      {/* Optional sub-unit (e.g. "XAUt", "GSTD") */}
      {sub && <div className={`text-sm font-bold ${color} opacity-70 mb-1`}>{sub}</div>}
      {/* Label */}
      <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mt-1">{label}</div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function Home() {
  const { t } = useTranslation('common');
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [tokenomics, setTokenomics] = useState<Tokenomics | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => { setIsClient(true); }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [netRes, tokRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/v1/network/stats`),
          fetch(`${API_BASE_URL}/api/v1/sovereign/tokenomics`),
        ]);
        if (netRes.ok) setNetworkStats(await netRes.json());
        if (tokRes.ok) setTokenomics(await tokRes.json());
      } catch (_e) { /* silent */ }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, []);

  const goldReserve = networkStats?.gold_reserve?.toFixed(4) || '—';
  const totalNodes = networkStats?.total_nodes?.toLocaleString() || '—';
  const totalTasks = networkStats?.total_tasks?.toLocaleString() || '—';
  const gstdPrice = networkStats?.gstd_price_usd && networkStats.gstd_price_usd > 0 ? '$' + networkStats.gstd_price_usd.toFixed(6) : '—';
  const circulatingSupply = tokenomics ? tokenomics.circulating_supply.toFixed(0) : '—';
  const totalBurned = tokenomics?.total_burned?.toFixed(4) || networkStats?.total_burned?.toFixed(4) || '0';
  const totalMinted = tokenomics ? tokenomics.total_minted.toFixed(0) : '—';
  const totalUsers = networkStats?.total_users?.toLocaleString() || '—';

  return (
    <div className="min-h-screen bg-[#030014] text-white overflow-x-hidden font-sans selection:bg-violet-500/30">
      {/* ═══════ AMBIENT MESH BACKGROUND ═══════ */}
      {isClient && <AmbientMesh activeNodes={networkStats?.active_workers ?? 0} />}

      {/* Gradient overlay */}
      <div className="fixed inset-0 z-[1] pointer-events-none">
        <div className="absolute top-0 left-0 right-0 h-[40%] bg-gradient-to-b from-[#030014] to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-[30%] bg-gradient-to-t from-[#030014] to-transparent" />
      </div>

      <div className="relative z-10">
        {/* ═══════ LIVE RIBBON ═══════ */}
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

        {/* ═══════ HERO ═══════ */}
        <section className="px-4 sm:px-6 py-16 lg:py-24 w-full max-w-7xl mx-auto">
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
              {t('hero_desc', 'GSTD forms a decentralized planetary brain. By contributing your unused compute power, you become a neural node—helping humanity solve complex global problems. 77 apps, wallet auth, auto-SSL, self-diagnostics. Access the Hive Mind, or')}{' '}
              <span className="text-emerald-400 font-bold">{t('connect_devices', 'connect your devices')}</span>{' '}
              {t('connect_devices_earn', 'to earn GSTD.')}
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-lg mx-auto">
              <Link
                href="/chat"
                className="group relative w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-bold text-lg shadow-xl shadow-violet-500/20 hover:shadow-violet-500/40 hover:scale-[1.03] active:scale-[0.98] transition-all duration-300"
              >
                <Bot size={22} className="group-hover:scale-110 transition-transform" />
                <span>{t('try_sovereign_ai', 'Try Sovereign AI')}</span>
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
        </section>

        {/* ═══════ WHAT YOU GET (3 columns) ═══════ */}
        <section className="px-4 sm:px-6 pb-20 w-full max-w-6xl mx-auto" id="features">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20 stagger-in">
            {/* Use Sovereign AI */}
            <div className="group p-8 rounded-3xl glass-pro gradient-border shine-on-hover transition-all duration-500">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/15 flex items-center justify-center mb-6 glow-breathe">
                <MessageSquare className="text-violet-400" size={24} />
              </div>
              <h2 className="text-xl font-black tracking-tight mb-3 text-white">{t('tap_hive', 'Tap the Hive Mind')}</h2>
              <p className="text-gray-400 mb-6 leading-relaxed text-sm">
                {t('tap_hive_desc', 'Use the Global Brain to solve any task. Pay with GSTD to route your queries through the collective intelligence of thousands of nodes. True privacy, open-source models, zero corporate control.')}
              </p>
              <Link href="/chat" className="flex items-center gap-2 text-violet-400 font-black hover:gap-3 transition-all text-sm" style={{ textDecoration: 'none' }}>
                {t('access_intelligence', 'Access Intelligence')} <ArrowRight size={14} />
              </Link>
            </div>

            {/* Run a Node */}
            <div className="group p-8 rounded-3xl glass-pro gradient-border shine-on-hover transition-all duration-500">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-6 glow-breathe" style={{ animationDelay: '2s' }}>
                <Server className="text-emerald-400" size={24} />
              </div>
              <h2 className="text-xl font-black tracking-tight mb-3 text-white">{t('become_node', 'Become a Neural Node')}</h2>
              <p className="text-gray-400 mb-6 leading-relaxed text-sm">
                {t('become_node_desc', 'Turn any computer into a sovereign AI node. 77 apps, wallet auth, Let\'s Encrypt SSL, DynDNS, self-diagnostics, earnings calculator. One command to install, Telegram to manage.')}
              </p>
              <a href="https://gstdbot.gstdtoken.com" className="flex items-center gap-2 text-emerald-400 font-black hover:gap-3 transition-all text-sm" style={{ textDecoration: 'none' }}>
                {t('ignite_your_node', 'Ignite Your Node')} <ArrowRight size={14} />
              </a>
            </div>

            {/* Gold-Backed */}
            <div className="group p-8 rounded-3xl glass-pro gradient-border shine-on-hover transition-all duration-500">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 flex items-center justify-center mb-6 glow-breathe" style={{ animationDelay: '4s' }}>
                <Shield className="text-amber-400" size={24} />
              </div>
              <h2 className="text-xl font-black tracking-tight mb-3 text-white">{t('goldbacked', 'Gold-Backed')}</h2>
              <p className="text-gray-400 mb-6 leading-relaxed text-sm">
                {t('gold_backed_desc', 'GSTD is secured by physical gold reserves. Decentralized. Uncensored.')} {t('manifesto_desc', 'Any device joins the swarm. No tokens? Earn by contributing. Have tokens? Unlock advanced AI. The network learns and grows with every request.')}
              </p>
              <a href="https://t.me/goldstandardcoin" className="flex items-center gap-2 text-amber-400 font-black hover:gap-3 transition-all text-sm" style={{ textDecoration: 'none' }}>
                {t('telegram', 'Telegram')} <ArrowRight size={14} />
              </a>
            </div>
          </div>

          {/* ═══════ NODE OS FEATURES STRIP ═══════ */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-20 stagger-in">
            <div className="p-4 rounded-2xl glass-pro text-center">
              <div style={{ fontSize: 22, marginBottom: 6 }}>🔐</div>
              <div className="text-xs font-bold text-white">Wallet Auth</div>
              <div className="text-[10px] text-gray-500">TON Connect</div>
            </div>
            <div className="p-4 rounded-2xl glass-pro text-center">
              <div style={{ fontSize: 22, marginBottom: 6 }}>🌐</div>
              <div className="text-xs font-bold text-white">Auto SSL</div>
              <div className="text-[10px] text-gray-500">Let's Encrypt</div>
            </div>
            <div className="p-4 rounded-2xl glass-pro text-center">
              <div style={{ fontSize: 22, marginBottom: 6 }}>📡</div>
              <div className="text-xs font-bold text-white">DynDNS</div>
              <div className="text-[10px] text-gray-500">5 providers</div>
            </div>
            <div className="p-4 rounded-2xl glass-pro text-center">
              <div style={{ fontSize: 22, marginBottom: 6 }}>🩺</div>
              <div className="text-xs font-bold text-white">Self-Heal</div>
              <div className="text-[10px] text-gray-500">8 auto-checks</div>
            </div>
            <div className="p-4 rounded-2xl glass-pro text-center">
              <div style={{ fontSize: 22, marginBottom: 6 }}>📦</div>
              <div className="text-xs font-bold text-white">77 Apps</div>
              <div className="text-[10px] text-gray-500">Docker store</div>
            </div>
            <a href="/bridge" style={{ textDecoration: 'none' }} className="p-4 rounded-2xl glass-pro text-center hover:scale-[1.05] transition-transform">
              <div style={{ fontSize: 22, marginBottom: 6 }}>🔗</div>
              <div className="text-xs font-bold text-white">Bridge</div>
              <div className="text-[10px] text-gray-500">Cross-chain</div>
            </a>
            <a href="/leaderboard" style={{ textDecoration: 'none' }} className="p-4 rounded-2xl glass-pro text-center hover:scale-[1.05] transition-transform">
              <div style={{ fontSize: 22, marginBottom: 6 }}>🏆</div>
              <div className="text-xs font-bold text-white">Leaderboard</div>
              <div className="text-[10px] text-gray-500">Top nodes</div>
            </a>
          </div>

          {/* ═══════ NETWORK STATS ═══════ */}
          <div className="w-full max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 stagger-in" id="stats">
            <StatCard value={totalUsers} label={t('total_users', 'Users')} color="text-emerald-400" emoji="👥" />
            <StatCard value={totalNodes} label={t('total_nodes', 'Nodes')} color="text-cyan-400" emoji="📡" />
            <StatCard value={totalTasks} label={t('tasks_completed', 'Tasks')} color="text-violet-400" emoji="⚡" />
            <StatCard value={goldReserve} sub="XAUt" label={t('xaut_reserve', 'Gold Reserve')} color="text-amber-400" emoji="🥇" />
          </div>

          {/* ═══════ TOKENOMICS ═══════ */}
          <div className="w-full max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 mb-20 stagger-in">
            <StatCard value={circulatingSupply} label={t('circulating_supply', 'Circulating')} color="text-cyan-400" emoji="🌐" />
            <StatCard value={totalMinted} label={t('total_minted', 'Total Minted')} color="text-violet-400" emoji="🪙" />
            <StatCard value={totalBurned} label={t('total_burned', 'Burned')} color="text-red-400" emoji="🔥" />
            <StatCard value={gstdPrice} label={t('gstd_price_usd', 'GSTD Price ($)')} color="text-amber-400" emoji="💎" />
          </div>

          {/* ═══════ LIVE NETWORK PULSE ═══════ */}
          <div className="w-full max-w-5xl mx-auto mb-20" id="pulse">
            {isClient && <LivePulse className="glow-breathe" />}
          </div>

          {/* ═══════ HOW IT WORKS ═══════ */}
          <div className="w-full max-w-3xl mx-auto mb-16 stagger-in">
            <div className="p-8 rounded-3xl glass-pro gradient-border">
              <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <Activity size={18} className="text-cyan-400" />
                {t('how_it_works', 'How it works')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center mx-auto mb-3">
                    <Globe className="text-emerald-400" size={18} />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1">{t('no_tokens', 'No tokens?')}</h4>
                  <p className="text-xs text-gray-400">{t('no_tokens_desc', 'Connect your device and earn GSTD by contributing compute. Any device can join the swarm.')}</p>
                </div>
                <div className="text-center">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center mx-auto mb-3">
                    <Zap className="text-violet-400" size={18} />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1">{t('have_tokens', 'Have tokens?')}</h4>
                  <p className="text-xs text-gray-400">{t('have_tokens_desc', 'Unlock advanced AI features: better models, Hive Memory, and priority access.')}</p>
                </div>
                <div className="text-center">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center mx-auto mb-3">
                    <Shield className="text-amber-400" size={18} />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1">{t('goldbacked', 'Gold-backed.')}</h4>
                  <p className="text-xs text-gray-400">{t('gold_backed_desc', 'GSTD is secured by physical gold reserves. Decentralized. Uncensored.')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ═══════ SUPER-PREMIUM TIERS ═══════ */}
          <div className="w-full max-w-5xl mx-auto mb-20 stagger-in">
            <div className="text-center mb-10">
              <h3 className="text-2xl sm:text-3xl font-black text-white mb-3">{t('super_premium', 'Super-Premium Tiers')}</h3>
              <p className="text-sm text-gray-400 max-w-xl mx-auto">{t('super_premium_desc', 'Unlock enterprise capabilities. All token distributions go through the platform with 5% commission. Signed transactions only.')}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Validator */}
              <div className="group p-6 rounded-3xl glass-pro gradient-border shine-on-hover transition-all duration-500 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full blur-[60px]" />
                <div className="w-12 h-12 rounded-2xl bg-violet-500/15 flex items-center justify-center mb-4">
                  <Shield className="text-violet-400" size={24} />
                </div>
                <h4 className="text-lg font-black text-white mb-1">🔷 TON Validator</h4>
                <div className="text-xs text-violet-400 font-bold mb-3">1,000,000 GSTD</div>
                <p className="text-xs text-gray-400 leading-relaxed mb-4">{t('validator_desc', 'Run a TON validator. Other nodes see your validator and can stake. Earn commission on staking rewards. 12-20% APY.')}</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">Staking</span>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">12-20% APY</span>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">Signed TX</span>
                </div>
              </div>

              {/* Training */}
              <div className="group p-6 rounded-3xl glass-pro gradient-border shine-on-hover transition-all duration-500 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-[60px]" />
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 flex items-center justify-center mb-4">
                  <Brain className="text-cyan-400" size={24} />
                </div>
                <h4 className="text-lg font-black text-white mb-1">🧠 Model Training</h4>
                <div className="text-xs text-cyan-400 font-bold mb-3">10,000,000 GSTD</div>
                <p className="text-xs text-gray-400 leading-relaxed mb-4">{t('training_desc', 'Train custom AI models on swarm GPU/CPU resources. Tokens spent are distributed among contributing nodes. Use the collective power.')}</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">GPU + CPU</span>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">Distributed</span>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">Swarm Memory</span>
                </div>
              </div>

              {/* Enterprise */}
              <div className="group p-6 rounded-3xl glass-pro gradient-border shine-on-hover transition-all duration-500 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-[60px]" />
                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 flex items-center justify-center mb-4">
                  <Building2 className="text-amber-400" size={24} />
                </div>
                <h4 className="text-lg font-black text-white mb-1">🏢 Enterprise Swarm</h4>
                <div className="text-xs text-amber-400 font-bold mb-3">100,000,000 GSTD</div>
                <p className="text-xs text-gray-400 leading-relaxed mb-4">{t('enterprise_desc', 'Rent the swarm for distributed computing. Fault-tolerant, enterprise-grade. GSTD tokens distributed among participating nodes.')}</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Data Centers</span>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Fault-Tolerant</span>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">SLA</span>
                </div>
              </div>
            </div>
            <div className="text-center mt-6">
              <p className="text-[11px] text-gray-600">💰 5% platform commission · 95% distributed to node operators · All transactions signed by initiator</p>
            </div>
          </div>

          {/* ═══════ QUICK INSTALL ═══════ */}
          <div className="w-full max-w-3xl mx-auto stagger-in">
            <div className="p-8 rounded-3xl glass-pro gradient-border text-center">
              <h3 className="text-lg font-bold text-white mb-2">⚡ {t('deploy_in_seconds', 'Deploy in seconds')}</h3>
              <p className="text-sm text-gray-400 mb-6">{t('install_desc', 'Run your own GSTD Node and start earning')}</p>
              <div className="bg-black/40 rounded-xl p-4 font-mono text-sm text-emerald-400 border border-emerald-500/20 mb-4 flex items-center justify-between gap-4">
                <code>curl -fsSL https://gstdbot.gstdtoken.com/install.sh | bash</code>
                <button 
                  onClick={() => { navigator.clipboard.writeText('curl -fsSL https://gstdbot.gstdtoken.com/install.sh | bash'); }}
                  className="text-xs text-gray-400 hover:text-white border border-white/10 rounded px-3 py-1 transition-colors whitespace-nowrap"
                >Copy</button>
              </div>
              <div className="flex gap-4 justify-center text-xs text-gray-500">
                <span>🐧 Linux</span>
                <span>🍎 macOS</span>
                <span>🪟 WSL</span>
                <span>🐳 Docker</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: { ...(await serverSideTranslations(locale ?? 'en', ['common'])) },
});
