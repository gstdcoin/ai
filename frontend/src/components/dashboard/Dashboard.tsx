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
import HelpPanel from './HelpPanel';
import { Tab } from '../../types/tabs';
import { useTonConnectUI } from '@tonconnect/ui-react';
import SystemStatusWidget from './SystemStatusWidget';
import TreasuryWidget from './TreasuryWidget';
import PoolStatusWidget from './PoolStatusWidget';
import { toast } from '../../lib/toast';
import { Plus } from 'lucide-react';

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
    if (saved === 'tasks' || saved === 'devices' || saved === 'stats' || saved === 'help') {
      setActiveTab(saved as Tab);
    }
  }, []); // Empty dependency array - run only once

  // Save active tab to localStorage - separate effect to avoid cycles
  useEffect(() => {
    if (typeof window !== 'undefined' && activeTab) {
      window.localStorage.setItem('activeTab', activeTab);
    }
  }, [activeTab]); // Only depends on activeTab changes

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
          onTabChange={setActiveTab}
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
            
            <SystemStatusWidget onStatsUpdate={useCallback((stats) => {
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
            {activeTab === 'help' && <HelpPanel />}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden">
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
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
