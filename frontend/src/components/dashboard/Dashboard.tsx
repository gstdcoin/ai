import { useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import Sidebar from './Sidebar';
import TasksPanel from './TasksPanel';
import DevicesPanel from './DevicesPanel';
import StatsPanel from './StatsPanel';
import HelpPanel from './HelpPanel';
import CreateTaskModal from './CreateTaskModal';
import NewTaskModal from './NewTaskModal';
import { Tab } from '../../types/tabs';
import { useTonConnectUI } from '@tonconnect/ui-react';
import SystemStatusWidget from './SystemStatusWidget';
import TreasuryWidget from './TreasuryWidget';

export default function Dashboard() {
  const { t } = useTranslation('common');
  const { address, tonBalance, gstdBalance, disconnect } = useWalletStore();
  const [tonConnectUI] = useTonConnectUI();
  const [activeTab, setActiveTab] = useState<Tab>('tasks');
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);

  // Restore previously selected tab to avoid сброс при обновлении
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('activeTab') : null;
    if (saved === 'tasks' || saved === 'devices' || saved === 'stats' || saved === 'help') {
      setActiveTab(saved as Tab);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('activeTab', activeTab);
    }
  }, [activeTab]);

  const handleLogout = async () => {
    try {
      if (tonConnectUI) {
        await tonConnectUI.disconnect();
      }
    } catch {
      // ignore TonConnect disconnect errors
    } finally {
      disconnect();
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
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

  const triggerHaptic = (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium') => {
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.HapticFeedback) {
      (window as any).Telegram.WebApp.HapticFeedback.impactOccurred(style);
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
      alert(t('link_copied') || 'Link copied to clipboard!');
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-gray-50">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t('dashboard')}</h1>
              {address && (
                <p className="text-xs sm:text-sm text-gray-500 mt-1 truncate">
                  {t('wallet_address')}: {address.slice(0, 6)}...{address.slice(-4)}
                </p>
              )}
              {telegramUser && (
                <div className="flex items-center gap-2 mt-2">
                  {telegramUser.photo_url && (
                    <img 
                      src={telegramUser.photo_url} 
                      alt={telegramUser.first_name || 'User'}
                      className="w-6 h-6 rounded-full"
                    />
                  )}
                  <span className="text-xs text-gray-600">
                    {telegramUser.first_name || telegramUser.username || 'Telegram User'}
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto">
              <div className="flex gap-2 sm:gap-4 flex-wrap">
                {tonBalance !== null && (
                  <div className="text-right border-r pr-2 sm:pr-4 border-gray-100">
                    <p className="text-xs text-gray-400 uppercase tracking-wider">{t('ton_balance')}</p>
                    <p className="text-base sm:text-lg font-bold text-gray-900">{tonBalance} TON</p>
                  </div>
                )}
                {gstdBalance !== null && (
                  <div className="text-right">
                    <p className="text-xs text-gray-400 uppercase tracking-wider">{t('gstd_balance')}</p>
                    <p className="text-base sm:text-lg font-bold text-primary-600">{gstdBalance} GSTD</p>
                  </div>
                )}
              </div>
              <button
                onClick={handleShare}
                className="px-3 sm:px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm sm:text-base flex items-center gap-2"
              >
                <span>📤</span>
                <span className="hidden sm:inline">{t('share') || 'Share'}</span>
              </button>
              <button
                onClick={handleLogout}
                className="px-3 sm:px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm sm:text-base"
              >
                {t('disconnect')}
              </button>
              <button
                onClick={() => setShowNewTask(true)}
                className="bg-primary-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-xl hover:bg-primary-700 transition-all font-bold shadow-lg shadow-primary-100 active:scale-95 text-sm sm:text-base"
              >
                {t('new_task') || 'New Task'}
              </button>
              <button
                onClick={() => setShowCreateTask(true)}
                className="bg-gray-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-xl hover:bg-gray-700 transition-all font-bold shadow-lg shadow-gray-100 active:scale-95 text-sm sm:text-base"
              >
                {t('create_task')}
              </button>
            </div>
          </div>
          
          {/* Network Temperature & Computational Pressure Banner */}
          <div className="px-4 sm:px-6 py-3 bg-gradient-to-r from-orange-50 to-red-50 border-t border-orange-200">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🌡️</span>
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wider">{t('network_temperature')}</p>
                    <p className="text-lg sm:text-xl font-bold text-orange-600" id="network-temperature">0.00 T</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">⚡</span>
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wider">{t('computational_pressure')}</p>
                    <p className="text-lg sm:text-xl font-bold text-red-600" id="computational-pressure">0.00 P</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-600 italic">
                {t('depin_network_status') || 'Real-time DePIN network metrics'}
              </p>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* System Status Widget - Always visible */}
            <TreasuryWidget />
            
            <SystemStatusWidget onStatsUpdate={(stats) => {
              // Update Network Temperature and Computational Pressure
              const tempEl = document.getElementById('network-temperature');
              const pressureEl = document.getElementById('computational-pressure');
              if (tempEl) {
                if (stats) {
                  // Network Temperature: ratio of processing tasks to total capacity
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
                  // Computational Pressure: ratio of queued + processing to completed
                  const pressure = stats.completed_tasks > 0
                    ? ((stats.queued_tasks + stats.processing_tasks) / stats.completed_tasks).toFixed(2)
                    : (stats.queued_tasks + stats.processing_tasks).toFixed(2);
                  pressureEl.textContent = `${pressure} P`;
                } else {
                  pressureEl.textContent = '0.00 P';
                }
              }
            }} />
            
            {activeTab === 'tasks' && <TasksPanel onTaskCreated={() => triggerHaptic('medium')} onCompensationClaimed={() => triggerHaptic('medium')} />}
            {activeTab === 'devices' && <DevicesPanel />}
            {activeTab === 'stats' && <StatsPanel />}
            {activeTab === 'help' && <HelpPanel />}
          </div>
        </main>
      </div>

      {showCreateTask && (
        <CreateTaskModal 
          onClose={() => setShowCreateTask(false)} 
          onTaskCreated={() => triggerHaptic('medium')}
        />
      )}

      {showNewTask && (
        <NewTaskModal 
          onClose={() => setShowNewTask(false)} 
          onTaskCreated={() => {
            triggerHaptic('medium');
            setShowNewTask(false);
          }}
        />
      )}
    </div>
  );
}
