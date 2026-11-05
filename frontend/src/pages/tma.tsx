'use client';
import { GetStaticProps } from 'next';
import { getCommonStaticProps } from '../lib/i18n-static-props';

/**
 * Sovereign Organism Protocol — GSTD Ecosystem in Telegram Mini App
 * Unified Dashboard | Neural Node Logic | Leviathan Stream | Escrow 2.0 | RU/EN Localization
 */
import React, { useEffect, useState } from 'react';
import { useTmaTranslation } from '../lib/tmaI18n';
import { isTelegramWebApp, getTelegramWebApp } from '../lib/telegram';
import { API_URL } from '../lib/config';
import Link from 'next/link';
import { useTMALocaleSync } from '../hooks/useTMALocale';
import LanguageSelector from '../components/tma/LanguageSelector';
import TelegramWalletLink from '../components/tma/TelegramWalletLink';
import LeviathanTMATicker from '../components/tma/LeviathanTMATicker';
import { useWalletStore } from '../store/walletStore';
import WalletConnect from '../components/WalletConnect';
import BrowserWorkerPanel from '../components/tma/BrowserWorkerPanel';
import { Zap, Activity, Bot, ArrowRightLeft } from 'lucide-react';

interface TMAStats {
  node_status: 'online' | 'offline';
  tasks_completed_total: number;
}

type TabId = 'overview' | 'worker' | 'agents' | 'trade';

export default function TMAPage() {
  const { t } = useTmaTranslation();
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
      if (document.hidden) return;
      try {
        const publicRes = await fetch(`${API_URL}/stats/public`);
        if (!publicRes.ok) throw new Error('stats_unavailable');
        const publicData = await publicRes.json();
        const total=publicData.total_tasks_completed ?? publicData.tasks_completed;
        if(!Number.isFinite(publicData.active_nodes)||publicData.active_nodes<0||!Number.isFinite(total)||total<0)throw new Error('invalid_stats');
        setStats({node_status:publicData.active_nodes>0?'online':'offline',tasks_completed_total:total});
      } catch (_e) {
        setStats(null);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
    const iv = setInterval(fetchStats, 120_000);
    return () => clearInterval(iv);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#030014] flex items-center justify-center">
        <div><LanguageSelector /><div className="text-amber-400 animate-pulse">{t('loading', 'Loading...')}</div></div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: t('mini_app.overview', 'Overview'), icon: <Activity className="w-4 h-4 shrink-0" /> },
    { id: 'trade', label: t('trade', 'Trade/Swap'), icon: <ArrowRightLeft className="w-4 h-4 shrink-0" /> },
    { id: 'worker', label: t('mini_app.worker', 'Compute worker'), icon: <Zap className="w-4 h-4 shrink-0" /> },
    { id: 'agents', label: t('mini_app.chat', 'AI chat'), icon: <Bot className="w-4 h-4 shrink-0" /> },
  ];

  return (
    <div className="min-h-screen bg-[#030014] text-white pb-24 overflow-x-hidden w-full max-w-full">
      {/* Leviathan Stream Bridge — Omnipresent on ALL screens */}
      <LeviathanTMATicker />

      <div className="p-4">
        {/* Header */}
        <header className="text-center py-3">
          <h1 className="text-lg font-black tracking-tight">
            <span className="bg-linear-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">GSTD</span>
            {' '}{t('platform', 'Platform')}
          </h1>
          <LanguageSelector />
        </header>

        <TelegramWalletLink />
        {/* Tab Nav */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {tabs.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex min-w-0 items-center justify-center gap-2 py-2.5 px-2 rounded-xl text-xs sm:text-sm font-bold transition-colors ${tab === id
                ? 'bg-violet-500/30 border border-violet-500/50 text-violet-300'
                : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10'
                }`}
            >
              {icon}
              <span className="truncate">{label}</span>
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
                  } else if (!stats) {
                    statusText = t('mini_app.stats_error', 'Network statistics are temporarily unavailable.');
                  }

                  return (
                    <div className={`text-lg font-black ${statusColor}`}>
                      {statusText}
                    </div>
                  );
                })()}
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">{t('mini_app.tasks_total', 'Completed tasks (all time)')}</div>
                <div className="text-lg font-black text-violet-400 tabular-nums">
                  {stats?stats.tasks_completed_total.toLocaleString():'—'}
                </div>
              </div>
            </div>

            {!address && (
              <div className="rounded-xl bg-linear-to-br from-violet-500/10 to-amber-500/10 border border-white/10 p-5 mt-4">
                <h3 className="text-lg font-black text-white mb-2">{t('welcome_guide', 'Welcome to GSTD Sovereign Network')}</h3>
                <p className="text-xs text-gray-400 mb-5 leading-relaxed">
                  {t('mini_app.intro', 'Rewards require accepted paid work.')}
                </p>
                
                <div className="space-y-4 mb-6">
                  <div className="flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">1</div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-200">{t('mini_app.step1_title', 'Connect Wallet')}</h4>
                      <p className="text-xs text-gray-500 mt-1">
                        {t('mini_app.step1_desc', 'Link your TON wallet securely to create your Sovereign Identity and start earning GSTD.')}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">2</div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-200">{t('mini_app.step2_title', 'Ignite Your Node')}</h4>
                      <p className="text-xs text-gray-500 mt-1">
                        {t('mini_app.step2_desc', 'Share compute for accepted funded tasks.')}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">3</div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-200">{t('mini_app.step3_title', 'Hire AI & Trade')}</h4>
                      <p className="text-xs text-gray-500 mt-1">
                        {t('mini_app.step3_desc', 'Choose a live model in AI chat.')}
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
            <div className="rounded-xl bg-linear-to-br from-violet-600/10 to-blue-600/10 border border-violet-500/20 p-4 sm:p-6 text-center">
              <h3 className="text-xl font-black text-white mb-2">{t('mini_app.swap_title', 'Get GSTD')}</h3>
              <p className="text-xs text-violet-300/70 mb-4 max-w-sm mx-auto">
                {t('mini_app.swap_desc', 'Open the external exchange and review its quote before signing.')}
              </p>
              
              <div className="flex flex-col gap-3 max-w-sm mx-auto">
                {[
                  { label: 'STON.fi', url: 'https://app.ston.fi/swap?ft=TON&tt=EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO' },
                ].map((d) => (
                  <a
                    key={d.label}
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(ev) => {
                      const wa: any = getTelegramWebApp();
                      if (wa?.openLink) { ev.preventDefault(); wa.openLink(d.url); }
                    }}
                    className="rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold py-3 text-sm transition-colors"
                  >
                    {t('swap_open', 'Swap on')} {d.label}
                  </a>
                ))}
                <p className="text-[11px] text-gray-500">{t('swap_note', 'DEXes do not allow embedding, so the swap opens in your browser. Always verify the GSTD contract address.')}</p>
              </div>
            </div>
          </div>
        )}

        <div hidden={tab !== 'worker'} className="space-y-4">
          <BrowserWorkerPanel address={address ?? undefined} />
        </div>

        {tab === 'agents' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">{t('mini_app.chat_desc', 'Choose a live model in chat.')}</p>
            <Link href="/chat" className="inline-block rounded-xl bg-violet-600 px-4 py-3">{t('mini_app.open_chat', 'Open AI chat')}</Link>
            <Link href="/payments" className="block underline text-violet-300">{t('mini_app.payments', 'Balance and rewards')}</Link>
          </div>
        )}
      </div>

      {!isTelegramWebApp() && (
        <p className="text-center text-gray-500 text-xs py-4">{t('open_in_telegram', 'Open in Telegram for full experience')}</p>
      )}
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: await getCommonStaticProps(locale),
});
