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
import GoldenGatewayTransactions from '../components/tma/GoldenGatewayTransactions';
import { useWalletStore } from '../store/walletStore';
import WalletConnect from '../components/WalletConnect';
import AgentMarketplace from '../components/agents/AgentMarketplace';
import { Zap, Wallet, Coins, Activity, Bot, ArrowRightLeft } from 'lucide-react';

interface TMAStats {
  node_status: 'online' | 'offline' | 'mining';
  hashrate: number;
  gold_balance: number;
  gold_reserve_gstd: number;
  gold_multiplier: number;
  active_workers: number;
  tasks_completed_24h: number;
}

type TabId = 'overview' | 'worker' | 'golden' | 'agents' | 'trade';

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
        const [publicRes, cosmicRes] = await Promise.all([
          fetch(`${API_URL}/stats/public`),
          fetch(`${API_URL}/cosmic/gold-multiplier`),
        ]);
        const publicData = publicRes.ok ? await publicRes.json() : {};
        const cosmicData = cosmicRes.ok ? await cosmicRes.json() : {};

        setStats({
          node_status: publicData.active_devices_count > 0 ? 'online' : 'offline',
          hashrate: publicData.total_tasks_completed || 0,
          gold_balance: publicData.golden_reserve_xaut || 0,
          gold_reserve_gstd: publicData.total_gstd_paid || 0,
          gold_multiplier: cosmicData.gold_multiplier || 1.0,
          active_workers: publicData.active_devices_count || 0,
          tasks_completed_24h: publicData.completed_tasks || 0,
        });
      } catch (_e) {
        console.warn('Silent fetch stats failure:', _e);
        // Fallback or offline stats when fetching fails or is unavailable
        setStats({
          node_status: 'offline',
          hashrate: 0,
          gold_balance: 0,
          gold_reserve_gstd: 0,
          gold_multiplier: 1.0,
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
    { id: 'golden', label: t('gold_reserve_title', 'Gold Reserve'), icon: <Coins className="w-4 h-4 shrink-0" /> },
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
              goldBalance={stats?.gold_balance || 0}
              goldReserveGstd={stats?.gold_reserve_gstd || 0}
              goldMultiplier={stats?.gold_multiplier || 1}
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
                        {t('step1_desc_prefix', 'Link your TON wallet securely to receive your')} <span className="text-amber-400 font-bold">1.0 GSTD Welcome Bonus</span> {t('step1_desc_suffix', 'automatically and create your Sovereign Identity.')}
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
                        {t('step3_desc_prefix', 'Use your earned tokens to hire AI Agents, or secure your yield in the Gold Reserve Fund. Swap tokens seamlessly in the')} <span className="text-blue-400">{t('trade', 'Trade')}</span> {t('step3_desc_suffix', 'tab.')}
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
                  src="https://app.ston.fi/swap?ft=TON&tt=GSTD"
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
            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">
                {t('tab_nodes', 'Nodes')}
              </div>
              <p className="text-xs text-gray-500 mb-3">
                {t('node_desc', 'Your device processes tasks in the decentralized network.')}
              </p>
              <TMAInferenceWorker />
            </div>
            <a
              href="https://app.gstdtoken.com/agent"
              className="block w-full py-3 px-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-center text-sm font-bold"
            >
              {t('agent_node', 'Agent Node')} →
            </a>
          </div>
        )}

        {tab === 'golden' && (
          <div className="space-y-4">
            {!address ? (
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <p className="text-center text-gray-500 text-xs mb-3">{t('connect_wallet', 'Connect Wallet')} → Golden Gateway</p>
                <WalletConnect />
              </div>
            ) : (
              <>
                <GoldenGatewayTransactions wallet={address} />
                <a
                  href="https://app.gstdtoken.com/dashboard"
                  className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-sm font-bold"
                >
                  <Wallet className="w-4 h-4" />
                  {t('dashboard', 'Dashboard')}
                </a>
              </>
            )}
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

function TMAInferenceWorker() {
  const { t } = useTranslation('common');
  const [result, setResult] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    try {
      workerRef.current = new Worker('/workers/inference-worker.js');
    } catch (_err) { 
      console.warn('Worker initialization failure:', _err);
      // Ignored for environments where Web Workers are not supported
    }
    return () => workerRef.current?.terminate();
  }, []);

  const runInference = () => {
    if (!workerRef.current) {
      setResult('Worker not available');
      return;
    }
    const id = Date.now();
    workerRef.current.onmessage = (e) => {
      if (e.data?.id === id && e.data?.type === 'inference_result') {
        const r = e.data.result;
        if (e.data.throttled) {
          setResult(t('node_cooldown', 'Node Cooldown'));
        } else {
          setResult(`${r.label} (${(r.score * 100).toFixed(0)}%)`);
        }
      }
    };
    workerRef.current.postMessage({ id, type: 'inference', payload: { text: 'synchronizing...' } });
    setResult(t('connecting', 'Connecting...'));
  };

  return (
    <div>
      <button
        onClick={runInference}
        className="text-xs py-2 px-3 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold"
      >
        {t('start_node', 'Start Node')}
      </button>
      {result && <span className="ml-2 text-xs text-sky-400 font-mono">{result}</span>}
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: await getCommonStaticProps(locale),
});
