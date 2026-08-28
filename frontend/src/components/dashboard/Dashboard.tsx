import { useEffect, useState, memo, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import Link from 'next/link';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { useRouter } from 'next/router';
import { useWalletStore } from '../../store/walletStore';
import BottomNav from '../layout/BottomNav';
import Header from '../layout/Header';
import TasksPanel from './TasksPanel';
import DevicesPanel from './DevicesPanel';
import { Tab } from '../../types/tabs';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { toast } from '../../lib/toast';
import { Activity, Server, MessageSquare, Globe, Copy, Users, TrendingUp, ArrowRight, Briefcase } from 'lucide-react';
import { apiGet, apiPost } from '../../lib/apiClient';
import Sidebar from '../layout/Sidebar';
import { ComponentErrorBoundary } from '../common/ComponentErrorBoundary';
import { workerService } from '../../services/WorkerService';
import { ComputeNodePanel } from './ComputeNodePanel';
import { InstallPwaPrompt } from '../common/InstallPwaPrompt';
import { isTelegramWebApp, triggerHapticImpact } from '../../lib/telegram';

interface NetworkStats {
  active_workers: number;
  total_gstd_paid: number;
  tasks_24h: number;
  total_hashrate: number;
}

interface DashboardProps {
  initialTab?: string;
  sourceTelegram?: boolean;
  modeMining?: boolean;
}

function Dashboard({ initialTab, sourceTelegram, modeMining }: DashboardProps = {}) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { address, disconnect, gstdBalance, pendingEarnings } = useWalletStore();
  const [tonConnectUI] = useTonConnectUI();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const valid: Tab[] = ['home', 'tasks', 'nodes'];
    if (initialTab && valid.includes(initialTab as Tab)) return initialTab as Tab;
    return 'home';
  });
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [referralMultiplier, setReferralMultiplier] = useState(1.0);
  const [isClaimingRewards, setIsClaimingRewards] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Worker state subscription
  useEffect(() => {
    const unsub = workerService.subscribe(() => undefined);
    return unsub;
  }, []);

  // Tab persistence
  useEffect(() => {
    const valid: Tab[] = ['home', 'tasks', 'nodes'];
    if (initialTab && valid.includes(initialTab as Tab)) { setActiveTab(initialTab as Tab); return; }
    const saved = typeof window !== 'undefined' ? localStorage.getItem('activeTab') : null;
    if (saved && valid.includes(saved as Tab)) setActiveTab(saved as Tab);
  }, [initialTab]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('activeTab', activeTab); } catch (_e) { /* ignore storage errors */ }
    }
  }, [activeTab]);

  // Network stats polling
  useEffect(() => {
    const fetch = async () => {
      try { setNetworkStats(await apiGet<NetworkStats>('/network/stats')); } catch (_e) { setNetworkStats(null); }
    };
    fetch();
    const itv = setInterval(fetch, 30000);
    return () => clearInterval(itv);
  }, []);

  // Referral multiplier
  useEffect(() => {
    if (!address) return;
    apiGet<{ total_referred?: number; total_referrals?: number }>('/referrals/stats')
      .then((r) => setReferralMultiplier(1 + 0.05 * Math.min(r?.total_referred ?? r?.total_referrals ?? 0, 5)))
      .catch(() => setReferralMultiplier(1.0));
  }, [address]);

  // Auto-activate wallet node (from Telegram)
  useEffect(() => {
    if (modeMining && address) {
      apiPost('/nodes/activate-wallet', sourceTelegram ? { source: 'telegram' } : {}).catch(() => undefined);
    }
  }, [modeMining, address, sourceTelegram]);

  const triggerHaptic = useCallback((style: 'light' | 'medium' | 'heavy' = 'medium') => {
    try { triggerHapticImpact(style); } catch (_e) { /* non-telegram environment */ }
  }, []);

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    triggerHaptic('light');
  }, [triggerHaptic]);

  const handleLogout = async () => {
    try { if (tonConnectUI) await tonConnectUI.disconnect(); } catch (_e) { /* ignore disconnect errors */ }
    finally { workerService.terminate(); disconnect(); router.push('/'); }
  };

  const handleClaimRewards = useCallback(async () => {
    if (!address) return;
    setIsClaimingRewards(true);
    try {
      const targetId = workerService.targetTaskId;
      if (targetId) {
        await apiPost(`/marketplace/tasks/${targetId}/payout`, {});
        toast.success(t('rewards_claimed', 'Rewards Claimed!') || 'Claimed!', '');
        workerService.targetTaskId = null;
        return;
      }
      setActiveTab('tasks');
    } catch (err: any) {
      toast.error(t('claim_failed', 'Claim Failed') || 'Failed', err.message || '');
    } finally { setIsClaimingRewards(false); }
  }, [address, t]);

  const handleCopyReferral = useCallback(() => {
    if (!address) return;
    const link = `https://platform.gstdtoken.com/?ref=${address.slice(0, 12)}`;
    navigator.clipboard.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
    toast.success(t('link_copied', 'Copied!'), '');
  }, [address, t]);

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col lg:flex-row h-screen bg-[#030014] overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
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

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-28 lg:pb-8" style={{ scrollbarWidth: 'thin' }}>
          <ErrorBoundary>
            <div className="max-w-4xl mx-auto">

              {/* ═══ HOME TAB ═══ */}
              {activeTab === 'home' && (
                <div className="space-y-5 animate-in fade-in duration-300">

                  {/* Balance Card */}
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(6,182,212,0.06))',
                    border: '1px solid rgba(139,92,246,0.12)',
                    borderRadius: 20,
                    padding: '24px',
                  }}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('balance', 'Balance')}</div>
                        <div className="text-4xl font-black text-white tabular-nums tracking-tight">
                          {gstdBalance?.toFixed(2) || '0.00'}
                          <span className="text-base text-gray-500 font-bold ml-2">GSTD</span>
                        </div>
                      </div>
                      {(pendingEarnings ?? 0) > 0 && (
                        <div className="flex items-center gap-3">
                          <div>
                            <div className="text-[10px] text-emerald-400/70 font-bold uppercase">{t('pending', 'Pending')}</div>
                            <div className="text-xl font-black text-emerald-400 tabular-nums">{pendingEarnings?.toFixed(2)}</div>
                          </div>
                          <button
                            onClick={handleClaimRewards}
                            disabled={isClaimingRewards}
                            className="px-5 py-2.5 rounded-xl bg-emerald-500 text-black text-sm font-bold hover:bg-emerald-400 active:scale-[0.97] disabled:opacity-50 transition-all"
                          >
                            {isClaimingRewards ? '...' : t('claim_rewards', 'Claim')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ═══ TWA COMPUTE NODE — Cyber Dashboard ═══ */}
                  <ComponentErrorBoundary name="ComputeNodePanel">
                    <ComputeNodePanel />
                  </ComponentErrorBoundary>

                  {/* Network Quick Stats */}
                  <div style={{
                    background: 'rgba(8,8,26,0.8)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 16,
                    padding: '20px',
                  }}>
                    <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">{t('network_status', 'Network')}</div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <div className="text-[10px] text-gray-600 mb-1"><Server size={14} className="inline text-violet-400 mr-1" />{t('workers_online', 'Workers')}</div>
                        <div className="text-lg font-bold text-white tabular-nums">{networkStats?.active_workers || 0}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-gray-600 mb-1"><Activity size={14} className="inline text-sky-400 mr-1" />{t('tasks_today', 'Tasks 24h')}</div>
                        <div className="text-lg font-bold text-white tabular-nums">{networkStats?.tasks_24h || 0}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-gray-600 mb-1"><Users size={14} className="inline text-emerald-400 mr-1" />{t('your_referral', 'Referral')}</div>
                        <div className="text-lg font-bold text-emerald-400 tabular-nums">{referralMultiplier.toFixed(2)}×</div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Link
                      href="/chat"
                      style={{
                        background: 'rgba(139,92,246,0.04)',
                        border: '1px solid rgba(139,92,246,0.10)',
                        borderRadius: 14,
                        padding: '16px 20px',
                      }}
                      className="flex items-center justify-between group hover:border-violet-500/20 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-violet-500/10">
                          <MessageSquare size={16} className="text-violet-400" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-white">{t('open_chat', 'Open Chat')}</div>
                          <div className="text-[11px] text-gray-600">{t('ai_chat_desc', 'AI assistant')}</div>
                        </div>
                      </div>
                      <ArrowRight size={14} className="text-gray-600 group-hover:text-violet-400 transition-colors" />
                    </Link>

                    <button
                      onClick={() => handleTabChange('nodes')}
                      style={{
                        background: 'rgba(6,182,212,0.04)',
                        border: '1px solid rgba(6,182,212,0.10)',
                        borderRadius: 14,
                        padding: '16px 20px',
                      }}
                      className="flex items-center justify-between group hover:border-cyan-500/20 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-cyan-500/10">
                          <Server size={16} className="text-cyan-400" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-white">{t('my_node', 'My Node')}</div>
                          <div className="text-[11px] text-gray-600">{t('my_node_desc', 'Earn GSTD')}</div>
                        </div>
                      </div>
                      <ArrowRight size={14} className="text-gray-600 group-hover:text-cyan-400 transition-colors" />
                    </button>

                    <Link
                      href="/training"
                      style={{
                        background: 'rgba(16,185,129,0.04)',
                        border: '1px solid rgba(16,185,129,0.10)',
                        borderRadius: 14,
                        padding: '16px 20px',
                      }}
                      className="flex items-center justify-between group hover:border-emerald-500/20 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-500/10">
                          <Briefcase size={16} className="text-emerald-400" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-white">{t('live_monitor', 'Tasks')}</div>
                          <div className="text-[11px] text-gray-600">{t('monitor_desc', 'Physical marketplace')}</div>
                        </div>
                      </div>
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    </Link>
                  </div>

                  {/* Referral Card */}
                  {address && (
                    <div style={{
                      background: 'rgba(8,8,26,0.8)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 16,
                      padding: '20px',
                    }}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-xl bg-amber-500/10">
                            <TrendingUp size={16} className="text-amber-400" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-white">{t('invite_friends', 'Invite Friends')}</div>
                            <div className="text-[11px] text-gray-500">{t('referral_desc', '+5% per referral')}</div>
                          </div>
                        </div>
                        <button
                          onClick={handleCopyReferral}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-gray-300 hover:bg-white/[0.06] hover:text-white transition-all"
                        >
                          <Copy size={13} />
                          {linkCopied ? t('link_copied', 'Copied!') : t('copy_link', 'Copy Link')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═══ TASKS TAB ═══ */}
              {activeTab === 'tasks' && (
                <div className="animate-in fade-in duration-300">
                  <ComponentErrorBoundary name="TasksPanel">
                    <TasksPanel
                      onTaskCreated={() => triggerHaptic('medium')}
                      onCompensationClaimed={() => triggerHaptic('medium')}
                    />
                  </ComponentErrorBoundary>
                </div>
              )}

              {/* ═══ NODES TAB ═══ */}
              {activeTab === 'nodes' && (
                <div className="animate-in fade-in duration-300">
                  <ComponentErrorBoundary name="DevicesPanel">
                    <DevicesPanel />
                  </ComponentErrorBoundary>
                </div>
              )}

            </div>
          </ErrorBoundary>
        </main>
      </div>

      <div className="lg:hidden">
        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      </div>

      <InstallPwaPrompt />
    </div>
  );
}

export default memo(Dashboard);
