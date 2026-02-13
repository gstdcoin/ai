import { useEffect, useState, lazy, Suspense, memo, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { useRouter } from 'next/router';
import { useWalletStore } from '../../store/walletStore';
import Sidebar from '../layout/Sidebar';
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
import { Plus, Users, Calculator, Activity, Globe, Server, Wallet, CheckCircle } from 'lucide-react';
import { apiGet, apiPost } from '../../lib/apiClient';
import { ComponentErrorBoundary } from '../common/ComponentErrorBoundary';
import { workerService } from '../../services/WorkerService';
import { InstallPwaPrompt } from '../common/InstallPwaPrompt';
import { ActivityFeed } from './ActivityFeed';
import AgentMarketplace from '../agents/AgentMarketplace';
import ReferralPanel from '../referrals/ReferralPanel';
import BurnStatsWidget from './BurnStatsWidget';
import WelcomeBonusWidget from './WelcomeBonusWidget';
import GoldenReservePanel from './GoldenReservePanel';
import { NeuralBridge } from './NeuralBridge';
import { GenesisRegistryWidget } from './GenesisRegistryWidget';
import { VoiceBanner } from './VoiceBanner';
import { GlobalNodeGrowthWidget } from './GlobalNodeGrowthWidget';
import { isTelegramWebApp } from '../../lib/telegram';
import { SovereignSwitch } from '../SovereignSwitch';

interface NetworkStats {
  active_workers: number;
  total_gstd_paid: number;
  tasks_24h: number;
  temperature: number;
  pressure: number;
  total_hashrate: number;
}

// Lazy load modals for performance (must be at module level to avoid React hooks #310)
const NewTaskModal = lazy(() => import('./NewTaskModal'));
const ReferralModal = lazy(() => import('./ReferralModal'));

function Dashboard() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { address, disconnect, tonBalance, gstdBalance, pendingEarnings } = useWalletStore();
  const [tonConnectUI] = useTonConnectUI();
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [showNewTask, setShowNewTask] = useState(false);
  const [isMining, setIsMining] = useState(false);
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

  // Subscribe to worker service state
  useEffect(() => {
    const unsub = workerService.subscribe((state) => {
      setIsMining(state === 'running' || state === 'igniting');
    });
    return unsub;
  }, []);

  // Restore previously selected tab
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('activeTab') : null;
    if (saved === 'home' || saved === 'chat' || saved === 'tasks' || saved === 'devices' || saved === 'stats' || saved === 'help' || saved === 'marketplace' || saved === 'agents' || saved === 'referrals') {
      setActiveTab(saved as Tab);
    }
  }, []);

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

  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);

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
      toast.info('Mining Paused', 'Worker stopped processing tasks.');
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
      toast.error('Connect Wallet', 'Please connect your wallet to claim rewards.');
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
          toast.success('Rewards Claimed!', `Sent for task ${targetId.slice(0, 8)}`);
          workerService.targetTaskId = null;
          setIsClaimingRewards(false);
          return;
        } catch (e) {
          // Fallback to searching
        }
      }

      toast.info('Searching rewards...', 'Checking for claimable tasks');
      setActiveTab('tasks');
    } catch (err: any) {
      console.error('Claim failed:', err);
      toast.error('Claim Failed', err.message || 'No rewards ready to claim yet.');
    } finally {
      setIsClaimingRewards(false);
    }
  }, [address]);

  const handleTaskCreated = useCallback(() => triggerHaptic('medium'), [triggerHaptic]);
  const handleCompensationClaimed = useCallback(() => triggerHaptic('medium'), [triggerHaptic]);

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-[#030014] overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <ErrorBoundary>
          <Sidebar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onCreateTask={() => setShowNewTask(true)}
          />
        </ErrorBoundary>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        {!isTelegramWebApp() && (
          <ErrorBoundary>
            <Header
              onCreateTask={() => setShowNewTask(true)}
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
                    <ChatPanel />
                  </ComponentErrorBoundary>
                )}

                {/* HOME / OVERVIEW TAB */}
                {activeTab === 'home' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    {/* IDENTITY & MODE SWITCH */}
                    <div className="flex flex-col items-center justify-center p-2 rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-xl">
                      <ComponentErrorBoundary name="SovereignSwitch">
                        <SovereignSwitch className="w-full" />
                      </ComponentErrorBoundary>
                    </div>

                    {/* PRIMARY ACTIONS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Worker Control */}
                      <button
                        onClick={handleToggleMining}
                        className={`group relative p-8 rounded-[2rem] font-black transition-all transform active:scale-95 flex items-center justify-between border-2 overflow-hidden ${isMining
                          ? 'bg-red-500/10 border-red-500/20 text-red-400 shadow-[0_0_40px_rgba(239,68,68,0.1)]'
                          : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400 hover:border-cyan-400/40 shadow-[0_0_40px_rgba(34,211,238,0.1)]'
                          }`}
                      >
                        <div className="flex items-center gap-5 relative z-10">
                          <div className={`p-4 rounded-2xl border ${isMining ? 'bg-red-500/20 border-red-500/30 animate-pulse' : 'bg-cyan-500/20 border-cyan-500/30'}`}>
                            {isMining ? <Activity size={28} /> : <Server size={28} />}
                          </div>
                          <div className="text-left">
                            <span className="block text-2xl uppercase tracking-tighter font-black">
                              {isMining ? 'Online' : 'Ignite'}
                            </span>
                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest block mt-1">Platform Node</span>
                          </div>
                        </div>
                        <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border text-[10px] font-black tracking-widest uppercase ${isMining ? 'bg-red-500/20 border-red-500/30' : 'bg-cyan-500/20 border-cyan-500/30'}`}>
                          {isMining ? 'Stop' : 'Start'}
                        </div>
                      </button>

                      {/* Pending Rewards */}
                      <div className="glass-card p-8 bg-gradient-to-br from-emerald-500/[0.05] to-transparent border-emerald-500/20 flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <h3 className="text-[10px] font-black text-emerald-500/60 uppercase tracking-[0.2em] mb-1">Unclaimed</h3>
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
                          {isClaimingRewards ? '...' : 'Settle Rewards'}
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
                              <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest block mb-0.5">Wallet</span>
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
                              <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest block mb-0.5">Yield Mult</span>
                              <span className="text-xl font-black text-white tabular-nums">1.25x</span>
                            </div>
                          </div>
                          <button className="text-[10px] font-black text-violet-400 border border-violet-500/20 px-3 py-1 rounded-lg hover:bg-violet-500/10">+</button>
                        </div>
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
                    <div className="space-y-8">
                      {/* Golden Reserve - Hero Widget */}
                      <ComponentErrorBoundary name="GoldenReservePanel">
                        <GoldenReservePanel />
                      </ComponentErrorBoundary>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <ComponentErrorBoundary name="TreasuryWidget">
                          <TreasuryWidget />
                        </ComponentErrorBoundary>
                        <ComponentErrorBoundary name="PoolStatusWidget">
                          <PoolStatusWidget />
                        </ComponentErrorBoundary>
                        <ComponentErrorBoundary name="BurnStatsWidget">
                          <BurnStatsWidget />
                        </ComponentErrorBoundary>
                        <ComponentErrorBoundary name="GlobalNodeGrowthWidget">
                          <GlobalNodeGrowthWidget />
                        </ComponentErrorBoundary>
                      </div>
                      <ComponentErrorBoundary name="SystemStatusWidget">
                        <SystemStatusWidget onStatsUpdate={handleStatsUpdate} />
                      </ComponentErrorBoundary>
                      <ComponentErrorBoundary name="StatsPanel">
                        <StatsPanel />
                      </ComponentErrorBoundary>
                    </div>
                  )}

                  {activeTab === 'devices' && (
                    <ComponentErrorBoundary name="DevicesPanel">
                      <DevicesPanel />
                    </ComponentErrorBoundary>
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
                </div>
              </div>
            </div>
          </ErrorBoundary>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden">
        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      </div>

      {/* Floating Action Button - positioned above bottom nav on mobile */}
      <button
        onClick={() => setShowNewTask(true)}
        className="fixed right-4 bottom-20 lg:bottom-6 z-40 w-12 h-12 rounded-full bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/30 flex items-center justify-center transition-all active:scale-90"
        aria-label={t('create_task')}
      >
        <Plus size={20} />
      </button>

      {/* Lazy Loaded Modals */}
      {showNewTask && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="glass-card text-white">{t('loading') || 'Loading...'}</div>
        </div>}>
          <NewTaskModal
            onClose={() => setShowNewTask(false)}
            onTaskCreated={() => {
              triggerHaptic('medium');
              setShowNewTask(false);
            }}
          />
        </Suspense>
      )}

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
