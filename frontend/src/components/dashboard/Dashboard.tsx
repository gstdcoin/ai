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
import { Plus, Users, Calculator, Activity, Globe, Server, Wallet, CheckCircle } from 'lucide-react';
import { apiGet } from '../../lib/apiClient';
import { ComponentErrorBoundary } from '../common/ComponentErrorBoundary';
import { workerService } from '../../services/WorkerService';

interface NetworkStats {
  active_workers: number;
  total_gstd_paid: number;
  tasks_24h: number;
}

// Lazy load modals for performance
const NewTaskModal = lazy(() => import('./NewTaskModal'));

function Dashboard() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { address, disconnect, tonBalance, gstdBalance } = useWalletStore();
  const [tonConnectUI] = useTonConnectUI();
  const [activeTab, setActiveTab] = useState<Tab>('tasks');
  const [showNewTask, setShowNewTask] = useState(false);
  const [isMining, setIsMining] = useState(false);

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
      } catch (err) {
        console.error('Failed to fetch network stats:', err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 60000);
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
        const temp = stats.processing_tasks > 0
          ? (stats.processing_tasks / Math.max(stats.active_devices_count, 1)).toFixed(2)
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
          : (stats.queued_tasks + stats.processing_tasks).toFixed(2);
        pressureEl.textContent = `${pressure} P`;
      } else {
        pressureEl.textContent = '0.00 P';
      }
    }
  }, []);

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
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-20 lg:pb-8">
          <ErrorBoundary>
            <div className="max-w-7xl mx-auto space-y-6">

              {/* System Status Widgets */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ComponentErrorBoundary name="TreasuryWidget">
                  <TreasuryWidget />
                </ComponentErrorBoundary>
                <ComponentErrorBoundary name="PoolStatusWidget">
                  <PoolStatusWidget />
                </ComponentErrorBoundary>
              </div>

              {/* Financial Overview - Wallet Balances */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass-card p-6 flex items-center justify-between relative overflow-hidden group hover:border-blue-500/30 transition-all duration-300">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-transparent rounded-full blur-2xl group-hover:opacity-100 opacity-50 transition-opacity" />
                  <div className="relative z-10">
                    <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                      {t('ton_balance') || 'TON Balance'}
                    </h3>
                    <div className="text-3xl font-bold text-white flex items-baseline gap-2">
                      <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                        {tonBalance ? parseFloat(tonBalance).toFixed(4) : '0.0000'}
                      </span>
                      <span className="text-base font-normal text-gray-500">TON</span>
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/10 text-blue-400 border border-blue-500/20">
                    <Wallet className="w-7 h-7" />
                  </div>
                </div>
                <div className="glass-card p-6 flex items-center justify-between relative overflow-hidden group hover:border-gold-900/30 transition-all duration-300">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-500/10 to-transparent rounded-full blur-2xl group-hover:opacity-100 opacity-50 transition-opacity" />
                  <div className="relative z-10">
                    <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                      {t('gstd_balance') || 'GSTD Balance'} (Your Earnings)
                    </h3>
                    <div className="text-3xl font-bold text-white flex items-baseline gap-2">
                      <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
                        {gstdBalance?.toFixed(2) || '0.00'}
                      </span>
                      <span className="text-base font-normal text-gray-500">GSTD</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/20 to-yellow-500/10 text-yellow-400 border border-yellow-500/20 self-end">
                      <CheckCircle className="w-7 h-7" />
                    </div>
                    <button className="text-xs px-2 py-1 bg-gold-900/20 text-gold-400 rounded border border-gold-900/30 hover:bg-gold-900/40">
                      Claim to Wallet
                    </button>
                  </div>
                </div>
              </div>

              {/* Global Network Hashrate Widget */}
              <div className="glass-card p-8 relative overflow-hidden group cursor-pointer" onClick={() => router.push('/network')}>
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-blue-500/10 opacity-50 group-hover:opacity-100 transition-opacity" />
                <div className="relative z-10 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Globe className="text-cyan-400 w-5 h-5 animate-pulse" />
                      <h3 className="text-cyan-400 font-medium tracking-wider uppercase mb-0">{t('global_network_hashrate') || 'Network Power / Capacity'}</h3>
                      <div className="text-[10px] bg-cyan-900/50 text-cyan-200 px-2 py-0.5 rounded border border-cyan-500/30 uppercase tracking-widest animate-pulse">Live</div>
                    </div>
                    <div className="text-4xl md:text-5xl font-bold text-white tracking-tight flex items-baseline gap-2 filter drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">
                      {networkStats ? (networkStats.active_workers * 12.5).toFixed(1) : '---'}
                      <span className="text-lg text-gray-400 font-normal">PH/s</span>
                    </div>
                    <div className="mt-2 text-sm text-gray-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                      {t('computing_nodes_online') || 'Nodes Online'}: <span className="text-white font-mono">{networkStats?.active_workers || 0}</span>
                      <span className="ml-4 text-emerald-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        Free Data Transfer Active
                      </span>
                    </div>
                  </div>
                  <div className="hidden md:block">
                    <Globe className="w-24 h-24 text-cyan-400 opacity-20 animate-[spin_10s_linear_infinite]" />
                  </div>
                </div>

                {/* View Map Action */}
                <div className="mt-6">
                  <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 w-[70%] animate-[shimmer_2s_infinite]"></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-2 font-mono">
                    <span>{t('genesis_task') || 'Genesis Task'}: {t('mapping') || 'Mapping'}</span>
                    <span className="text-cyan-400">{t('view_global_map') || 'View Global Map'} →</span>
                  </div>
                </div>
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={handleToggleMining}
                  className={`flex-1 py-6 px-6 rounded-2xl font-bold tracking-wide shadow-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-4 border border-white/20 relative overflow-hidden group ${isMining
                      ? 'bg-gradient-to-r from-red-600 via-rose-600 to-red-600 hover:from-red-500 shadow-red-900/30'
                      : 'bg-gradient-to-r from-emerald-600 via-green-600 to-emerald-600 hover:from-emerald-500 shadow-green-900/30'
                    }`}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  {isMining ? <Activity className="w-8 h-8 relative z-10 animate-pulse" /> : <Server className="w-8 h-8 relative z-10" />}
                  <div className="text-left relative z-10">
                    <span className="block text-xl uppercase tracking-wider">{isMining ? 'Stop Mining' : 'Start Mining'}</span>
                    <span className="text-xs font-normal opacity-80">{isMining ? 'Processing Tasks...' : 'Process Active Tasks'}</span>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('stats')}
                  className="flex-1 py-6 px-6 rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] hover:from-white/10 hover:to-white/5 text-white font-semibold border border-white/10 hover:border-white/20 backdrop-blur-md transition-all flex items-center justify-center gap-3 group"
                >
                  <Calculator className="w-6 h-6 text-cyan-400 group-hover:text-cyan-300 transition-colors" />
                  <span className="text-lg">{t('claim_rewards') || 'Claim Rewards'}</span>
                </button>
              </div>

              {/* Network Stats */}
              <ComponentErrorBoundary name="SystemStatusWidget">
                <SystemStatusWidget onStatsUpdate={handleStatsUpdate} />
              </ComponentErrorBoundary>

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

      {/* Lazy Loaded Modal */}
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
    </div>
  );
}

export default memo(Dashboard);
