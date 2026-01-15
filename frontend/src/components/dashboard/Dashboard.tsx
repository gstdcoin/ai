import { useEffect, useState, lazy, Suspense, memo, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useWalletStore } from '../../store/walletStore';
import Sidebar from '../layout/Sidebar';
import BottomNav from '../layout/BottomNav';
import Header from '../layout/Header';
import TasksPanel from './TasksPanel';
import DevicesPanel from './DevicesPanel';
import StatsPanel from './StatsPanel';
import ReferralPanel from './ReferralPanel';
import HelpPanel from './HelpPanel';
import { Tab } from '../../types/tabs';
import { useTonConnectUI } from '@tonconnect/ui-react';
import SystemStatusWidget from './SystemStatusWidget';
import TreasuryWidget from './TreasuryWidget';
import PoolStatusWidget from './PoolStatusWidget';
import { toast } from '../../lib/toast';
import { Plus, Users, Calculator, Activity, Zap, Globe, Server } from 'lucide-react';
import { apiGet } from '../../lib/apiClient';

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
  const { address, disconnect } = useWalletStore();
  const [tonConnectUI] = useTonConnectUI();
  const [activeTab, setActiveTab] = useState<Tab>('tasks');
  const [showNewTask, setShowNewTask] = useState(false);

  // Restore previously selected tab to avoid сброс при обновлении
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('activeTab') : null;
    if (saved === 'tasks' || saved === 'devices' || saved === 'stats' || saved === 'referrals' || saved === 'help') {
      setActiveTab(saved as Tab);
    }
  }, []); // Empty dependency array - run only once

  // Save active tab to localStorage - separate effect to avoid cycles
  useEffect(() => {
    if (typeof window !== 'undefined' && activeTab) {
      try {
        window.localStorage.setItem('activeTab', activeTab);
      } catch (error) {
        // Ignore localStorage errors (e.g., in private browsing mode)
        console.warn('Failed to save active tab to localStorage:', error);
      }
    }
  }, [activeTab]); // Only depends on activeTab changes

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

  // Use telegram.ts helper for haptic feedback
  const triggerHaptic = (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium') => {
    if (typeof window !== 'undefined') {
      const { triggerHapticImpact } = require('../../lib/telegram');
      triggerHapticImpact(style);
    }
  };

  const handleShare = () => {
    const shareText = t('share_text') || 'Join the GSTD Platform - Decentralized AI Inference Network';
    const shareUrl = typeof window !== 'undefined' ? window.location.origin : 'https://app.gstdtoken.com';

    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      const tg = (window as any).Telegram.WebApp;
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`);
      triggerHaptic('light');
    } else if (navigator.share) {
      navigator.share({ title: 'GSTD Platform', text: shareText, url: shareUrl });
    } else {
      navigator.clipboard.writeText(shareUrl);
      toast.success(t('link_copied') || 'Link copied to clipboard!');
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-sea-50 overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onCreateTask={() => setShowNewTask(true)}
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header
          onCreateTask={() => setShowNewTask(true)}
          onLogout={handleLogout}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-20 lg:pb-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* System Status Widgets - Always visible */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <TreasuryWidget />
              <PoolStatusWidget />
            </div>

            {/* Global Network Hashrate Widget (Cosmic Only) */}
            <div className="glass-card p-8 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-blue-500/10 opacity-50 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="text-cyan-400 w-5 h-5 animate-pulse" />
                    <h3 className="text-cyan-400 font-medium tracking-wider">GLOBAL NETWORK HASHRATE</h3>
                  </div>
                  <div className="text-4xl md:text-5xl font-bold text-white tracking-tight flex items-baseline gap-2">
                    {networkStats ? (networkStats.active_workers * 12.5).toFixed(1) : '---'}
                    <span className="text-lg text-gray-400 font-normal">PH/s</span>
                  </div>
                </div>
                <div className="hidden md:block">
                  <Zap className="w-16 h-16 text-yellow-400 opacity-80 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]" />
                </div>
              </div>

              {/* Quick Actions */}
              <div className="mt-6 flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => setActiveTab('devices')}
                  className="btn-cosmic flex-1 py-3 px-6 rounded-lg flex items-center justify-center gap-2"
                >
                  <Server className="w-5 h-5" />
                  START WORKER
                </button>
                <button
                  onClick={() => setActiveTab('stats')}
                  className="glass-button flex-1 py-3 px-6 rounded-lg flex items-center justify-center gap-2 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                >
                  <Calculator className="w-5 h-5" />
                  CLAIM REWARDS
                </button>
              </div>
            </div>

            {/* Network Stats */}
            {networkStats && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-card p-6 flex items-center space-x-4">
                  <div className="p-3 rounded-full bg-blue-500/10 text-blue-400">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-400">Active Workers</h3>
                    <p className="text-2xl font-bold text-white">{networkStats.active_workers}</p>
                  </div>
                </div>
                <div className="glass-card p-6 flex items-center space-x-4">
                  <div className="p-3 rounded-full bg-green-500/10 text-green-400">
                    <Activity className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-400">Tasks (24h)</h3>
                    <p className="text-2xl font-bold text-white">{networkStats.tasks_24h}</p>
                  </div>
                </div>
                <div className="glass-card p-6 flex items-center space-x-4">
                  <div className="p-3 rounded-full bg-yellow-500/10 text-yellow-400">
                    <Calculator className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-400">GSTD Paid</h3>
                    <p className="text-2xl font-bold text-white">{networkStats.total_gstd_paid.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            )}

            <SystemStatusWidget onStatsUpdate={useCallback((stats: any) => {
              // Protect against SSR: document is not defined on the server
              if (typeof document === 'undefined') {
                return;
              }

              // Update Network Temperature and Computational Pressure
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
            }, [])} />

            {activeTab === 'tasks' && <TasksPanel
              onTaskCreated={useCallback(() => triggerHaptic('medium'), [])}
              onCompensationClaimed={useCallback(() => triggerHaptic('medium'), [])}
            />}
            {activeTab === 'devices' && <DevicesPanel />}
            {activeTab === 'stats' && <StatsPanel />}
            {activeTab === 'referrals' && <ReferralPanel />}
            {activeTab === 'help' && <HelpPanel />}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden">
        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      </div>

      {/* Floating Action Button - Unified Task Creation */}
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
          <div className="glass-card text-white">Loading...</div>
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

// Memoize Dashboard to prevent unnecessary re-renders
export default memo(Dashboard);
