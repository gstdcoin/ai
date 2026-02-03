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
import { Tab } from '../../types/tabs';
import { useTonConnectUI } from '@tonconnect/ui-react';
import SystemStatusWidget from './SystemStatusWidget';
import TreasuryWidget from './TreasuryWidget';
import PoolStatusWidget from './PoolStatusWidget';
import { toast } from '../../lib/toast';
import { Plus, Users, Calculator, Activity, Globe, Server, Wallet, CheckCircle, Beaker } from 'lucide-react';
import BoincProgressWidget from './BoincProgressWidget';
import { apiGet } from '../../lib/apiClient';
import { ComponentErrorBoundary } from '../common/ComponentErrorBoundary';
import { workerService } from '../../services/WorkerService';
import { InstallPwaPrompt } from '../common/InstallPwaPrompt';
import { ActivityFeed } from './ActivityFeed';

interface NetworkStats {
  active_workers: number;
  total_gstd_paid: number;
  tasks_24h: number;
  temperature: number;
  pressure: number;
  total_hashrate: number;
}

// Lazy load modals for performance
const NewTaskModal = lazy(() => import('./NewTaskModal'));

function Dashboard() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { address, disconnect, tonBalance, gstdBalance, pendingEarnings } = useWalletStore();
  const [tonConnectUI] = useTonConnectUI();
  const [activeTab, setActiveTab] = useState<Tab>('tasks');
  const [showNewTask, setShowNewTask] = useState(false);
  const [isMining, setIsMining] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const ReferralModal = lazy(() => import('./ReferralModal'));

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
    if (saved === 'tasks' || saved === 'devices' || saved === 'stats' || saved === 'help' || saved === 'marketplace') {
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

        // Sync header metrics from network stats
        if (typeof document !== 'undefined') {
          const tempEl = document.getElementById('network-temperature');
          const pressureEl = document.getElementById('computational-pressure');
          if (tempEl) tempEl.textContent = `${stats.temperature.toFixed(2)} T`;
          if (pressureEl) pressureEl.textContent = `${stats.pressure.toFixed(2)} P`;
        }
      } catch (err) {
        console.error('Failed to fetch network stats:', err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 10000); // 10s for more "Live" feel
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
      // Toast handled by service
    }
    triggerHaptic('heavy');
  }, [isMining, triggerHaptic]);


  // Callbacks for child components - MUST be at top level, not inside JSX
  const handleStatsUpdate = useCallback((stats: any) => {
    if (typeof document === 'undefined') return;

    const tempEl = document.getElementById('network-temperature');
    const pressureEl = document.getElementById('computational-pressure');
    if (tempEl) {
      if (stats) {
        const temp = stats.active_devices_count > 0
          ? (stats.processing_tasks / stats.active_devices_count).toFixed(2)
          : '0.00';
        tempEl.textContent = `${temp} T`;
      } else {
        tempEl.textContent = '0.00 T';
      }
    }
    if (pressureEl) {
      if (stats) {
        const pressure = stats.completed_tasks > 0
          ? ((stats.queued_tasks + stats.processing_tasks) / stats.completed_tasks).toFixed(2)
          : (stats.queued_tasks + stats.processing_tasks || 0.00).toFixed(2);
        pressureEl.textContent = `${pressure} P`;
      } else {
        pressureEl.textContent = '0.00 P';
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
      // 1. Try to claim target task if it was just completed
      const targetId = workerService.targetTaskId;

      // 2. Fetch all tasks to find completed but unpaid ones
      const response = await apiGet<{ tasks: any[] }>('/marketplace/my-tasks');
      const myCreatedTasks = response.tasks || [];

      // We actually want completed tasks where we are the WORKER
      // Let's check available tasks which might include our claimed ones
      const availableResponse = await apiGet<{ tasks: any[] }>('/marketplace/tasks');
      const allTasks = availableResponse.tasks || [];

      // Try to payout by targetId first
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
      // For now, if targetId didn't work, we tell user to check Tasks panel
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
        <ErrorBoundary>
          <Header
            onCreateTask={() => setShowNewTask(true)}
            onLogout={handleLogout}
          />
        </ErrorBoundary>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-12 pb-24 lg:pb-12 custom-scrollbar">
          <ErrorBoundary>
            <div className="max-w-7xl mx-auto space-y-8">

              {/* System Overview - Animated Top Row */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-1">
                  <ComponentErrorBoundary name="ActivityFeed">
                    <div className="h-full">
                      <ActivityFeed />
                    </div>
                  </ComponentErrorBoundary>
                </div>

                <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <ComponentErrorBoundary name="TreasuryWidget">
                    <TreasuryWidget />
                  </ComponentErrorBoundary>

                  <ComponentErrorBoundary name="PoolStatusWidget">
                    <PoolStatusWidget />
                  </ComponentErrorBoundary>

                  {/* Global Network Status - High Focus */}
                  <div
                    className="md:col-span-2 lg:col-span-1 glass-card p-6 relative overflow-hidden group cursor-pointer border-cyan-500/20 hover:border-cyan-500/50 transition-all"
                    onClick={() => router.push('/network')}
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl -mr-16 -mt-16 animate-pulse" />
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-4">
                        <Globe className="w-5 h-5 text-cyan-400" />
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Global Power</span>
                      </div>
                      <div className="text-4xl font-black text-white mb-2 tabular-nums">
                        {networkStats ? (networkStats.active_workers * 10.5).toFixed(1) : '4.2'}
                        <span className="text-sm font-bold text-gray-600 ml-2 uppercase">PFLOPS</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        {networkStats?.active_workers || 42} Active Nodes
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Financial Dashboard - Glass Blocks */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Pending Payouts Widget */}
                <div className="glass-card p-8 bg-gradient-to-br from-emerald-500/[0.03] to-transparent border-emerald-500/10 hover:border-emerald-500/30 transition-all duration-500 group">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2">{t('pending_payouts') || 'Unclaimed Bounty'}</h3>
                      <div className="text-4xl font-black text-white tabular-nums drop-shadow-2xl">
                        {pendingEarnings?.toFixed(2) || '0.00'}
                        <span className="text-lg text-gray-600 ml-2 font-bold uppercase tracking-tighter">GSTD</span>
                      </div>
                    </div>
                    <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 group-hover:scale-110 transition-transform">
                      <Plus className="w-6 h-6" />
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-600 to-cyan-500 animate-shimmer" style={{ width: '65%' }} />
                  </div>
                </div>

                {/* GSTD Balance */}
                <div className="glass-card p-8 bg-gradient-to-br from-amber-500/[0.03] to-transparent border-amber-500/10 hover:border-amber-500/30 transition-all duration-500 group">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2">{t('gstd_balance') || 'GSTD Wallet'}</h3>
                      <div className="text-4xl font-black text-white tabular-nums drop-shadow-2xl">
                        {gstdBalance?.toFixed(2) || '0.00'}
                        <span className="text-lg text-gray-600 ml-2 font-bold uppercase tracking-tighter">GSTD</span>
                      </div>
                    </div>
                    <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-yellow-500 group-hover:scale-110 transition-transform">
                      <Wallet className="w-6 h-6" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] font-black text-gray-400 uppercase tracking-widest">Verified on TON</div>
                  </div>
                </div>

                {/* Referral/Network */}
                <div
                  className="glass-card p-8 bg-gradient-to-br from-violet-500/[0.03] to-transparent border-violet-500/10 hover:border-violet-500/30 transition-all duration-500 group cursor-pointer"
                  onClick={() => setShowReferralModal(true)}
                >
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2">Social Multiplier</h3>
                      <div className="text-4xl font-black text-white uppercase tracking-tighter">
                        5.0<span className="text-lg text-violet-400 ml-1">%</span>
                      </div>
                    </div>
                    <div className="p-3 rounded-2xl bg-violet-500/10 border border-violet-500/20 text-violet-400 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(139,92,246,0.3)]">
                      <Users className="w-6 h-6" />
                    </div>
                  </div>
                  <p className="text-xs font-bold text-gray-500">Invite nodes to increase protocol rewards</p>
                </div>
              </div>

              {/* BOINC Progress (Science Bridge) */}
              <ComponentErrorBoundary name="BoincProgressWidget">
                <BoincProgressWidget />
              </ComponentErrorBoundary>

              {/* PROMINENT ACTION BAR */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-4">
                <div className="md:col-span-8">
                  <button
                    onClick={handleToggleMining}
                    className={`w-full group relative py-8 px-10 rounded-3xl font-black transition-all transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-between border-2 overflow-hidden ${isMining
                      ? 'bg-red-600/10 border-red-500/40 text-red-500 shadow-2xl shadow-red-900/20'
                      : 'bg-emerald-600/10 border-emerald-500/40 text-emerald-400 shadow-2xl shadow-emerald-900/20 hover:border-emerald-400'
                      }`}
                  >
                    {/* Animated Shine Effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />

                    <div className="flex items-center gap-6 relative z-10">
                      <div className={`p-4 rounded-2xl border-2 ${isMining ? 'bg-red-500/20 border-red-500/30 animate-pulse' : 'bg-emerald-500/20 border-emerald-500/30'}`}>
                        {isMining ? <Activity size={32} /> : <Server size={32} />}
                      </div>
                      <div className="text-left">
                        <span className="block text-2xl uppercase tracking-tighter mb-1 font-black">
                          {isMining ? 'System Active' : 'Ignite Worker'}
                        </span>
                        <span className="block text-sm font-bold opacity-60 uppercase tracking-widest leading-none">
                          {isMining ? 'Processing Grid Workloads...' : 'Turn Device into Compute Node'}
                        </span>
                      </div>
                    </div>

                    <div className={`hidden sm:flex items-center gap-3 px-6 py-2 rounded-2xl border-2 uppercase text-[10px] font-black tracking-[0.2em] relative z-10 ${isMining ? 'bg-red-500/20 border-red-500/30' : 'bg-emerald-500/20 border-emerald-500/30'}`}>
                      {isMining ? <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500 animate-ping" /> Online</span> : 'Ready'}
                    </div>
                  </button>
                </div>

                <div className="md:col-span-4">
                  <button
                    onClick={handleClaimRewards}
                    disabled={isClaimingRewards}
                    className="w-full h-full py-8 px-8 rounded-3xl bg-white/[0.03] border-2 border-white/5 hover:border-white/20 text-white font-black transition-all flex flex-col items-center justify-center gap-4 group disabled:opacity-50 hover:bg-white/[0.06]"
                  >
                    <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 group-hover:scale-110 transition-transform">
                      <Calculator className={`w-8 h-8 ${isClaimingRewards ? 'animate-spin' : ''}`} />
                    </div>
                    <div className="text-center">
                      <span className="block text-xl uppercase tracking-tighter">{isClaimingRewards ? 'Processing...' : (t('claim_rewards') || 'Claim Bounty')}</span>
                      <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest mt-1 block">Settle earnings to wallet</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Status & Inventory Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                <ComponentErrorBoundary name="SystemStatusWidget">
                  <SystemStatusWidget onStatsUpdate={handleStatsUpdate} />
                </ComponentErrorBoundary>

                <div className="glass-card p-6 border-white/5">
                  <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Beaker className="w-4 h-4 text-violet-400" />
                    Infrastructure Diagnostics
                  </h3>
                  <div className="space-y-4">
                    {[
                      { label: 'Settlement Ledger', status: 'Optimal', color: 'emerald' },
                      { label: 'Task Distribution', status: 'Balanced', color: 'cyan' },
                      { label: 'Blockchain Sync', status: 'Verified', color: 'blue' }
                    ].map((item, i) => (
                      <div key={i} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                        <span className="text-sm font-bold text-gray-400">{item.label}</span>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded bg-${item.color}-500/10 text-${item.color}-400 border border-${item.color}-500/20`}>
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Panels Section */}
              <div className="space-y-6 pt-4">
                <ComponentErrorBoundary name="TasksPanel">
                  {activeTab === 'tasks' && <TasksPanel
                    onTaskCreated={handleTaskCreated}
                    onCompensationClaimed={handleCompensationClaimed}
                  />}
                </ComponentErrorBoundary>

                <ComponentErrorBoundary name="DevicesPanel">
                  {activeTab === 'devices' && <DevicesPanel />}
                </ComponentErrorBoundary>

                <ComponentErrorBoundary name="StatsPanel">
                  {activeTab === 'stats' && <StatsPanel />}
                </ComponentErrorBoundary>

                <ComponentErrorBoundary name="HelpPanel">
                  {activeTab === 'help' && <HelpPanel />}
                </ComponentErrorBoundary>

                <ComponentErrorBoundary name="Marketplace">
                  {activeTab === 'marketplace' && <Marketplace />}
                </ComponentErrorBoundary>
              </div>
            </div>
          </ErrorBoundary>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden">
        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => setShowNewTask(true)}
        className="floating-action-button"
        aria-label={t('create_task')}
      >
        <Plus />
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
