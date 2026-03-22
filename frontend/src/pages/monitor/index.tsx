import { useTranslation } from 'next-i18next';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Head from 'next/head';
import {
    Zap, CheckCircle, Clock, ShieldCheck, RefreshCw,
    Eye, Brain, Sparkles, Target, Lock, Users, Activity, Play,
    TrendingUp, ChevronRight, ArrowUpRight, Cpu, BarChart3
} from 'lucide-react';
import { toast } from '../../lib/toast';
import { apiGet, apiPost } from '../../lib/apiClient';
import { useWalletStore } from '../../store/walletStore';
import { useTonConnectUI, TonConnectButton } from '@tonconnect/ui-react';
import dynamic from 'next/dynamic';

const PriceChart = dynamic(() => import('../../components/charts/PriceChart'), {
    ssr: false,
    loading: () => <div className="h-[300px] w-full rounded-2xl bg-white/[0.02] border border-white/[0.06] animate-pulse flex items-center justify-center text-gray-500">Loading Chart Engine...</div>
});

interface CatalogEntry {
    id: string;
    category: string;
    title: string;
    description: string;
    icon: string;
    price_gstd: number;
    agent_count: number;
    duration_rounds: number;
    features: string[];
}

interface Simulation {
    id: string;
    category: string;
    scenario: string;
    agent_count: number;
    price_gstd: number;
    status: string;
    result_summary: string;
    confidence: number;
    compute_ms: number;
    predictions_count: number;
    created_at: string;
    completed_at: string;
}

interface SimResult {
    id: string;
    category: string;
    status: string;
    result_report: string;
    result_summary: string;
    confidence: number;
    compute_ms: number;
    predictions_count: number;
    agent_count: number;
    price_gstd: number;
    created_at: string;
    completed_at?: string;
}

interface SimStats {
    total_simulations: number;
    completed_simulations: number;
    active_simulations: number;
    total_revenue_gstd: number;
    unique_users: number;
    recent_simulations: Array<{
        id: string;
        category: string;
        status: string;
        confidence: number;
        predictions_count: number;
        created_at: string;
    }>;
}

const CAT_ICONS: Record<string, string> = {
    crypto: '₿', forex: '💱', polymarket: '🗳️',
    'tech-trends': '📡', custom: '🧪', energy: '⚡',
    commodities: '🥇', 'real-estate': '🏠',
};

const CAT_COLORS: Record<string, { primary: string; glow: string }> = {
    crypto: { primary: '#f7931a', glow: 'rgba(247,147,26,0.15)' },
    forex: { primary: '#00cc88', glow: 'rgba(0,204,136,0.15)' },
    polymarket: { primary: '#8b5cf6', glow: 'rgba(139,92,246,0.15)' },
    'tech-trends': { primary: '#00aaff', glow: 'rgba(0,170,255,0.15)' },
    custom: { primary: '#ff66aa', glow: 'rgba(255,102,170,0.15)' },
    energy: { primary: '#f59e0b', glow: 'rgba(245,158,11,0.15)' },
};

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

export default function SwarmSimulations() {
    const { t } = useTranslation('common');
    const { address, gstdBalance } = useWalletStore();
    const [tonConnectUI] = useTonConnectUI();

    const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
    const [mySimulations, setMySimulations] = useState<Simulation[]>([]);
    const [stats, setStats] = useState<SimStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [launching, setLaunching] = useState<string | null>(null);
    const [selectedSim, setSelectedSim] = useState<SimResult | null>(null);
    const [customScenario, setCustomScenario] = useState('');
    const [customSeed, setCustomSeed] = useState('');
    const [showCustomModal, setShowCustomModal] = useState(false);
    const [showMySimulations, setShowMySimulations] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [catRes, statsRes] = await Promise.allSettled([
                apiGet('/api/v1/simulations/catalog'),
                apiGet('/api/v1/simulations/stats'),
            ]);
            if (catRes.status === 'fulfilled') setCatalog(catRes.value?.catalog || []);
            if (statsRes.status === 'fulfilled') setStats(statsRes.value || null);

            if (address) {
                const myRes = await apiGet('/api/v1/simulations/my');
                setMySimulations(myRes?.simulations || []);
            }
        } finally {
            setLoading(false);
        }
    }, [address]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Auto-refresh
    useEffect(() => {
        const hasActive = mySimulations.some(s => s.status === 'processing');
        if (!hasActive) return;
        const interval = setInterval(async () => {
            if (address) {
                const myRes = await apiGet('/api/v1/simulations/my');
                setMySimulations(myRes?.simulations || []);
            }
        }, 8000);
        return () => clearInterval(interval);
    }, [mySimulations, address]);

    const launchSimulation = async (category: string, scenario?: string, seedData?: string) => {
        if (!address) {
            toast.error('Connect wallet to launch simulations');
            tonConnectUI.openModal();
            return;
        }
        const price = catalog.find(c => c.id === category)?.price_gstd || 0;
        setLaunching(category);
        try {
            const res = await apiPost('/api/v1/simulations/launch', {
                category,
                scenario: scenario || '',
                seed_data: seedData || '',
            });
            if (res?.simulation_id) {
                toast.success(`⚡ Simulation launched! Processing with ${res.agent_count || 200} AI agents…`);
                setShowMySimulations(true);
                setShowCustomModal(false);
                fetchData();
            }
        } catch (e: any) {
            const msg = e?.data?.error || e?.message || 'Launch failed';
            if (msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('balance') || e?.status === 402) {
                const serverBalance = e?.data?.balance ?? (gstdBalance || 0);
                toast.error(`Need ${price} GSTD. Balance: ${Number(serverBalance).toFixed(2)}`);
            } else {
                toast.error(msg);
            }
        } finally {
            setLaunching(null);
        }
    };

    const viewResult = async (simId: string) => {
        try {
            const res = await apiGet(`/api/v1/simulations/results/${simId}`);
            if (res) setSelectedSim(res);
        } catch {
            toast.error('Failed to load result');
        }
    };

    const activeCount = mySimulations.filter(s => s.status === 'processing').length;
    const completedCount = mySimulations.filter(s => s.status === 'completed').length;

    return (
        <>
            <Head>
                <title>Swarm Simulations — AI Market Analysis | GSTD</title>
                <meta name="description" content="Launch paid AI simulations powered by 200+ agents. Predict crypto, forex, polymarket events with GSTD tokens." />
            </Head>

            <div className="min-h-screen bg-[#030014] text-white">
                {/* Ambient */}
                <div className="fixed inset-0 pointer-events-none z-0">
                    <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-orange-500/[0.03] rounded-full blur-[150px]" />
                    <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-violet-500/[0.03] rounded-full blur-[120px]" />
                </div>

                <div className="relative z-10 max-w-7xl mx-auto px-4 pt-20 pb-24">

                    {/* ─── HERO ─── */}
                    <div className="text-center mb-10">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-4">
                            <Cpu size={12} />
                            SWARM ENGINE — 200+ AI Agents per Simulation
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black mb-3 tracking-tight">
                            <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-violet-400 bg-clip-text text-transparent">AI Simulations</span>
                        </h1>
                        <p className="text-gray-400 max-w-xl mx-auto text-base leading-relaxed">
                            Launch powerful market simulations with real-time data feeds.
                            200+ AI agents analyze, debate, and generate actionable predictions.
                        </p>
                    </div>

                    {/* ─── GSTD PRICE CHART ─── */}
                    <div className="mb-8">
                        <PriceChart height={300} title="GSTD Global Value" />
                    </div>

                    {/* ─── STATS ─── */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
                        {[
                            { icon: <Activity size={14} />, label: 'Simulations', value: stats?.total_simulations || 0, color: 'text-orange-400' },
                            { icon: <Zap size={14} />, label: 'Active', value: stats?.active_simulations || 0, color: 'text-blue-400' },
                            { icon: <CheckCircle size={14} />, label: 'Completed', value: stats?.completed_simulations || 0, color: 'text-emerald-400' },
                            { icon: <Users size={14} />, label: 'Users', value: stats?.unique_users || 0, color: 'text-violet-400' },
                            { icon: <TrendingUp size={14} />, label: 'Revenue', value: `${(stats?.total_revenue_gstd || 0).toFixed(0)} G`, color: 'text-amber-400' },
                        ].map(s => (
                            <div key={s.label} className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 text-center backdrop-blur-xl">
                                <div className={`flex items-center justify-center gap-1.5 ${s.color} mb-1.5`}>
                                    {s.icon}
                                    <span className="text-[9px] font-bold uppercase tracking-widest">{s.label}</span>
                                </div>
                                <div className="text-xl font-black text-white">{s.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* ─── WALLET + CONTROLS ─── */}
                    <div className="flex flex-col sm:flex-row gap-3 mb-8">
                        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex-1">
                            <ShieldCheck size={16} className="text-orange-400 shrink-0" />
                            {address ? (
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="font-mono text-orange-400 font-bold">{address.slice(0, 6)}...{address.slice(-4)}</span>
                                    <span className="px-2 py-0.5 rounded-lg bg-orange-400/10 text-[11px] font-bold text-orange-400">
                                        {(gstdBalance ?? 0).toFixed(2)} GSTD
                                    </span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <span className="text-sm text-gray-500">Connect wallet to launch simulations</span>
                                    <TonConnectButton />
                                </div>
                            )}
                        </div>
                        {address && mySimulations.length > 0 && (
                            <button
                                onClick={() => setShowMySimulations(!showMySimulations)}
                                className={`px-4 py-3 rounded-2xl border text-sm font-bold transition-all shrink-0 flex items-center gap-2 ${
                                    showMySimulations
                                        ? 'bg-violet-500/15 border-violet-500/30 text-violet-400'
                                        : 'bg-white/[0.03] border-white/[0.06] text-gray-400 hover:text-white'
                                }`}
                            >
                                <Eye size={14} />
                                My Sims ({mySimulations.length})
                                {activeCount > 0 && (
                                    <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-[10px] font-bold text-blue-400 animate-pulse">
                                        {activeCount} active
                                    </span>
                                )}
                            </button>
                        )}
                        <button onClick={fetchData} className="px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-gray-400 hover:text-white transition-all shrink-0" title="Refresh data">
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    {/* ─── MY SIMULATIONS (expandable) ─── */}
                    {showMySimulations && mySimulations.length > 0 && (
                        <div className="mb-8 space-y-3">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2 mb-3">
                                <Sparkles size={14} className="text-violet-400" /> Your Simulations
                            </h3>
                            {mySimulations.map(sim => {
                                const cc = CAT_COLORS[sim.category] || CAT_COLORS.custom;
                                const isActive = sim.status === 'processing';
                                const isDone = sim.status === 'completed';
                                return (
                                    <div
                                        key={sim.id}
                                        onClick={() => isDone ? viewResult(sim.id) : undefined}
                                        className={`rounded-2xl border p-5 transition-all ${
                                            isActive
                                                ? 'bg-blue-500/[0.04] border-blue-500/15 animate-pulse'
                                                : isDone
                                                ? 'bg-emerald-500/[0.03] border-emerald-500/15 cursor-pointer hover:border-emerald-500/30'
                                                : 'bg-white/[0.02] border-white/[0.06]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="text-2xl">{CAT_ICONS[sim.category] || '🧪'}</span>
                                                <div>
                                                    <h4 className="text-sm font-bold text-white">
                                                        {sim.category.charAt(0).toUpperCase() + sim.category.slice(1)} Simulation
                                                    </h4>
                                                    <span className="text-[11px] text-gray-500">{timeAgo(sim.created_at)} • {sim.agent_count} agents • {sim.price_gstd} GSTD</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {isActive && (
                                                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-500/15 text-[11px] font-bold text-blue-400">
                                                        <RefreshCw size={11} className="animate-spin" /> Processing…
                                                    </span>
                                                )}
                                                {isDone && (
                                                    <>
                                                        {sim.confidence > 0 && (
                                                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-[10px] font-bold text-emerald-400">
                                                                {(sim.confidence * 100).toFixed(0)}% conf
                                                            </span>
                                                        )}
                                                        <span className="flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-500/15 text-[11px] font-bold text-emerald-400">
                                                            <Eye size={11} /> View Report
                                                        </span>
                                                    </>
                                                )}
                                                {sim.status === 'failed' && (
                                                    <span className="px-3 py-1 rounded-lg bg-red-500/15 text-[11px] font-bold text-red-400">
                                                        Failed
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {isDone && sim.result_summary && (
                                            <p className="text-xs text-gray-400 mt-3 leading-relaxed line-clamp-2">
                                                {sim.result_summary}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ─── LOADING ─── */}
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-20">
                            <Brain size={40} className="text-orange-500/50 mb-4 animate-pulse" />
                            <p className="text-gray-500 text-sm font-bold uppercase tracking-widest">Loading simulations…</p>
                        </div>
                    )}

                    {/* ─── SIMULATION CATALOG ─── */}
                    {!loading && (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {catalog.map(entry => {
                                const cc = CAT_COLORS[entry.category] || CAT_COLORS.custom;
                                return (
                                    <div
                                        key={entry.id}
                                        className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden hover:border-opacity-50 transition-all hover:scale-[1.01] hover:shadow-xl"
                                        style={{ borderColor: `${cc.primary}22` }}
                                    >
                                        {/* Top gradient accent */}
                                        <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${cc.primary}, ${cc.primary}88)` }} />

                                        <div className="p-6">
                                            {/* Price badge */}
                                            <div className="flex items-start justify-between mb-4">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-3xl">{entry.icon}</span>
                                                    <div>
                                                        <h3 className="text-base font-bold text-white group-hover:text-orange-100 transition-colors">{entry.title}</h3>
                                                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{entry.category}</span>
                                                    </div>
                                                </div>
                                                <span
                                                    className="px-2.5 py-1 rounded-lg text-xs font-black text-white shrink-0"
                                                    style={{ background: `linear-gradient(135deg, ${cc.primary}, ${cc.primary}cc)` }}
                                                >
                                                    {entry.price_gstd} GSTD
                                                </span>
                                            </div>

                                            <p className="text-xs text-gray-400 leading-relaxed mb-4 line-clamp-3">
                                                {entry.description}
                                            </p>

                                            {/* Features */}
                                            <div className="flex flex-wrap gap-1.5 mb-4">
                                                {entry.features.slice(0, 4).map(f => (
                                                    <span key={f} className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] text-gray-400 font-medium">
                                                        ✓ {f}
                                                    </span>
                                                ))}
                                            </div>

                                            {/* Agent + Duration */}
                                            <div className="flex items-center gap-4 mb-4 text-[11px] text-gray-500">
                                                <span className="flex items-center gap-1">
                                                    <Users size={11} /> {entry.agent_count} agents
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock size={11} /> {entry.duration_rounds} rounds
                                                </span>
                                            </div>

                                            {/* Launch Button */}
                                            <button
                                                onClick={() => {
                                                    if (entry.id === 'custom') setShowCustomModal(true);
                                                    else launchSimulation(entry.id);
                                                }}
                                                disabled={launching === entry.id}
                                                className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 hover:brightness-110"
                                                style={{
                                                    background: launching === entry.id
                                                        ? 'rgba(255,255,255,0.1)'
                                                        : `linear-gradient(135deg, ${cc.primary}, ${cc.primary}bb)`,
                                                }}
                                            >
                                                {launching === entry.id ? (
                                                    <><RefreshCw size={14} className="animate-spin" /> Launching…</>
                                                ) : (
                                                    <><Play size={14} /> Launch — {entry.price_gstd} GSTD</>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Empty catalog */}
                    {!loading && catalog.length === 0 && (
                        <div className="text-center py-20">
                            <Brain size={48} className="text-gray-700 mx-auto mb-4" />
                            <h3 className="text-gray-500 font-bold mb-2">Simulation catalog loading…</h3>
                            <p className="text-gray-600 text-sm">The AI engine is preparing simulation models. Try refreshing.</p>
                        </div>
                    )}

                    {/* ─── LIVE FEED ─── */}
                    {!loading && stats?.recent_simulations && stats.recent_simulations.length > 0 && (
                        <div className="mt-12">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2 mb-4">
                                <Activity size={14} className="text-blue-400" /> Recent Platform Simulations
                            </h3>
                            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] divide-y divide-white/[0.04]">
                                {stats.recent_simulations.slice(0, 8).map(sim => (
                                    <div key={sim.id} className="flex items-center justify-between px-5 py-3.5">
                                        <div className="flex items-center gap-3">
                                            <span className="text-lg">{CAT_ICONS[sim.category] || '🧪'}</span>
                                            <div>
                                                <span className="text-sm font-bold text-white">
                                                    {sim.category.charAt(0).toUpperCase() + sim.category.slice(1)}
                                                </span>
                                                <span className="text-[11px] text-gray-500 ml-2">{timeAgo(sim.created_at)}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {sim.confidence > 0 && (
                                                <span className="text-[11px] font-bold text-emerald-400">{(sim.confidence * 100).toFixed(0)}%</span>
                                            )}
                                            {sim.predictions_count > 0 && (
                                                <span className="text-[11px] text-gray-500">{sim.predictions_count} pred</span>
                                            )}
                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                                sim.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400' :
                                                sim.status === 'processing' ? 'bg-blue-500/15 text-blue-400' :
                                                'bg-red-500/15 text-red-400'
                                            }`}>
                                                {sim.status === 'completed' ? '✓' : sim.status === 'processing' ? '⏳' : '✗'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ─── HOW IT WORKS ─── */}
                    {!loading && (
                        <div className="mt-16">
                            <h2 className="text-center text-xs font-bold text-gray-500 uppercase tracking-widest mb-8 flex items-center justify-center gap-2">
                                <Zap size={14} className="text-orange-400" /> How Swarm Simulations Work
                            </h2>
                            <div className="grid md:grid-cols-4 gap-4">
                                {[
                                    { icon: '💰', title: 'Pay with GSTD', desc: 'Choose a simulation type. Funds split: 50% Gold Reserve, 20% Node Rewards, 30% Platform.', color: 'from-orange-500/10 to-orange-500/5' },
                                    { icon: '🧠', title: 'Swarm Processing', desc: '200+ AI agents with unique personas simulate, debate, and predict outcomes using real market data.', color: 'from-violet-500/10 to-violet-500/5' },
                                    { icon: '📊', title: 'Live Tracking', desc: 'Track simulation progress. Results include confidence levels, predictions, and emergent patterns.', color: 'from-blue-500/10 to-blue-500/5' },
                                    { icon: '📑', title: 'Full Report', desc: 'Complete report with actionable signals, risk assessment, and AI consensus analysis.', color: 'from-emerald-500/10 to-emerald-500/5' },
                                ].map(step => (
                                    <div key={step.title} className={`rounded-2xl bg-gradient-to-b ${step.color} border border-white/[0.06] p-5 text-center`}>
                                        <div className="text-3xl mb-3">{step.icon}</div>
                                        <h4 className="text-sm font-bold text-white mb-2">{step.title}</h4>
                                        <p className="text-xs text-gray-400 leading-relaxed">{step.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ─── CUSTOM SIMULATION MODAL ─── */}
                {showCustomModal && (
                    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCustomModal(false)}>
                        <div onClick={e => e.stopPropagation()} className="bg-[#0d1525] border border-white/10 rounded-3xl max-w-lg w-full shadow-2xl p-6">
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="text-lg font-black text-white flex items-center gap-2">🧪 Custom Simulation</h3>
                                <button onClick={() => setShowCustomModal(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all">✕</button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">Scenario Description</label>
                                    <textarea
                                        value={customScenario}
                                        onChange={e => setCustomScenario(e.target.value)}
                                        placeholder="Describe what you want the AI swarm to simulate and predict…"
                                        rows={4}
                                        className="w-full p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-gray-600 outline-none focus:border-orange-500/30 resize-none transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">Seed Data (optional)</label>
                                    <textarea
                                        value={customSeed}
                                        onChange={e => setCustomSeed(e.target.value)}
                                        placeholder="Paste news articles, reports, or data for context…"
                                        rows={3}
                                        className="w-full p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-gray-600 outline-none focus:border-orange-500/30 resize-none transition-colors"
                                    />
                                </div>

                                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-orange-500/[0.06] border border-orange-500/15">
                                    <span className="text-sm text-gray-400">Simulation Price</span>
                                    <span className="text-lg font-black text-orange-400">30 GSTD</span>
                                </div>

                                <button
                                    onClick={() => launchSimulation('custom', customScenario, customSeed)}
                                    disabled={launching === 'custom' || !customScenario.trim()}
                                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-pink-500 to-violet-500 text-white font-bold text-sm flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {launching === 'custom' ? (
                                        <><RefreshCw size={14} className="animate-spin" /> Launching…</>
                                    ) : (
                                        <><Play size={14} /> Launch Custom Simulation</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ─── RESULT MODAL ─── */}
                {selectedSim && (
                    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedSim(null)}>
                        <div onClick={e => e.stopPropagation()} className="bg-[#0d1525] border border-white/10 rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl">
                            {/* Header */}
                            <div className="sticky top-0 bg-[#0d1525]/95 backdrop-blur-sm px-6 pt-6 pb-4 border-b border-white/[0.06] z-10">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xl">{CAT_ICONS[selectedSim.category] || '🧪'}</span>
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{selectedSim.category}</span>
                                        </div>
                                        <h2 className="text-xl font-black text-white">Simulation Report</h2>
                                    </div>
                                    <button onClick={() => setSelectedSim(null)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all shrink-0">✕</button>
                                </div>
                            </div>

                            <div className="px-6 py-5 space-y-5">
                                {/* Metrics */}
                                <div className="grid grid-cols-4 gap-3">
                                    {[
                                        { label: 'Confidence', value: `${(selectedSim.confidence * 100).toFixed(0)}%`, color: 'text-emerald-400' },
                                        { label: 'Predictions', value: selectedSim.predictions_count, color: 'text-blue-400' },
                                        { label: 'Agents', value: selectedSim.agent_count, color: 'text-violet-400' },
                                        { label: 'Compute', value: `${(selectedSim.compute_ms / 1000).toFixed(1)}s`, color: 'text-gray-400' },
                                    ].map(m => (
                                        <div key={m.label} className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-3 text-center">
                                            <div className="text-[10px] font-bold text-gray-500 uppercase mb-1">{m.label}</div>
                                            <div className={`text-lg font-black ${m.color}`}>{m.value}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Report */}
                                <div className="rounded-2xl bg-emerald-500/[0.04] border border-emerald-500/15 p-5">
                                    <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                        <Eye size={12} /> Full Simulation Report
                                    </h4>
                                    <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                                        {selectedSim.result_report || 'Report generating…'}
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="flex items-center justify-between py-3 border-t border-white/[0.05] text-[11px] text-gray-500">
                                    <span>Created {new Date(selectedSim.created_at).toLocaleString()}</span>
                                    {selectedSim.completed_at && <span>Completed {new Date(selectedSim.completed_at).toLocaleString()}</span>}
                                </div>

                                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-orange-500/[0.06] border border-orange-500/15 text-sm">
                                    <span className="text-gray-400">Cost</span>
                                    <span className="font-bold text-orange-400">{selectedSim.price_gstd} GSTD</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
    props: {
        ...(await serverSideTranslations(locale || 'en', ['common'])),
    },
});
