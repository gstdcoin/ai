'use client';
import { GetStaticProps } from 'next';
import { getCommonStaticProps } from '../lib/i18n-static-props';

/**
 * Sovereign Organism Protocol — GSTD Ecosystem in Telegram Mini App
 * Unified Dashboard | Neural Node Logic | Leviathan Stream | Escrow 2.0 | RU/EN Localization
 */
import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import { isTelegramWebApp, getTelegramWebApp } from '../lib/telegram';
import { API_URL } from '../lib/config';
import { useTMALocaleSync } from '../hooks/useTMALocale';
import LeviathanTMATicker from '../components/tma/LeviathanTMATicker';
import LiveHashrateChart from '../components/tma/LiveHashrateChart';
import GoldenAccumulationChart from '../components/tma/GoldenAccumulationChart';
import { useWalletStore } from '../store/walletStore';
import WalletConnect from '../components/WalletConnect';
import AgentMarketplace from '../components/agents/AgentMarketplace';
import { Zap, Activity, Bot, ArrowRightLeft } from 'lucide-react';

interface TMAStats {
  node_status: 'online' | 'offline' | 'mining';
  hashrate: number;
  earned_gstd: number;
  active_workers: number;
  tasks_completed_24h: number;
}

type TabId = 'overview' | 'worker' | 'agents' | 'trade';

export default function TMAPage() {
  const { t } = useTranslation('common');
  useTMALocaleSync();
  const { address } = useWalletStore();
  const [stats, setStats] = useState<TMAStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>('overview');

  useEffect(() => {
    const tg = getTelegramWebApp();
    if (tg) {
      tg.ready();
      tg.expand();
      tg.setHeaderColor('#030014');
      tg.setBackgroundColor('#030014');
    }
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const publicRes = await fetch(`${API_URL}/stats/public`);
        const publicData = publicRes.ok ? await publicRes.json() : {};

        setStats({
          node_status: publicData.active_nodes > 0 ? 'online' : 'offline',
          hashrate: publicData.total_tasks_completed || 0,
          earned_gstd: publicData.total_gstd_paid || 0,
          active_workers: publicData.active_nodes || 0,
          tasks_completed_24h: publicData.tasks_completed || 0,
        });
      } catch (_e) {
        console.warn('Silent fetch stats failure:', _e);
        setStats({
          node_status: 'offline',
          hashrate: 0,
          earned_gstd: 0,
          active_workers: 0,
          tasks_completed_24h: 0,
        });
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
    const iv = setInterval(fetchStats, 30000);
    return () => clearInterval(iv);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#030014] flex items-center justify-center">
        <div className="text-amber-400 animate-pulse">{t('loading', 'Loading...')}</div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: t('dashboard', 'Dashboard'), icon: <Activity className="w-4 h-4 shrink-0" /> },
    { id: 'trade', label: t('trade', 'Trade/Swap'), icon: <ArrowRightLeft className="w-4 h-4 shrink-0" /> },
    { id: 'worker', label: t('cta_worker', 'Ignite Node'), icon: <Zap className="w-4 h-4 shrink-0" /> },
    { id: 'agents', label: t('hire_agents', 'AI Workers'), icon: <Bot className="w-4 h-4 shrink-0" /> },
  ];

  return (
    <div className="min-h-screen bg-[#030014] text-white pb-24">
      {/* Leviathan Stream Bridge — Omnipresent on ALL screens */}
      <LeviathanTMATicker />

      <div className="p-4">
        {/* Header */}
        <header className="text-center py-3">
          <h1 className="text-lg font-black tracking-tight">
            <span className="bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">GSTD</span>
            {' '}{t('platform', 'Platform')}
          </h1>
        </header>

        {/* Tab Nav */}
        <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide pb-2 snap-x">
          {tabs.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-colors whitespace-nowrap snap-start ${tab === id
                ? 'bg-violet-500/30 border border-violet-500/50 text-violet-300'
                : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10'
                }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">{t('connection_status', 'Connection')}</div>
                {(() => {
                  let statusColor = 'text-gray-500';
                  let statusText = `🔴 ${t('idle', 'Idle')}`;
                  
                  if (stats?.node_status === 'online') {
                    statusColor = 'text-emerald-400';
                    statusText = `🟢 ${t('online', 'Online')}`;
                  } else if (stats?.node_status === 'mining') {
                    statusColor = 'text-amber-400';
                    statusText = `🧠 ${t('working', 'Working...')}`;
                  }

                  return (
                    <div className={`text-lg font-black ${statusColor}`}>
                      {statusText}
                    </div>
                  );
                })()}
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">{t('stat_tasks', 'Tasks (24h)')}</div>
                <div className="text-lg font-black text-violet-400 tabular-nums">
                  {(stats?.tasks_completed_24h || 0).toLocaleString()}
                </div>
              </div>
            </div>

            <LiveHashrateChart
              hashrate={stats?.hashrate || 0}
              tasksPerHour={stats?.tasks_completed_24h || 0}
              activeWorkers={stats?.active_workers || 0}
            />

            <GoldenAccumulationChart
              goldBalance={0}
              goldReserveGstd={stats?.earned_gstd || 0}
              goldMultiplier={1}
            />

            {!address && (
              <div className="rounded-xl bg-gradient-to-br from-violet-500/10 to-amber-500/10 border border-white/10 p-5 mt-4">
                <h3 className="text-lg font-black text-white mb-2">{t('welcome_guide', 'Welcome to GSTD Sovereign Network')}</h3>
                <p className="text-xs text-gray-400 mb-5 leading-relaxed">
                  {t('welcome_desc', 'The decentralized AI ecosystem that pays you. Start your journey in 3 simple steps:')}
                </p>
                
                <div className="space-y-4 mb-6">
                  <div className="flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">1</div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-200">{t('step1_title', 'Connect Wallet')}</h4>
                      <p className="text-xs text-gray-500 mt-1">
                        {t('step1_desc', 'Link your TON wallet securely to create your Sovereign Identity and start earning GSTD.')}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">2</div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-200">{t('step2_title', 'Ignite Your Node')}</h4>
                      <p className="text-xs text-gray-500 mt-1">
                        {t('step2_desc_prefix', 'Go to the')} <span className="text-emerald-400">{t('cta_worker', 'Ignite Node')}</span> {t('step2_desc_suffix', 'tab. Keep the app open to process decentralized AI tasks and earn GSTD passively.')}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">3</div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-200">{t('step3_title', 'Hire AI & Trade')}</h4>
                      <p className="text-xs text-gray-500 mt-1">
                        {t('step3_desc_prefix', 'Use your earned tokens to hire AI Agents or pay for inference. Swap GSTD seamlessly in the')} <span className="text-blue-400">{t('trade', 'Trade')}</span> {t('step3_desc_suffix', 'tab.')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5">
                   <p className="text-center text-xs font-bold text-amber-500/80 uppercase tracking-widest mb-3">{t('step1_connect', 'Step 1: Connect to Start')}</p>
                   <WalletConnect />
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'trade' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="rounded-xl bg-gradient-to-br from-violet-600/10 to-blue-600/10 border border-violet-500/20 p-4 sm:p-6 text-center">
              <h3 className="text-xl font-black text-white mb-2">{t('swap_title', 'GSTD Native Swap')}</h3>
              <p className="text-xs text-violet-300/70 mb-4 max-w-sm mx-auto">
                {t('swap_desc', 'Exchange TON for GSTD securely via STON.fi decentralised liqudity pools. Powered directly inside Telegram.')}
              </p>
              
              <div className="rounded-xl overflow-hidden bg-[#1a1a24] shadow-[0_0_30px_rgba(139,92,246,0.15)] border border-white/5 h-[500px]">
                <iframe 
                  src="https://app.ston.fi/swap?ft=TON&tt=EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO"
                  className="w-full h-full border-0"
                  title="STON.fi DEX Swap"
                  allow="clipboard-read; clipboard-write; microphone; camera"
                />
              </div>
            </div>
          </div>
        )}

        {tab === 'worker' && (
          <div className="space-y-4">
            <MobileNodePanel address={address ?? undefined} />
          </div>
        )}

        {tab === 'agents' && (
          <div className="space-y-4">
            <AgentMarketplace />
          </div>
        )}
      </div>

      {!isTelegramWebApp() && (
        <p className="text-center text-gray-500 text-xs py-4">{t('open_in_telegram', 'Open in Telegram for full experience')}</p>
      )}
    </div>
  );
}

const TIER_COLORS: Record<string, string> = {
  spark:     'text-gray-400',
  flame:     'text-orange-400',
  storm:     'text-cyan-300',
  titan:     'text-yellow-300',
  sovereign: 'text-purple-300',
};
const TIER_BG: Record<string, string> = {
  spark:     'bg-gray-700/30 border-gray-500/40',
  flame:     'bg-orange-900/30 border-orange-700/40',
  storm:     'bg-cyan-500/10 border-cyan-400/30',
  titan:     'bg-yellow-500/10 border-yellow-400/30',
  sovereign: 'bg-purple-500/10 border-purple-400/30',
};
const TIER_EMOJI: Record<string, string> = {
  spark: '⚡', flame: '🔥', storm: '⛈️', titan: '🏔️', sovereign: '👑',
};

function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = localStorage.getItem('gstd_device_id');
  if (!id) {
    id = `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem('gstd_device_id', id);
  }
  return id;
}

function getDeviceResources() {
  const nav = navigator as any;
  const cpu_cores = nav.hardwareConcurrency || 4;
  const ram_gb = nav.deviceMemory || 4;
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  const bandwidth_mbps = conn?.downlink || 5;
  const network_type = conn?.type || (conn?.effectiveType === '4g' ? 'lte' : 'wifi');
  return { cpu_cores, ram_gb, bandwidth_mbps, network_type };
}

function MobileNodePanel({ address }: { address: string | undefined }) {
  const { t } = useTranslation('common');
  const [isRunning, setIsRunning] = useState(false);
  const [tier, setTier] = useState<string>('spark');
  const [ratePerHour, setRatePerHour] = useState(0.5);
  const [baseGstd, setBaseGstd] = useState(0);
  const [baseTs, setBaseTs] = useState(() => Date.now());
  const [uptimeMinutes, setUptimeMinutes] = useState(0);
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [status, setStatus] = useState<string>('offline');
  const [claimMsg, setClaimMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const tgRef = useRef<any>(null);

  useEffect(() => {
    tgRef.current = getTelegramWebApp();
  }, []);

  // Live earnings counter (updates every second)
  const [liveGstd, setLiveGstd] = useState(0);
  useEffect(() => {
    if (!isRunning) { setLiveGstd(baseGstd); return; }
    const iv = setInterval(() => {
      const elapsedH = (Date.now() - baseTs) / 3_600_000;
      setLiveGstd(baseGstd + elapsedH * ratePerHour);
    }, 1000);
    return () => clearInterval(iv);
  }, [isRunning, baseGstd, baseTs, ratePerHour]);

  const doHeartbeat = async () => {
    const tg = tgRef.current;
    const initData = tg?.initData || '';
    const deviceId = getDeviceId();
    const resources = getDeviceResources();
    try {
      const resp = await fetch('/api/v1/mobile/node/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_init_data: initData,
          device_id: deviceId,
          wallet_address: address || '',
          ...resources,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setTier(data.tier || 'spark');
        setRatePerHour(data.rate_per_hour || 0.5);
        setBaseGstd(data.accumulated_gstd || 0);
        setBaseTs(Date.now());
        setUptimeMinutes(data.uptime_minutes || 0);
        setTasksCompleted(data.tasks_completed || 0);
        setStatus(data.status || 'active');
      }
    } catch (e) { /* network error — keep running */ }
  };

  const startNode = async () => {
    setLoading(true);
    await doHeartbeat();
    setIsRunning(true);
    heartbeatRef.current = setInterval(doHeartbeat, 300_000);
    setLoading(false);
  };

  const stopNode = () => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    setIsRunning(false);
    setStatus('offline');
  };

  useEffect(() => () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); }, []);

  const claimRewards = async () => {
    if (!address) { setClaimMsg(t('connect_wallet_first', 'Connect wallet first')); return; }
    if (liveGstd < 0.01) { setClaimMsg(t('min_claim', 'Minimum 0.01 GSTD to claim')); return; }
    const tg = tgRef.current;
    const deviceId = getDeviceId();
    setLoading(true);
    try {
      const resp = await fetch('/api/v1/mobile/node/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_init_data: tg?.initData || '',
          device_id: deviceId,
          wallet_address: address,
        }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setClaimMsg(`✅ Claimed ${data.claimed_gstd} GSTD → Balance: ${data.new_balance}`);
        setBaseGstd(0);
        setBaseTs(Date.now());
      } else {
        setClaimMsg(`❌ ${data.error || 'Claim failed'}`);
      }
    } catch { setClaimMsg('❌ Network error'); }
    setLoading(false);
    setTimeout(() => setClaimMsg(''), 5000);
  };

  const tierColor = TIER_COLORS[tier] || TIER_COLORS.spark;
  const tierBg = TIER_BG[tier] || TIER_BG.spark;
  const tierEmoji = TIER_EMOJI[tier] || '✨';

  return (
    <div className="space-y-3">
      {/* Tier badge */}
      <div className={`rounded-xl border p-4 ${tierBg}`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
              {t('node_tier', 'Node Tier')}
            </div>
            <div className={`text-2xl font-black ${tierColor}`}>
              {tierEmoji} {tier.charAt(0).toUpperCase() + tier.slice(1)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
              {t('earn_rate', 'Rate')}
            </div>
            <div className={`text-lg font-black ${tierColor}`}>{ratePerHour} GSTD/h</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center mb-3">
          <div className="rounded-lg bg-black/20 p-2">
            <div className="text-[9px] text-gray-500 uppercase font-bold">{t('earned', 'Earned')}</div>
            <div className="text-sm font-black text-amber-400 tabular-nums">{liveGstd.toFixed(4)}</div>
          </div>
          <div className="rounded-lg bg-black/20 p-2">
            <div className="text-[9px] text-gray-500 uppercase font-bold">{t('uptime', 'Uptime')}</div>
            <div className="text-sm font-black text-violet-300 tabular-nums">{uptimeMinutes}m</div>
          </div>
          <div className="rounded-lg bg-black/20 p-2">
            <div className="text-[9px] text-gray-500 uppercase font-bold">{t('tasks', 'Tasks')}</div>
            <div className="text-sm font-black text-emerald-400 tabular-nums">{tasksCompleted}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-1">
          <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
          <span className="text-xs text-gray-400 font-mono">
            {isRunning ? `🟢 ${t('node_active', 'Node Active')}` : `⚫ ${t('node_stopped', 'Stopped')}`}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        {!isRunning ? (
          <button
            onClick={startNode}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-sm disabled:opacity-50"
          >
            {loading ? '...' : `⚡ ${t('start_node', 'Start Node')}`}
          </button>
        ) : (
          <button
            onClick={stopNode}
            className="flex-1 py-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 font-bold text-sm"
          >
            {t('stop_node', 'Stop Node')}
          </button>
        )}
        <button
          onClick={claimRewards}
          disabled={loading || liveGstd < 0.01}
          className="flex-1 py-3 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-sm disabled:opacity-50"
        >
          {loading ? '...' : `💰 ${t('claim', 'Claim')}`}
        </button>
      </div>

      {claimMsg && (
        <div className="rounded-lg bg-white/5 border border-white/10 p-2 text-xs text-center text-gray-300">
          {claimMsg}
        </div>
      )}

      {/* Tier info */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-3">
        <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">
          {t('tier_rewards', 'Tier Rewards')}
        </div>
        <div className="space-y-1">
          {[['⚡ Spark', '0.5 GSTD/h', 'Any device'], ['🔥 Flame', '1.0 GSTD/h', 'Pi 4 / basic laptop'], ['⛈️ Storm', '2.5 GSTD/h', '16GB RAM server'], ['🏔️ Titan', '4.0 GSTD/h', '32GB RAM + GPU'], ['👑 Sovereign', '8.0 GSTD/h', 'High-end server']].map(([label, rate, req]) => (
            <div key={label} className="flex justify-between items-center text-xs">
              <span className="text-gray-300 font-bold">{label}</span>
              <span className="text-amber-400 font-mono">{rate}</span>
              <span className="text-gray-500 text-[10px]">{req}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: await getCommonStaticProps(locale),
});
