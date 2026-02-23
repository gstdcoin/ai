import { useEffect, useState, lazy, Suspense, memo, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { useRouter } from 'next/router';
import { useWalletStore } from '../../store/walletStore';
import BottomNav from '../layout/BottomNav';
import Header from '../layout/Header';
import TasksPanel from './TasksPanel';
import DevicesPanel from './DevicesPanel';
import StatsPanel from './StatsPanel';
import HelpPanel from './HelpPanel';
import Marketplace from '../marketplace/Marketplace';
import ChatPanel from './ChatPanel';
import { Tab } from '../../types/tabs';
import { useTonConnectUI } from '@tonconnect/ui-react';
import SystemStatusWidget from './SystemStatusWidget';
import { toast } from '../../lib/toast';
import { Activity, Server, Wallet, CheckCircle, ShoppingCart, Globe, Zap, TrendingUp } from 'lucide-react';
import { apiGet, apiPost } from '../../lib/apiClient';
import Sidebar from '../layout/Sidebar';
import { ComponentErrorBoundary } from '../common/ComponentErrorBoundary';
import { workerService } from '../../services/WorkerService';
import { InstallPwaPrompt } from '../common/InstallPwaPrompt';
import { ActivityFeed } from './ActivityFeed';
import { SwarmActivityWidget } from './SwarmActivityWidget';
import AgentMarketplace from '../agents/AgentMarketplace';
import ReferralPanel from '../referrals/ReferralPanel';
import { isTelegramWebApp, triggerHapticImpact } from '../../lib/telegram';

const ReferralModal = lazy(() => import('./ReferralModal'));

interface NetworkStats {
  active_workers: number;
  total_gstd_paid: number;
  tasks_24h: number;
  temperature: number;
  pressure: number;
  total_hashrate: number;
}

interface DashboardProps {
  initialTab?: string;
  initialMode?: 'standard' | 'ultra';
  sourceTelegram?: boolean;
  modeMining?: boolean;
}

function Dashboard({ initialTab, initialMode, sourceTelegram, modeMining }: DashboardProps = {}) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { address, disconnect, gstdBalance, pendingEarnings } = useWalletStore();
  const [tonConnectUI] = useTonConnectUI();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const valid: Tab[] = ['home', 'chat', 'tasks', 'devices', 'stats', 'help', 'marketplace', 'agents', 'referrals', 'more'];
    if (initialTab && valid.includes(initialTab as Tab)) return initialTab as Tab;
    return 'chat';
  });
  const [isMining, setIsMining] = useState(false);
  const [isIgniting, setIsIgniting] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [neuralStatus, setNeuralStatus] = useState('SYNCING_WITH_SWARM...');
  const [healthScore, setHealthScore] = useState(0.92);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const pending = window.sessionStorage.getItem('pending_chat');
      if (pending) {
        setActiveTab('chat');
        window.sessionStorage.removeItem('pending_chat');
      }
    }
  }, []);

  useEffect(() => {
    const unsub = workerService.subscribe((state) => {
      setIsMining(state === 'running' || state === 'igniting');
      setIsIgniting(state === 'igniting');
    });
    return unsub;
  }, []);

  useEffect(() => {
    const valid: Tab[] = ['home', 'chat', 'tasks', 'devices', 'stats', 'help', 'marketplace', 'agents', 'referrals', 'more'];
    if (initialTab && valid.includes(initialTab as Tab)) {
      setActiveTab(initialTab as Tab);
      return;
    }
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('activeTab') : null;
    if (saved && valid.includes(saved as Tab)) setActiveTab(saved as Tab);
  }, [initialTab]);

  useEffect(() => {
    if (typeof window !== 'undefined' && activeTab) {
      try { window.localStorage.setItem('activeTab', activeTab); } catch { }
    }
  }, [activeTab]);

  const handleTabChange = useCallback((tab: Tab) => {
    try { setActiveTab(tab); } catch (e) { toast.error(t('error') || 'Error', 'Failed to switch tab.'); }
  }, [t]);

  const handleLogout = async () => {
    try { if (tonConnectUI) await tonConnectUI.disconnect(); } catch { }
    finally { workerService.terminate(); disconnect(); router.push('/'); }
  };

  useEffect(() => {
    if (modeMining && address) {
      apiPost('/nodes/activate-wallet', sourceTelegram ? { source: 'telegram' } : {})
        .then((res: any) => res?.activated && toast.success(t('wallet_as_node_active') || 'Active!', t('wallet_as_node_msg') || 'Earn GSTD.'))
        .catch(() => { });
    }
  }, [modeMining, address, sourceTelegram, t]);

  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [referralMultiplier, setReferralMultiplier] = useState(1.0);
  const [gstdPriceUSD, setGstdPriceUSD] = useState<number | null>(null);
  const [buyLinks, setBuyLinks] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (!address) return;
    apiGet<{ total_referred?: number; total_referrals?: number }>('/referrals/stats')
      .then((r) => setReferralMultiplier(1 + 0.05 * Math.min(r?.total_referred ?? r?.total_referrals ?? 0, 5)))
      .catch(() => setReferralMultiplier(1.0));
  }, [address]);

  useEffect(() => {
    const fetchStats = async () => {
      try { setNetworkStats(await apiGet<NetworkStats>('/network/stats')); } catch { }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    apiGet<{ gstd_price_usd?: number; buy_links?: Record<string, string> }>('/market/price')
      .then((r) => {
        if (r?.gstd_price_usd) setGstdPriceUSD(r.gstd_price_usd);
        if (r?.buy_links) setBuyLinks(r.buy_links);
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    const itv = setInterval(() => {
      apiGet<any>('/monitor/organism-state')
        .then(r => r.health_score && setHealthScore(r.health_score))
        .catch(() => { });
      apiGet<any>('/monitor/neural')
        .then(r => r.analysis && setNeuralStatus(r.analysis))
        .catch(() => { });
    }, 15000);
    return () => clearInterval(itv);
  }, []);

  const triggerHaptic = useCallback((style: 'light' | 'medium' | 'heavy' = 'medium') => {
    if (typeof window !== 'undefined') {
      try { triggerHapticImpact(style); } catch { }
    }
  }, []);

  const handleToggleMining = useCallback(() => {
    if (isMining) {
      workerService.pause();
      toast.info(t('mining_paused') || 'Paused', t('mining_paused_msg') || 'Worker stopped.');
    } else workerService.ignite();
    triggerHaptic('heavy');
  }, [isMining, triggerHaptic, t]);

  const handleStatsUpdate = useCallback((stats: any) => {
    if (typeof document === 'undefined') return;
    const tempEl = document.getElementById('network-temperature');
    const pressureEl = document.getElementById('computational-pressure');
    if (tempEl) tempEl.textContent = (stats?.processing_tasks ?? 0).toFixed(2) + ' T';
    if (pressureEl) pressureEl.textContent = ((stats?.queued_tasks ?? 0) + (stats?.processing_tasks ?? 0)).toFixed(2) + ' P';
  }, []);

  const [isClaimingRewards, setIsClaimingRewards] = useState(false);

  const handleClaimRewards = useCallback(async () => {
    if (!address) {
      toast.error(t('connect_wallet') || 'Connect', t('claim_rewards_connect') || 'Connect wallet to claim.');
      return;
    }
    setIsClaimingRewards(true);
    try {
      const targetId = workerService.targetTaskId;
      if (targetId) {
        try {
          await apiPost(`/marketplace/tasks/${targetId}/payout`, {});
          toast.success(t('rewards_claimed') || 'Claimed!', t('rewards_sent_task') || 'Sent.');
          workerService.targetTaskId = null;
          return;
        } catch { }
      }
      setActiveTab('tasks');
    } catch (err: any) {
      toast.error(t('claim_failed') || 'Failed', err.message || (t('no_rewards_ready') || 'No rewards yet.'));
    } finally { setIsClaimingRewards(false); }
  }, [address, t]);

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-[#030014] overflow-hidden">
      <div className="hidden lg:block">
        <ErrorBoundary>
          <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />
        </ErrorBoundary>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {!isTelegramWebApp() && (
          <ErrorBoundary>
            <Header onLogout={handleLogout} />
          </ErrorBoundary>
        )}

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-28 lg:pb-8 custom-scrollbar">
          <ErrorBoundary>
            <div className="max-w-4xl mx-auto">
              {activeTab === 'chat' && (
                <ComponentErrorBoundary name="ChatPanel">
                  <ChatPanel initialMode={initialMode} />
                </ComponentErrorBoundary>
              )}

              {activeTab === 'home' && (
                <div className="space-y-6 animate-in fade-in duration-500">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 flex items-center justify-between p-5 bg-gradient-to-r from-blue-900/40 to-indigo-900/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden relative group">
                      <div className="absolute inset-0 bg-blue-500/5 scanline" />
                      <div className="flex items-center gap-4 relative z-10">
                        <div className="relative">
                          <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                            <Zap size={22} className="text-blue-400 group-hover:scale-110 transition-transform" />
                          </div>
                          <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[#030014] flex items-center justify-center">
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]" />
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] text-blue-300 font-black uppercase block tracking-[0.2em] mb-1">Organism Pulse</span>
                          <span className="text-lg font-black text-white uppercase tracking-tighter leading-tight">Autonomous Core <span className="text-blue-400">ACTIVE</span></span>
                        </div>
                      </div>
                      <div className="text-right relative z-10">
                        <span className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Health Index</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden hidden sm:block">
                            <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${healthScore * 100}%` }} />
                          </div>
                          <span className="text-xl font-black text-emerald-400 tabular-nums">{(healthScore * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="md:w-1/3 flex flex-col justify-center p-5 bg-white/[0.02] border border-white/5 rounded-2xl backdrop-blur-sm">
                      <span className="text-[10px] text-purple-400 font-black uppercase block tracking-wider mb-2">Neural Status</span>
                      <div className="text-[11px] font-mono text-gray-300 leading-relaxed overflow-hidden">
                        <span className="inline-block animate-pulse mr-1">●</span>
                        {neuralStatus}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      onClick={handleToggleMining}
                      disabled={isIgniting}
                      className={`group relative p-6 rounded-2xl font-bold transition-all active:scale-[0.98] flex items-center justify-between border-2 ${isMining
                        ? 'bg-red-500/10 border-red-500/20 text-red-400'
                        : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400 hover:border-cyan-400/40'
                        }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl ${isMining ? 'bg-red-500/20' : 'bg-cyan-500/20'}`}>
                          {isIgniting ? (
                            <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                          ) : isMining ? (
                            <Activity size={24} />
                          ) : (
                            <Server size={24} />
                          )}
                        </div>
                        <div>
                          <span className="block text-xl uppercase tracking-tight">
                            {isIgniting ? t('igniting') : isMining ? t('mining_online') : t('ignite')}
                          </span>
                          <span className="text-[10px] text-gray-500 uppercase">{t('platform_node')}</span>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${isMining ? 'bg-red-500/20' : 'bg-cyan-500/20'}`}>
                        {isIgniting ? '...' : isMining ? t('mining_stop') : t('mining_start')}
                      </span>
                    </button>

                    <div className="p-6 rounded-2xl bg-emerald-500/[0.06] border border-emerald-500/20 flex flex-col justify-between">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-[10px] font-bold text-emerald-500/70 uppercase tracking-wider mb-1">{t('unclaimed')}</h3>
                          <div className="text-3xl font-black text-white tabular-nums">
                            {pendingEarnings?.toFixed(2) || '0.00'} <span className="text-xs text-gray-500 font-bold">GSTD</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={handleClaimRewards}
                        disabled={isClaimingRewards}
                        className="w-full py-3 rounded-xl bg-emerald-500 text-black text-sm font-bold uppercase tracking-wide hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50"
                      >
                        {isClaimingRewards ? '...' : t('settle_rewards')}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
                          <Wallet size={18} />
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-400 font-bold uppercase block tracking-wider">{t('wallet_label')}</span>
                          <span className="text-lg font-black text-white tabular-nums tracking-tighter">{gstdBalance?.toFixed(2) || '0.00'}</span>
                        </div>
                      </div>
                      <CheckCircle className="text-emerald-500 w-4 h-4" />
                    </div>

                    <button
                      onClick={() => setShowReferralModal(true)}
                      className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between hover:bg-white/[0.04] transition-colors text-left group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-400 group-hover:scale-110 transition-transform">
                          <span className="text-lg font-bold">+</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-400 font-bold uppercase block tracking-wider">{t('yield_mult') || 'Yield'}</span>
                          <span className="text-lg font-black text-white tracking-tighter">{referralMultiplier}x</span>
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() => toast.info('Yield Vault Coming Soon', 'Liquid Staking: Earn protocol fees by locking GSTD.')}
                      className="p-5 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 flex items-center justify-between hover:border-emerald-500/40 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 group-hover:scale-110 transition-transform">
                          <TrendingUp size={18} />
                        </div>
                        <div>
                          <span className="text-[10px] text-emerald-400 font-black uppercase block tracking-wider">Vault</span>
                          <span className="text-lg font-black text-white tracking-tighter uppercase whitespace-nowrap">Stake</span>
                        </div>
                      </div>
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <a
                      href={buyLinks?.ston_fi || 'https://app.ston.fi/swap?ft=TON&tt=GSTD'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between hover:bg-amber-500/15 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                          <ShoppingCart size={18} />
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-500 font-bold uppercase block">{t('buy_gstd') || 'Buy GSTD'}</span>
                          <span className="text-lg font-bold text-white">
                            ${gstdPriceUSD?.toFixed(4) ?? '—'}
                          </span>
                        </div>
                      </div>
                      <span className="text-amber-400 text-sm font-bold">→</span>
                    </a>

                    <a
                      href="/monitor"
                      className="p-5 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-between hover:bg-blue-500/15 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400 group-hover:scale-110 transition-transform">
                          <Globe size={18} />
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-500 font-bold uppercase block">Global Network</span>
                          <span className="text-lg font-bold text-white uppercase tracking-tighter">Live Monitor</span>
                        </div>
                      </div>
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    </a>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <ComponentErrorBoundary name="ActivityFeed">
                      <ActivityFeed />
                    </ComponentErrorBoundary>
                    <ComponentErrorBoundary name="SwarmActivityWidget">
                      <SwarmActivityWidget />
                    </ComponentErrorBoundary>
                  </div>
                </div>
              )}

              <div className="animate-in fade-in duration-500">
                {activeTab === 'tasks' && (
                  <ComponentErrorBoundary name="TasksPanel">
                    <TasksPanel onTaskCreated={() => triggerHaptic('medium')} onCompensationClaimed={() => triggerHaptic('medium')} />
                  </ComponentErrorBoundary>
                )}

                {activeTab === 'stats' && (
                  <div className="space-y-6">
                    <ComponentErrorBoundary name="SystemStatusWidget">
                      <SystemStatusWidget onStatsUpdate={handleStatsUpdate} />
                    </ComponentErrorBoundary>
                    <ComponentErrorBoundary name="StatsPanel">
                      <StatsPanel />
                    </ComponentErrorBoundary>
                  </div>
                )}

                {activeTab === 'devices' && (
                  <div className="space-y-6">
                    <ComponentErrorBoundary name="DevicesPanel">
                      <DevicesPanel />
                    </ComponentErrorBoundary>
                  </div>
                )}

                {activeTab === 'marketplace' && (
                  <ComponentErrorBoundary name="Marketplace">
                    <Marketplace />
                  </ComponentErrorBoundary>
                )}

                {activeTab === 'agents' && (
                  <ComponentErrorBoundary name="AgentMarketplace">
                    <AgentMarketplace />
                  </ComponentErrorBoundary>
                )}

                {activeTab === 'referrals' && (
                  <ComponentErrorBoundary name="ReferralPanel">
                    <ReferralPanel />
                  </ComponentErrorBoundary>
                )}

                {activeTab === 'help' && (
                  <ComponentErrorBoundary name="HelpPanel">
                    <HelpPanel />
                  </ComponentErrorBoundary>
                )}

                {activeTab === 'more' && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-bold text-white">{t('more')}</h2>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { id: 'stats' as Tab, label: t('stats') || 'Stats', icon: '📊' },
                        { id: 'agents' as Tab, label: t('agents') || 'Agents', icon: '🤖' },
                        { id: 'marketplace' as Tab, label: t('marketplace') || 'Market', icon: '🛒' },
                        { id: 'referrals' as Tab, label: t('referrals') || 'Referrals', icon: '🎁' },
                        { id: 'help' as Tab, label: t('help_center') || 'Help', icon: '❓' },
                        { href: '/agent', label: t('agent_node') || 'Agent', icon: '⚡' },
                      ].map((item) =>
                        'href' in item ? (
                          <a key={item.href} href={item.href} className="glass-card p-4 flex flex-col items-center gap-2 text-center hover:bg-white/[0.06] transition-colors active:scale-95">
                            <span className="text-2xl">{item.icon}</span>
                            <span className="text-sm font-medium text-white">{item.label}</span>
                          </a>
                        ) : (
                          <button key={item.id} onClick={() => handleTabChange(item.id)} className="glass-card p-4 flex flex-col items-center gap-2 text-center hover:bg-white/[0.06] transition-colors active:scale-95">
                            <span className="text-2xl">{item.icon}</span>
                            <span className="text-sm font-medium text-white">{item.label}</span>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </ErrorBoundary>
        </main>
      </div>

      <div className="lg:hidden">
        <BottomNav activeTab={activeTab === 'stats' || activeTab === 'agents' || activeTab === 'marketplace' || activeTab === 'referrals' || activeTab === 'help' ? 'more' : activeTab} onTabChange={handleTabChange} />
      </div>

      {showReferralModal && (
        <Suspense fallback={null}>
          <ReferralModal onClose={() => setShowReferralModal(false)} />
        </Suspense>
      )}

      <InstallPwaPrompt />
    </div>
  );
}

export default memo(Dashboard);
