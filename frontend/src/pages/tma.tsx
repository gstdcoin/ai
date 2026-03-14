'use client';
import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

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
import { Zap, Wallet, Coins, Activity, Bot } from 'lucide-react';

interface TMAStats {
  node_status: 'online' | 'offline' | 'mining';
  hashrate: number;
  gold_balance: number;
  gold_reserve_gstd: number;
  gold_multiplier: number;
  active_workers: number;
  tasks_completed_24h: number;
}

type TabId = 'overview' | 'worker' | 'golden' | 'agents';

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
    { id: 'overview', label: t('dashboard', 'Dashboard'), icon: <Activity className="w-4 h-4" /> },
    { id: 'worker', label: t('cta_worker', 'Ignite Node'), icon: <Zap className="w-4 h-4" /> },
    { id: 'golden', label: t('gold_reserve_title', 'Gold Reserve Fund'), icon: <Coins className="w-4 h-4" /> },
    { id: 'agents', label: t('hire_agents', 'AI Workers'), icon: <Bot className="w-4 h-4" /> },
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
        <div className="flex gap-2 mb-4">
          {tabs.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-bold transition-colors ${tab === id
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
                <div className={`text-lg font-black ${stats?.node_status === 'online' ? 'text-emerald-400' :
                  stats?.node_status === 'mining' ? 'text-amber-400' : 'text-gray-500'
                  }`}>
                  {stats?.node_status === 'online' ? `🟢 ${t('online', 'Online')}` :
                    stats?.node_status === 'mining' ? `🧠 ${t('working', 'Working...')}` : `🔴 ${t('idle', 'Idle')}`}
                </div>
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
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <p className="text-center text-gray-500 text-xs mb-3">{t('connect_wallet', 'Connect Wallet')} → {t('gold_reserve_title', 'Gold Reserve Fund')}</p>
                <WalletConnect />
              </div>
            )}
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
    } catch (_) { }
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
  props: {
    ...(await serverSideTranslations(locale || 'en', ['common'])),
  },
});
