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
import TreasuryWidget from './TreasuryWidget';
import PoolStatusWidget from './PoolStatusWidget';
import { toast } from '../../lib/toast';
import { Users, Calculator, Activity, Globe, Server, Wallet, CheckCircle } from 'lucide-react';
import { apiGet, apiPost } from '../../lib/apiClient';
import Sidebar from '../layout/Sidebar';
import { ComponentErrorBoundary } from '../common/ComponentErrorBoundary';
import { workerService } from '../../services/WorkerService';
import { InstallPwaPrompt } from '../common/InstallPwaPrompt';
import { ActivityFeed } from './ActivityFeed';
import AgentMarketplace from '../agents/AgentMarketplace';
import ReferralPanel from '../referrals/ReferralPanel';
import WelcomeBonusWidget from './WelcomeBonusWidget';
import GoldenReservePanel from './GoldenReservePanel';
import EarningsPredictionWidget from './EarningsPredictionWidget';
import SwarmMultiplierWidget from './SwarmMultiplierWidget';
import GlobalTreasuryGrowthWidget from './GlobalTreasuryGrowthWidget';
import ShareSuccessCard from './ShareSuccessCard';
import FleetCommandPanel from './FleetCommandPanel';
import { NeuralBridge } from './NeuralBridge';
import { GenesisRegistryWidget } from './GenesisRegistryWidget';
import { VoiceBanner } from './VoiceBanner';
import BrainQueryPanel from './BrainQueryPanel';
import { GlobalNodeGrowthWidget } from './GlobalNodeGrowthWidget';
import { GlobalLeaderboardWidget } from './GlobalLeaderboardWidget';
import { isTelegramWebApp } from '../../lib/telegram';
import { SovereignSwitch } from '../SovereignSwitch';
import LeviathanLiveTicker from '../LeviathanLiveTicker';

interface NetworkStats {
  active_workers: number;
  total_gstd_paid: number;
  tasks_24h: number;
  temperature: number;
  pressure: number;
  total_hashrate: number;
}

// Lazy load modals for performance (must be at module level to avoid React hooks #310)
const ReferralModal = lazy(() => import('./ReferralModal'));

interface DashboardProps {
  initialTab?: string;
  initialMode?: 'standard' | 'ultra';
  sourceTelegram?: boolean;
  modeMining?: boolean;
}

function Dashboard({ initialTab, initialMode, sourceTelegram, modeMining }: DashboardProps = {}) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { address, disconnect, tonBalance, gstdBalance, pendingEarnings } = useWalletStore();
  const [tonConnectUI] = useTonConnectUI();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const valid: Tab[] = ['home', 'chat', 'tasks', 'devices', 'stats', 'help', 'marketplace', 'agents', 'referrals', 'more'];
    if (initialTab && valid.includes(initialTab as Tab)) return initialTab as Tab;
    return 'chat';
  });
  const [isMining, setIsMining] = useState(false);
  const [isIgniting, setIsIgniting] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);

  // Check for pending chat from landing page
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const pending = window.sessionStorage.getItem('pending_chat');
      if (pending) {
        setActiveTab('chat');
        window.sessionStorage.removeItem('pending_chat');
      }
    }
  }, []);

  // Subscribe to worker service state (Shadow Audit: loading state for Ignite)
  useEffect(() => {
    const unsub = workerService.subscribe((state) => {
      setIsMining(state === 'running' || state === 'igniting');
      setIsIgniting(state === 'igniting');
    });
    return unsub;
  }, []);

  // Restore previously selected tab (or apply initialTab from URL)
  useEffect(() => {
    const valid: Tab[] = ['home', 'chat', 'tasks', 'devices', 'stats', 'help', 'marketplace', 'agents', 'referrals', 'more'];
    if (initialTab && valid.includes(initialTab as Tab)) {
      setActiveTab(initialTab as Tab);
      return;
    }
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('activeTab') : null;
    if (saved && valid.includes(saved as Tab)) {
      setActiveTab(saved as Tab);
    }
  }, [initialTab]);

  // Save active tab to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && activeTab) {
      try {
        window.localStorage.setItem('activeTab', activeTab);
      } catch (error) {
        console.warn('Failed to save active tab to localStorage:', error);
      }
    }
  }, [activeTab]);

  // Handle tab change with error handling
  const handleTabChange = useCallback((tab: Tab) => {
    try {
      setActiveTab(tab);
    } catch (error) {
      console.error('Error changing tab:', error);
      toast.error(t('error') || 'Error', 'Failed to switch tab. Please try again.');
    }
  }, [t]);

  const handleLogout = async () => {
    try {
      if (tonConnectUI) {
        await tonConnectUI.disconnect();
      }
    } catch {
      // ignore TonConnect disconnect errors
    } finally {
      workerService.terminate();
      disconnect();
      router.push('/');
    }
  };

  // Telegram WebApp integration
  const [telegramUser, setTelegramUser] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      const tg = (window as any).Telegram.WebApp;
      tg.ready();
      setTelegramUser(tg.initDataUnsafe?.user || null);
    }
  }, []);

  // Wallet-as-Node via Telegram: activate wallet as node when coming from mining flow
  // source=telegram feeds Leviathan for network learning (Omnipresence: Mining vertical)
  useEffect(() => {
    if (modeMining && address) {
      const body = sourceTelegram ? { source: 'telegram' } : {};
      apiPost('/nodes/activate-wallet', body).then((res: any) => {
        if (res?.activated) {
          toast.success(t('wallet_as_node_active') || 'Wallet-as-Node active!', t('wallet_as_node_msg') || 'You can claim tasks and earn GSTD.');
        }
      }).catch(() => { /* silent */ });
    }
  }, [modeMining, address, sourceTelegram, t]);

  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [referralMultiplier, setReferralMultiplier] = useState(1.0);

  // Fetch referral stats for yield multiplier (1.0 + 0.05 per ref, max 1.25x)
  useEffect(() => {
    if (!address) return;
    apiGet<{ total_referred?: number; total_referrals?: number }>('/referrals/stats')
      .then((r) => {
        const refs = r?.total_referred ?? r?.total_referrals ?? 0;
        setReferralMultiplier(1 + 0.05 * Math.min(refs, 5));
      })
      .catch(() => setReferralMultiplier(1.0));
  }, [address]);

  // Fetch network stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const stats = await apiGet<NetworkStats>('/network/stats');
        setNetworkStats(stats);

        if (typeof document !== 'undefined' && stats) {
          const tempEl = document.getElementById('network-temperature');
          const pressureEl = document.getElementById('computational-pressure');
          const temp = typeof stats.temperature === 'number' ? stats.temperature.toFixed(2) : '0.00';
          const pressure = typeof stats.pressure === 'number' ? stats.pressure.toFixed(2) : '0.00';
          if (tempEl) tempEl.textContent = `${temp} T`;
          if (pressureEl) pressureEl.textContent = `${pressure} P`;
        }
      } catch (err) {
        console.error('Failed to fetch network stats:', err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  // Haptic feedback helper
  const triggerHaptic = useCallback((style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium') => {
    if (typeof window !== 'undefined') {
      const { triggerHapticImpact } = require('../../lib/telegram');
      triggerHapticImpact(style);
    }
  }, []);

  // Handle Mining Toggle
  const handleToggleMining = useCallback(() => {
    if (isMining) {
      workerService.pause();
      toast.info(t('mining_paused') || 'Mining Paused', t('mining_paused_msg') || 'Worker stopped processing tasks.');
    } else {
      workerService.ignite();
    }
    triggerHaptic('heavy');
  }, [isMining, triggerHaptic]);

  // Callbacks for child components
  const handleStatsUpdate = useCallback((stats: any) => {
    if (typeof document === 'undefined') return;

    const tempEl = document.getElementById('network-temperature');
    const pressureEl = document.getElementById('computational-pressure');
    if (tempEl) {
      if (stats && typeof stats.active_devices_count === 'number' && stats.active_devices_count > 0) {
        const temp = (stats.processing_tasks / stats.active_devices_count).toFixed(2);
        tempEl.textContent = `${temp} T`;
      } else {
        tempEl.textContent = (stats?.processing_tasks ?? 0).toFixed(2) + ' T';
      }
    }
    if (pressureEl) {
      if (stats && typeof stats.completed_tasks === 'number' && stats.completed_tasks > 0) {
        const pressure = ((stats.queued_tasks + stats.processing_tasks) / stats.completed_tasks).toFixed(2);
        pressureEl.textContent = `${pressure} P`;
      } else {
        const fallback = (stats?.queued_tasks ?? 0) + (stats?.processing_tasks ?? 0);
        pressureEl.textContent = `${fallback.toFixed(2)} P`;
      }
    }
  }, []);

  const [isClaimingRewards, setIsClaimingRewards] = useState(false);

  const handleClaimRewards = useCallback(async () => {
    if (!address) {
      toast.error(t('connect_wallet') || 'Connect Wallet', t('claim_rewards_connect') || 'Please connect your wallet to claim rewards.');
      return;
    }

    setIsClaimingRewards(true);
    try {
      const targetId = workerService.targetTaskId;

      const response = await apiGet<{ tasks: any[] }>('/marketplace/my-tasks');
      const myCreatedTasks = response.tasks || [];

      const availableResponse = await apiGet<{ tasks: any[] }>('/marketplace/tasks');
      const allTasks = availableResponse.tasks || [];

      if (targetId) {
        try {
          await apiPost(`/marketplace/tasks/${targetId}/payout`, {});
          toast.success(t('rewards_claimed') || 'Rewards Claimed!', `${t('rewards_sent_task') || 'Sent for task'} ${targetId.slice(0, 8)}`);
          workerService.targetTaskId = null;
          setIsClaimingRewards(false);
          return;
        } catch (e) {
          // Fallback to searching
        }
      }

      toast.info(t('searching_rewards') || 'Searching rewards...', t('checking_claimable') || 'Checking for claimable tasks');
      setActiveTab('tasks');
    } catch (err: any) {
      console.error('Claim failed:', err);
      toast.error(t('claim_failed') || 'Claim Failed', err.message || (t('no_rewards_ready') || 'No rewards ready to claim yet.'));
    } finally {
      setIsClaimingRewards(false);
    }
  }, [address, t]);

  const handleTaskCreated = useCallback(() => triggerHaptic('medium'), [triggerHaptic]);
  const handleCompensationClaimed = useCallback(() => triggerHaptic('medium'), [triggerHaptic]);

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-[#030014] overflow-hidden">
      {/* Leviathan Live Stream — fixed at top (Guardian Mode) */}
      <LeviathanLiveTicker />
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <ErrorBoundary>
          <Sidebar
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        </ErrorBoundary>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden pt-10">
        {/* Header — pt-10 for fixed Leviathan ticker */}
        {!isTelegramWebApp() && (
          <ErrorBoundary>
            <Header
              onLogout={handleLogout}
            />
          </ErrorBoundary>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-28 lg:pb-8 custom-scrollbar">
          <ErrorBoundary>
            <div className="max-w-7xl mx-auto">
              <div className="max-w-4xl mx-auto">

                {/* CHAT TAB - Primary Feature */}
                {activeTab === 'chat' && (
                  <ComponentErrorBoundary name="ChatPanel">
                    <ChatPanel initialMode={initialMode} />
                  </ComponentErrorBoundary>
                )}

                {/* HOME / OVERVIEW TAB */}
                {activeTab === 'home' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    {/* Global Treasury Growth — Live Stats */}
                    <ComponentErrorBoundary name="GlobalTreasuryGrowthWidget">
                      <GlobalTreasuryGrowthWidget />
                    </ComponentErrorBoundary>

                    {/* IDENTITY & MODE SWITCH */}
                    <div className="flex flex-col items-center justify-center p-2 rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-xl">
                      <ComponentErrorBoundary name="SovereignSwitch">
                        <SovereignSwitch className="w-full" />
                      </ComponentErrorBoundary>
                      <p className="mt-2 text-[10px] text-gray-500 text-center max-w-md">{t('mode_switch_hint')}</p>
                    </div>

                    {/* PRIMARY ACTIONS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Worker Control */}
                      <button
                        onClick={handleToggleMining}
                        disabled={isIgniting}
                        title={t('ignite_hint')}
                        className={`group relative p-8 rounded-[2rem] font-black transition-all transform active:scale-95 flex items-center justify-between border-2 overflow-hidden disabled:opacity-70 disabled:cursor-not-allowed ${isMining
                          ? 'bg-red-500/10 border-red-500/20 text-red-400 shadow-[0_0_40px_rgba(239,68,68,0.1)]'
                          : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400 hover:border-cyan-400/40 shadow-[0_0_40px_rgba(34,211,238,0.1)]'
                          }`}
                      >
                        <div className="flex items-center gap-5 relative z-10">
                          <div className={`p-4 rounded-2xl border ${isMining ? 'bg-red-500/20 border-red-500/30 animate-pulse' : 'bg-cyan-500/20 border-cyan-500/30'}`}>
                            {isIgniting ? (
                              <div className="w-7 h-7 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                            ) : isMining ? (
                              <Activity size={28} />
                            ) : (
                              <Server size={28} />
                            )}
                          </div>
                          <div className="text-left">
                            <span className="block text-2xl uppercase tracking-tighter font-black">
                              {isIgniting ? t('igniting') : isMining ? t('mining_online') : t('ignite')}
                            </span>
                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest block mt-1">{t('platform_node')}</span>
                          </div>
                        </div>
                        <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border text-[10px] font-black tracking-widest uppercase ${isMining ? 'bg-red-500/20 border-red-500/30' : 'bg-cyan-500/20 border-cyan-500/30'}`}>
                          {isIgniting ? '...' : isMining ? t('mining_stop') : t('mining_start')}
                        </div>
                      </button>

                      {/* Pending Rewards */}
                      <div className="glass-card p-8 bg-gradient-to-br from-emerald-500/[0.05] to-transparent border-emerald-500/20 flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <h3 className="text-[10px] font-black text-emerald-500/60 uppercase tracking-[0.2em] mb-1">{t('unclaimed')}</h3>
                            <div className="text-4xl font-black text-white tabular-nums tracking-tighter">
                              {pendingEarnings?.toFixed(2) || '0.00'}
                              <span className="text-[10px] text-gray-600 ml-1.5 font-bold">GSTD</span>
                            </div>
                          </div>
                          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                            <Calculator size={24} />
                          </div>
                        </div>
                        <button
                          onClick={handleClaimRewards}
                          disabled={isClaimingRewards}
                          className="w-full py-3.5 rounded-2xl bg-emerald-500 text-black text-xs font-black uppercase tracking-widest transition-all hover:bg-emerald-400 active:scale-95 disabled:opacity-50"
                        >
                          {isClaimingRewards ? '...' : t('settle_rewards')}
                        </button>
                      </div>
                    </div>

                    {/* QUICK STATS & ACTIVITY */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <ComponentErrorBoundary name="ActivityFeed">
                        <ActivityFeed />
                      </ComponentErrorBoundary>

                      <div className="space-y-4">
                        <div className="glass-card p-6 border-white/5 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
                              <Wallet size={20} />
                            </div>
                            <div>
                              <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest block mb-0.5">{t('wallet_label')}</span>
                              <span className="text-xl font-black text-white tabular-nums">{gstdBalance?.toFixed(2) || '0.00'} GSTD</span>
                            </div>
                          </div>
                          <CheckCircle className="text-emerald-500 w-4 h-4" />
                        </div>

                        <div
                          className="glass-card p-6 border-white/5 flex items-center justify-between cursor-pointer hover:bg-white/[0.03] transition-colors"
                          onClick={() => setShowReferralModal(true)}
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-violet-500/10 text-violet-400">
                              <Users size={20} />
                            </div>
                            <div>
                              <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest block mb-0.5">{t('yield_mult') || 'Yield Mult'}</span>
                              <span className="text-xl font-black text-white tabular-nums">
                                {referralMultiplier}x
                              </span>
                            </div>
                          </div>
                          <button className="text-[10px] font-black text-violet-400 border border-violet-500/20 px-3 py-1 rounded-lg hover:bg-violet-500/10">+</button>
                        </div>

                        <ComponentErrorBoundary name="EarningsPredictionWidget">
                          <EarningsPredictionWidget />
                        </ComponentErrorBoundary>

                        <ComponentErrorBoundary name="SwarmMultiplierWidget">
                          <SwarmMultiplierWidget />
                        </ComponentErrorBoundary>

                        <ComponentErrorBoundary name="ShareSuccessCard">
                          <ShareSuccessCard />
                        </ComponentErrorBoundary>
                      </div>
                    </div>
                  </div>
                )}

                {/* OTHER TABS */}
                <div className="animate-in fade-in duration-500">
                  {activeTab === 'tasks' && (
                    <ComponentErrorBoundary name="TasksPanel">
                      <TasksPanel onTaskCreated={handleTaskCreated} onCompensationClaimed={handleCompensationClaimed} />
                    </ComponentErrorBoundary>
                  )}

                  {activeTab === 'stats' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                      {/* Golden Reserve - Hero Widget (Comprehensive) */}
                      <ComponentErrorBoundary name="GoldenReservePanel">
                        <GoldenReservePanel />
                      </ComponentErrorBoundary>

                      {/* Network Scale & Growth */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <ComponentErrorBoundary name="GlobalNodeGrowthWidget">
                          <GlobalNodeGrowthWidget />
                        </ComponentErrorBoundary>
                        <ComponentErrorBoundary name="SystemStatusWidget">
                          <SystemStatusWidget onStatsUpdate={handleStatsUpdate} />
                        </ComponentErrorBoundary>
                      </div>

                      {/* Leaderboard */}
                      <ComponentErrorBoundary name="GlobalLeaderboardWidget">
                        <GlobalLeaderboardWidget />
                      </ComponentErrorBoundary>

                      {/* Detailed Stats Table */}
                      <ComponentErrorBoundary name="StatsPanel">
                        <StatsPanel />
                      </ComponentErrorBoundary>

                      {/* Hive Memory Access (Paid Feature) */}
                      <div className="mt-8 pt-8 border-t border-white/5">
                        <h3 className="text-lg font-bold text-amber-400 mb-4 px-2">{t('hive_intelligence')}</h3>
                        <ComponentErrorBoundary name="BrainQueryPanel">
                          <BrainQueryPanel />
                        </ComponentErrorBoundary>
                      </div>
                    </div>
                  )}

                  {activeTab === 'devices' && (
                    <div className="space-y-6">
                      <ComponentErrorBoundary name="FleetCommandPanel">
                        <FleetCommandPanel />
                      </ComponentErrorBoundary>
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
                    <div className="space-y-4 animate-in fade-in duration-300">
                      <h2 className="text-lg font-bold text-white">{t('more')}</h2>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { id: 'stats' as Tab, label: t('stats') || 'Stats', icon: '📊' },
                          { id: 'agents' as Tab, label: t('agents') || 'Agents', icon: '🤖' },
                          { id: 'marketplace' as Tab, label: t('marketplace') || 'Market', icon: '🛒' },
                          { id: 'referrals' as Tab, label: t('referrals') || 'Referrals', icon: '🎁' },
                          { id: 'help' as Tab, label: t('help_center') || 'Help', icon: '❓' },
                          { href: '/agent', label: t('agent_node') || 'Agent Node', icon: '⚡' },
                        ].map((item) => (
                          'href' in item ? (
                            <a
                              key={item.href}
                              href={item.href}
                              className="glass-card p-4 flex flex-col items-center gap-2 text-center hover:bg-white/[0.06] transition-colors active:scale-95"
                            >
                              <span className="text-2xl">{item.icon}</span>
                              <span className="text-sm font-medium text-white">{item.label}</span>
                            </a>
                          ) : (
                            <button
                              key={item.id}
                              onClick={() => handleTabChange(item.id)}
                              className="glass-card p-4 flex flex-col items-center gap-2 text-center hover:bg-white/[0.06] transition-colors active:scale-95"
                            >
                              <span className="text-2xl">{item.icon}</span>
                              <span className="text-sm font-medium text-white">{item.label}</span>
                            </button>
                          )
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </ErrorBoundary>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden">
        <BottomNav activeTab={activeTab === 'stats' || activeTab === 'agents' || activeTab === 'marketplace' || activeTab === 'referrals' || activeTab === 'help' ? 'more' : activeTab} onTabChange={handleTabChange} />
      </div>

      {/* Lazy Loaded Modals */}
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
