import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useState, useEffect } from 'react';
import Head from 'next/head';
import {
  Server, Trophy, Flame, Zap, TrendingUp, Clock, Shield,
  ChevronRight, ExternalLink, Star, Cpu, ArrowRight, Users, Smartphone, MessageCircle,
  Activity, Vote, Globe, Droplet
} from 'lucide-react';
import { API_BASE_URL } from '../lib/config';

const TIER_STYLES: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  bronze:   { bg: 'rgba(205,127,50,0.08)', border: 'rgba(205,127,50,0.2)', text: '#CD7F32', glow: '0 0 20px rgba(205,127,50,0.15)' },
  silver:   { bg: 'rgba(192,192,192,0.08)', border: 'rgba(192,192,192,0.2)', text: '#C0C0C0', glow: '0 0 20px rgba(192,192,192,0.15)' },
  gold:     { bg: 'rgba(255,215,0,0.08)', border: 'rgba(255,215,0,0.2)', text: '#FFD700', glow: '0 0 20px rgba(255,215,0,0.15)' },
  platinum: { bg: 'rgba(229,228,226,0.08)', border: 'rgba(229,228,226,0.2)', text: '#E5E4E2', glow: '0 0 20px rgba(229,228,226,0.15)' },
  diamond:  { bg: 'rgba(185,242,255,0.08)', border: 'rgba(185,242,255,0.2)', text: '#B9F2FF', glow: '0 0 25px rgba(185,242,255,0.2)' },
};

const TIER_ICONS: Record<string, string> = { bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '💎', diamond: '👑' };

interface TierDef { name: string; min_hours: number; multiplier: number; base_per_hour: number; }
interface LeaderEntry { rank: number; node: string; tier: string; tier_icon: string; streak_days: number; uptime_hours: number; tasks_completed: number; earned_gstd: number; online: boolean; }
interface NetworkData { total_nodes: number; online_nodes: number; total_tasks: number; total_uptime_h: number; total_rewards_gstd: number; today_rewards_gstd: number; tier_distribution: Array<{ tier: string; count: number }>; }
interface StreakBonus { days: number; bonus_percent: number; label: string; }
interface TaskReward { task: string; reward_gstd: number; }
interface ProgramData {
  tiers: TierDef[];
  streak_bonuses: StreakBonus[];
  task_rewards: TaskReward[];
}
interface HealthData { status: string; total_nodes: number; online_nodes: number; uptime_percent: number; avg_latency_ms: number; aggregate_bandwidth: string; tasks_per_hour: number; protocol_version: string; consensus_health: string; regions: Array<{ region: string; nodes: number; avg_latency_ms: number }>; network_capacity: { ai_inference_tflops: number; storage_available_tb: number; bandwidth_gbps: number }; vs_bitcoin: { gstd_tps: number; bitcoin_tps: number; gstd_finality_sec: number; bitcoin_finality_min: number; gstd_energy_per_tx: string; bitcoin_energy_per_tx: string }; }
interface TaskItem { id: string; type: string; title: string; description: string; reward_gstd: number; estimated_time: string; priority: string; active_nodes: number; requirements: Record<string, any>; }
interface Proposal { id: string; title: string; description: string; status: string; category: string; votes_for: number; votes_against: number; votes_total: number; quorum_needed: number; quorum_percent: number; ends_at: string; }
interface BurnData { total_burned_gstd: number; max_supply: number; current_circulating: number; burn_rate_daily: number; burn_sources: Array<{ source: string; percent: string; burned: number; description: string }>; next_burn_event: { type: string; date: string; estimated: string }; }
interface VaultState { vault_id: string; node_wallet: string; asset: string; total_liquidity: number; operator_stake: number; delegator_stake: number; management_fee_pct: number; total_volume: number; generated_yield: number; status: string; }

export default function NodesPage() {
  const { t } = useTranslation('common');
  const [network, setNetwork] = useState<NetworkData | null>(null);
  const [leaders, setLeaders] = useState<LeaderEntry[]>([]);
  const [program, setProgram] = useState<ProgramData | null>(null);
  const [period, setPeriod] = useState('all');
  const [health, setHealth] = useState<HealthData | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [governance, setGovernance] = useState<Proposal[]>([]);
  const [burn, setBurn] = useState<BurnData | null>(null);
  const [vaults, setVaults] = useState<VaultState[]>([]);
  const [tab, setTab] = useState<'overview' | 'tasks' | 'governance' | 'burn' | 'vaults'>('overview');

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/nodes/rewards/network`).then(r => r.json()).then(setNetwork).catch(() => undefined);
    fetch(`${API_BASE_URL}/api/v1/nodes/rewards/program`).then(r => r.json()).then(setProgram).catch(() => undefined);
    fetch(`${API_BASE_URL}/api/v1/nodes/rewards/leaderboard?period=${period}`).then(r => r.json()).then(d => setLeaders(d.leaderboard || [])).catch(() => undefined);
    fetch(`${API_BASE_URL}/api/v1/nodes/tools/health`).then(r => r.json()).then(setHealth).catch(() => undefined);
    fetch(`${API_BASE_URL}/api/v1/nodes/tools/tasks/available`).then(r => r.json()).then(d => setTasks(d.tasks || [])).catch(() => undefined);
    fetch(`${API_BASE_URL}/api/v1/nodes/tools/governance/active`).then(r => r.json()).then(d => setGovernance(d.proposals || [])).catch(() => undefined);
    fetch(`${API_BASE_URL}/api/v1/nodes/tools/burn-stats`).then(r => r.json()).then(setBurn).catch(() => undefined);
    fetch(`${API_BASE_URL}/api/v1/nodes/liquidity/pools`).then(r => r.json()).then(d => setVaults(d || [])).catch(() => undefined);
  }, [period]);

  const tiers: TierDef[] = program?.tiers || [];

  return (
    <>
      <Head>
        <title>{t('nodes_page_title')}</title>
        <meta name="description" content={t('nodes_page_desc')} />
      </Head>

      <div className="sovereign-section min-h-screen">
        <div className="max-w-6xl mx-auto px-6">

          {/* Hero */}
          <div className="text-center max-w-2xl mx-auto mb-16 fu d1">
            <div className="sec-tag cyan justify-center inline-flex mb-4">{t('nodes_badge', 'DECENTRALIZED NEURAL NETWORK')}</div>
            <h1 className="sec-title">
              {t('nodes_hero_1')} <span className="text-gradient-emerald">{t('nodes_hero_2')}</span>
            </h1>
            <p className="sec-sub mx-auto">
              {t('nodes_hero_desc')}
            </p>
            <div className="flex justify-center gap-4 flex-wrap mt-6">
              <a href="https://t.me/GstdAppBot" target="_blank" rel="noopener noreferrer" className="btn-sovereign violet shadow-lg hover:shadow-violet-500/25">
                <span style={{ fontSize: 18 }}>📱</span> {t('nodes_mobile_btn', 'Mobile Node')}
              </a>
              <a href="https://gstdbot.gstdtoken.com" target="_blank" rel="noopener noreferrer" className="btn-sovereign emerald shadow-lg hover:shadow-emerald-500/25 text-black">
                <span style={{ fontSize: 18 }}>💻</span> {t('nodes_desktop_btn', 'Desktop Node')}
              </a>
            </div>
          </div>

          {/* ═══════════ Mobile Node CTA ═══════════ */}
          <div className="sov-card cyan-top p-8 mb-12 fu d2 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-cyan-500/10 blur-2xl pointer-events-none" />
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/20">
                <div style={{ fontSize: 32, lineHeight: 1 }}>📱</div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold text-white mb-2">{t('nodes_mobile_title')}</h3>
                <p className="text-gray-400 text-sm leading-relaxed mb-4">{t('nodes_mobile_desc')}</p>
                <div className="flex flex-wrap gap-4 mb-4 text-xs font-medium text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="text-base leading-none">⚡</span> {t('nodes_mobile_feat_1')}</span>
                  <span className="flex items-center gap-1.5"><span className="text-base leading-none">💰</span> {t('nodes_mobile_feat_2')}</span>
                  <span className="flex items-center gap-1.5"><span className="text-base leading-none">🔗</span> {t('nodes_mobile_feat_3')}</span>
                  <span className="flex items-center gap-1.5"><span className="text-base leading-none">📊</span> {t('nodes_mobile_feat_4')}</span>
                </div>
                <a href="https://t.me/GstdAppBot" target="_blank" rel="noopener noreferrer" className="btn-sovereign ghost mt-2 text-cyan-400 hover:text-cyan-300">
                  <MessageCircle size={14} className="mr-1" /> {t('nodes_mobile_cta')} <ArrowRight size={14} />
                </a>
              </div>
            </div>
          </div>

        {/* Network Stats */}
        {network && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-10 fu d3">
            {[
              { v: network.total_nodes, l: t('nodes_total_nodes', 'Nodes'), c: 'text-cyan-400', i: '📡' },
              { v: network.online_nodes, l: t('nodes_online_now', 'Online'), c: 'text-emerald-400', i: '🟢' },
              { v: network.total_tasks, l: t('nodes_tasks_done', 'Tasks'), c: 'text-violet-400', i: '⚡' },
              { v: `${Math.round(network.total_rewards_gstd)}`, l: t('nodes_gstd_earned', 'All-Time Earned'), c: 'text-amber-400', i: '💎' },
              { v: `${network.today_rewards_gstd?.toFixed(2) || '0'}`, l: t('nodes_today_rewards', 'Today'), c: 'text-emerald-400', i: '💸' },
              { v: `${Math.round(network.total_uptime_h)}h`, l: t('nodes_total_uptime', 'Uptime'), c: 'text-orange-400', i: '⏱️' },
            ].map((s) => (
              <div key={s.l} className="sov-card !p-4 flex flex-col items-center justify-center min-h-[110px]">
                <div style={{ fontSize: 20, lineHeight: 1, marginBottom: 8 }}>{s.i}</div>
                <div className="text-xl font-black text-white leading-none mb-1">{s.v}</div>
                <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold whitespace-nowrap">{s.l}</div>
              </div>
            ))}
          </div>
        )}

          {/* ═══ Network Tools Tabs ═══ */}
          <div className="flex gap-2 mb-8 p-1.5 rounded-2xl bg-white/[0.02] border border-white/5 font-medium fu d4 overflow-x-auto hide-scrollbar">
            {([
              { id: 'overview' as const, label: 'Overview', icon: '🌍' },
              { id: 'tasks' as const, label: 'Tasks', icon: '⚡' },
              { id: 'vaults' as const, label: 'Vaults', icon: '🏦' },
              { id: 'governance' as const, label: 'Governance', icon: '⚖️' },
              { id: 'burn' as const, label: 'Burns', icon: '🔥' },
            ]).map(tb => (
              <button key={tb.id} onClick={() => setTab(tb.id)} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-none cursor-pointer text-xs transition-all whitespace-nowrap min-w-[100px] ${tab === tb.id ? 'bg-violet-500/10 text-white font-bold' : 'bg-transparent text-gray-500 font-medium hover:bg-white/[0.02]'}`}>
                <span className="text-base leading-none">{tb.icon}</span> {tb.label}
              </button>
            ))}
          </div>

          {/* ═══ TAB: Network Health ═══ */}
          {tab === 'overview' && health && (
            <div className="mb-10 fu d5">
              <div className="flex items-center gap-3 mb-6">
                <div style={{ fontSize: 24, lineHeight: 1 }}>❤‍🔥</div>
                <h2 className="text-xl font-bold text-white m-0">Network Health</h2>
                <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400">{health.protocol_version}</span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {[
                  { v: `${health.avg_latency_ms}ms`, l: 'Avg Latency', c: 'text-cyan-400' },
                  { v: health.aggregate_bandwidth, l: 'Bandwidth', c: 'text-violet-400' },
                  { v: `${health.uptime_percent}%`, l: 'Uptime', c: 'text-emerald-400' },
                  { v: health.tasks_per_hour.toFixed(0), l: 'Tasks/hour', c: 'text-amber-400' },
                ].map((s, i) => (
                  <div key={s.l} className="sov-card !p-4 flex flex-col items-center justify-center">
                    <div className={`text-2xl font-black mb-1 leading-none ${s.c}`}>{s.v}</div>
                    <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{s.l}</div>
                  </div>
                ))}
              </div>

              {/* GSTD vs Bitcoin comparison */}
              <div style={{ padding: '16px', borderRadius: 14, background: 'linear-gradient(135deg, rgba(139,92,246,0.06), rgba(16,185,129,0.04))', border: '1px solid rgba(139,92,246,0.1)', marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'white', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TrendingUp size={14} style={{ color: '#a78bfa' }} /> GSTD vs Bitcoin — Network Advantages
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, fontSize: 10 }}>
                  <div style={{ padding: '8px 6px', fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>Metric</div>
                  <div style={{ padding: '8px 6px', fontWeight: 700, color: '#a78bfa', textAlign: 'center' }}>GSTD</div>
                  <div style={{ padding: '8px 6px', fontWeight: 700, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>Bitcoin</div>

                  <div style={{ padding: '6px', color: 'rgba(255,255,255,0.4)' }}>TPS</div>
                  <div style={{ padding: '6px', color: '#34d399', fontWeight: 700, textAlign: 'center' }}>{health.vs_bitcoin.gstd_tps.toLocaleString()}</div>
                  <div style={{ padding: '6px', color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>{health.vs_bitcoin.bitcoin_tps}</div>

                  <div style={{ padding: '6px', color: 'rgba(255,255,255,0.4)' }}>Finality</div>
                  <div style={{ padding: '6px', color: '#34d399', fontWeight: 700, textAlign: 'center' }}>{health.vs_bitcoin.gstd_finality_sec}s</div>
                  <div style={{ padding: '6px', color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>{health.vs_bitcoin.bitcoin_finality_min} min</div>

                  <div style={{ padding: '6px', color: 'rgba(255,255,255,0.4)' }}>Energy/TX</div>
                  <div style={{ padding: '6px', color: '#34d399', fontWeight: 700, textAlign: 'center' }}>{health.vs_bitcoin.gstd_energy_per_tx}</div>
                  <div style={{ padding: '6px', color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>{health.vs_bitcoin.bitcoin_energy_per_tx}</div>
                </div>
              </div>

              {/* Regions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {health.regions.map(r => (
                  <div key={r.region} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Globe size={12} style={{ color: '#60a5fa' }} /> {r.region}
                    </span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{r.nodes} nodes · {r.avg_latency_ms}ms</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ TAB: Liquidity Vaults ═══ */}
          {tab === 'vaults' && (
            <div className="mb-8 fu d5">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div style={{ fontSize: 24, lineHeight: 1 }}>🏦</div>
                  <h2 className="text-xl font-bold text-white m-0">Sovereign Liquidity Vaults</h2>
                </div>
                <button className="btn-sovereign cyan text-xs py-1.5 px-3">
                  + Create LP Vault
                </button>
              </div>

              <div className="sov-card cyan-top !p-5 mb-6 text-sm text-gray-400 leading-relaxed shadow-lg">
                <strong className="text-cyan-400">How it works:</strong> Diamond/Platinum nodes can offer non-custodial cross-chain liquidity. Your node executes atomic swaps (HTLC) securing fees. Delegators can stake into your vault, and you earn an automated management fee on their generated yield. Funds remain completely under Layer 1 Smart Contract protection.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {vaults.map(v => (
                  <div key={v.vault_id} className="sov-card !p-5 flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-sm font-black text-white shadow-lg shadow-cyan-500/20">
                          {v.asset}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">{v.node_wallet?.slice(0, 4) || '????'}...{v.node_wallet?.slice(-4) || '????'} LP Vault</div>
                          <div className="text-[10px] text-gray-500 font-mono tracking-widest">{v.vault_id}</div>
                        </div>
                      </div>
                      <div className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-bold uppercase tracking-widest border border-emerald-500/20">
                        {v.status || 'Active'}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-black/20 p-3 rounded-xl border border-white/5 mb-4">
                      <div>
                        <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-1">TVL (Liquidity)</div>
                        <div className="text-sm font-black text-white">{v.total_liquidity?.toLocaleString() || 0} <span className="text-gray-500 text-xs">{v.asset}</span></div>
                      </div>
                      <div>
                        <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-1">Delegated</div>
                        <div className="text-sm font-black text-violet-400">{v.delegator_stake?.toLocaleString() || 0} <span className="text-violet-400/50 text-xs">{v.asset}</span></div>
                      </div>
                      <div>
                        <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-1">Yield</div>
                        <div className="text-sm font-black text-emerald-400">+{v.generated_yield?.toLocaleString() || 0} <span className="text-emerald-400/50 text-xs">{v.asset}</span></div>
                      </div>
                      <div>
                        <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-1">Mngmt Fee</div>
                        <div className="text-sm font-black text-amber-400">{(v.management_fee_pct * 100).toFixed(0)}%</div>
                      </div>
                    </div>

                    <div className="flex justify-end mt-auto">
                      <button className="btn-sovereign ghost text-xs py-1.5 px-4 w-full justify-center">
                        Stake to Pool
                      </button>
                    </div>
                  </div>
                ))}
                
                {vaults.length === 0 && (
                   <div className="col-span-1 md:col-span-2 text-center p-8 text-gray-500 text-sm">
                      No active liquidity vaults right now.
                   </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ TAB: Task Marketplace ═══ */}
          {tab === 'tasks' && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Zap size={18} style={{ color: '#a78bfa' }} />
                <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0 }}>Task Marketplace</h2>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(167,139,250,0.1)', color: '#a78bfa' }}>{tasks.length} available</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tasks.map(task => {
                  let priorityColor = '#60a5fa';
                  if (task.priority === 'critical') priorityColor = '#ef4444';
                  else if (task.priority === 'high') priorityColor = '#fb923c';
                  return (
                    <div key={task.id} style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 2 }}>{task.title}</div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', lineHeight: 1.4 }}>{task.description}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#a78bfa' }}>{task.reward_gstd} <span style={{ fontSize: 9 }}>GSTD</span></div>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{task.estimated_time}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', background: `${priorityColor}15`, color: priorityColor }}>{task.priority}</span>
                          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{task.active_nodes} nodes active</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ TAB: Governance ═══ */}
          {tab === 'governance' && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Vote size={18} style={{ color: '#60a5fa' }} />
                <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0 }}>Governance</h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {governance.map(p => {
                  const pct = p.votes_total > 0 ? (p.votes_for / p.votes_total * 100) : 0;
                  let statusColor = '#facc15';
                  if (p.status === 'passed') statusColor = '#34d399';
                  else if (p.status === 'voting') statusColor = '#60a5fa';
                  return (
                    <div key={p.id} style={{ padding: '16px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', fontFamily: 'monospace' }}>{p.id}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase', background: `${statusColor}15`, color: statusColor }}>{p.status}</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 4 }}>{p.title}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 10, lineHeight: 1.5 }}>{p.description}</div>

                      {p.votes_total > 0 && (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
                            <span>For: {p.votes_for} ({pct.toFixed(0)}%)</span>
                            <span>Against: {p.votes_against}</span>
                          </div>
                          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: 3, background: `linear-gradient(90deg, #34d399, #60a5fa)`, transition: 'width 0.5s' }} />
                          </div>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
                            Quorum: {p.quorum_percent.toFixed(0)}% of {p.quorum_needed} needed
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ TAB: Token Burns ═══ */}
          {tab === 'burn' && burn && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Flame size={18} style={{ color: '#f97316' }} />
                <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0 }}>Token Burn Tracker</h2>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
                {[
                  { v: burn.total_burned_gstd.toFixed(2), l: 'Total Burned', c: '#f97316' },
                  { v: burn.burn_rate_daily.toFixed(2), l: 'Daily Burn Rate', c: '#fb923c' },
                  { v: `${(burn.current_circulating / 1000000).toFixed(1)}M`, l: 'Circulating', c: '#60a5fa' },
                  { v: '1B', l: 'Max Supply', c: '#a78bfa' },
                ].map(s => (
                  <div key={s.l} style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: s.c }}>{s.v}</div>
                    <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>{s.l}</div>
                  </div>
                ))}
              </div>

              {/* Burn Sources */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Burn Sources</div>
                {burn.burn_sources.map(bs => (
                  <div key={bs.source} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', marginBottom: 4 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'white' }}>{bs.source} <span style={{ color: '#f97316', fontWeight: 700 }}>{bs.percent}</span></div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{bs.description}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#fb923c' }}>{bs.burned} <span style={{ fontSize: 9 }}>GSTD</span></div>
                  </div>
                ))}
              </div>

              {/* Next burn event */}
              <div style={{ padding: '14px 16px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(249,115,22,0.06), rgba(234,88,12,0.03))', border: '1px solid rgba(249,115,22,0.12)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#fb923c', marginBottom: 4 }}>🔥 Next: {burn.next_burn_event.type}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                  {new Date(burn.next_burn_event.date).toLocaleDateString()} · Est. {burn.next_burn_event.estimated}
                </div>
              </div>
            </div>
          )}

          {/* Tier System */}
          <div style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trophy size={20} style={{ color: '#FFD700' }} /> {t('nodes_tier_system')}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tiers.map((tier, i) => {
                const s = TIER_STYLES[tier.name] || TIER_STYLES.bronze;
                return (
                  <div key={tier.name} style={{
                    display: 'flex', alignItems: 'center', padding: '14px 16px', borderRadius: 14,
                    background: s.bg, border: `1px solid ${s.border}`, boxShadow: s.glow,
                    transition: 'all 0.3s',
                  }}>
                    <span style={{ fontSize: 24, marginRight: 12 }}>{TIER_ICONS[tier.name]}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: s.text, textTransform: 'capitalize' }}>{tier.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                        {tier.min_hours > 0 ? `${tier.min_hours}+ ${t('nodes_hours_uptime')}` : t('nodes_starting_tier')}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: s.text }}>{tier.base_per_hour} <span style={{ fontSize: 10, fontWeight: 500 }}>GSTD/h</span></div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{tier.multiplier}x</div>
                    </div>
                    {i < tiers.length - 1 && <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.15)', marginLeft: 8 }} />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Streak Bonuses */}
          <div style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Flame size={20} style={{ color: '#f97316' }} /> {t('nodes_streak_bonuses')}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
              {(program?.streak_bonuses || []).map((s) => (
                <div key={s.days} style={{
                  padding: '16px 14px', borderRadius: 14, textAlign: 'center',
                  background: 'rgba(249,115,22,0.04)', border: '1px solid rgba(249,115,22,0.1)',
                }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#fb923c' }}>{s.days}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>{t('nodes_days_online')}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#34d399' }}>+{s.bonus_percent}%</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Task Rewards */}
          <div style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={20} style={{ color: '#a78bfa' }} /> {t('nodes_task_rewards')}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
              {[...(program?.task_rewards || [])].sort((a, b) => b.reward_gstd - a.reward_gstd).map((taskReward) => (
                <div key={taskReward.task} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>{taskReward.task}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#a78bfa' }}>{taskReward.reward_gstd} <span style={{ fontSize: 9 }}>GSTD</span></span>
                </div>
              ))}
            </div>
          </div>

          {/* Leaderboard */}
          <div style={{ marginBottom: 48 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Star size={20} style={{ color: '#facc15' }} /> {t('nodes_leaderboard')}
              </h2>
              <div style={{ display: 'flex', gap: 4 }}>
                {['all', '30d', '7d', 'today'].map(p => (
                  <button key={p} onClick={() => setPeriod(p)} style={{
                    padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: period === p ? 'rgba(139,92,246,0.15)' : 'transparent',
                    color: period === p ? 'white' : 'rgba(255,255,255,0.35)',
                    fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                  }}>{p === 'all' ? t('nodes_all_time') : p}</button>
                ))}
              </div>
            </div>

            {leaders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <Users size={32} style={{ color: 'rgba(255,255,255,0.15)', marginBottom: 12 }} />
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>{t('nodes_no_nodes_yet')}</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {leaders.slice(0, 20).map((l, i) => {
                  const ts = TIER_STYLES[l.tier] || TIER_STYLES.bronze;
                  const isTopThree = i < 3;
                  const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
                  const rankColor = isTopThree ? rankColors[i] : 'rgba(255,255,255,0.3)';
                  const rankIcons = ['🥇', '🥈', '🥉'];
                  return (
                    <div key={l.rank} style={{
                      display: 'flex', alignItems: 'center', padding: '10px 14px', borderRadius: 12,
                      background: isTopThree ? ts.bg : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isTopThree ? ts.border : 'rgba(255,255,255,0.04)'}`,
                    }}>
                      <div style={{ width: 28, fontSize: isTopThree ? 16 : 12, fontWeight: 800, color: rankColor, textAlign: 'center' }}>
                        {isTopThree ? rankIcons[i] : `#${l.rank}`}
                      </div>
                      <span style={{ fontSize: 14, marginRight: 6 }}>{l.tier_icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'white', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {l.node}
                          {l.online && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#34d399', marginLeft: 6 }} />}
                        </div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>
                          {l.uptime_hours}h {t('nodes_uptime')} · {l.streak_days}d {t('nodes_streak')} · {l.tasks_completed} {t('nodes_tasks')}
                        </div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: ts.text }}>{l.earned_gstd.toFixed(2)} <span style={{ fontSize: 9 }}>GSTD</span></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* CTA — Two options */}
          <div style={{
            textAlign: 'center', padding: '40px 24px', borderRadius: 20, marginBottom: 48,
            background: 'linear-gradient(135deg, rgba(139,92,246,0.06), rgba(16,185,129,0.04))',
            border: '1px solid rgba(139,92,246,0.1)',
          }}>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: 'white', marginBottom: 8 }}>{t('nodes_ready_title')}</h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>
              {t('nodes_ready_desc')}
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'stretch', flexWrap: 'wrap', marginBottom: 20 }}>
              {/* Mobile Node — Telegram */}
              <a href="https://t.me/GstdAppBot" target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  padding: '20px 24px', borderRadius: 14, textDecoration: 'none',
                  background: 'rgba(0,136,204,0.08)', border: '1px solid rgba(0,136,204,0.2)',
                  flex: '1 1 220px', maxWidth: '100%', transition: 'all 0.3s',
                }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #0088cc, #0066aa)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Smartphone size={20} style={{ color: 'white' }} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#5bbfe0' }}>{t('nodes_mobile_card')}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', whiteSpace: 'pre-line' }}>
                  {t('nodes_mobile_card_desc')}
                </div>
              </a>

              {/* Desktop Node */}
              <a href="https://gstdbot.gstdtoken.com" target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  padding: '20px 24px', borderRadius: 14, textDecoration: 'none',
                  background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)',
                  flex: '1 1 220px', maxWidth: '100%', transition: 'all 0.3s',
                }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Server size={20} style={{ color: 'white' }} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#a78bfa' }}>{t('nodes_desktop_card')}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', whiteSpace: 'pre-line' }}>
                  {t('nodes_desktop_card_desc')}
                </div>
              </a>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 16px', borderRadius: 10, fontFamily: 'monospace', fontSize: 13, color: '#a78bfa', marginBottom: 8 }}>
              curl -fsSL https://gstdbot.gstdtoken.com/install.sh | bash
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{t('nodes_install_hint')}</div>
          </div>

        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      ` }} />
    </>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: { ...(await serverSideTranslations(locale ?? 'en', ['common'])) },
});
