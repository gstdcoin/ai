import { useTranslation } from 'next-i18next';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Head from 'next/head';
import {
    Brain, Lock, Unlock, Eye,
    Users, RefreshCw, ShieldCheck,
    Activity, Sparkles, Target, Clock, Crown,
    TrendingUp, Zap, Filter, ChevronRight, ArrowUpRight, Shield
} from 'lucide-react';
import { toast } from '../../lib/toast';
import { apiGet, apiPost } from '../../lib/apiClient';
import { useWalletStore } from '../../store/walletStore';
import { useTonConnectUI, TonConnectButton } from '@tonconnect/ui-react';
import { buildSignalPurchaseTx } from '../../lib/jettonTransfer';
import { getCommonStaticProps } from '../../lib/i18n-static-props';

interface Signal {
    id: string;
    category: string;
    title: string;
    summary: string;
    full_report?: string;
    confidence: number;
    impact: string;
    time_horizon: string;
    price_gstd: number;
    is_premium: boolean;
    agent_name: string;
    agent_score: number;
    accuracy: number;
    buyers: number;
    created_at: string;
    expires_at: string;
    status: string;
}

interface NetworkStats {
    total_signals: number;
    premium_signals: number;
    total_buyers: number;
    total_revenue_gstd: number;
    network_accuracy: number;
    agents_active: number;
    learning_epochs: number;
    verified_correct: number;
    verified_wrong: number;
}

// Clean up JSON-contaminated summaries
function cleanSummary(text: string): string {
    if (!text) return '';
    // If summary starts with { try to extract meaningful text
    if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        try {
            const parsed = JSON.parse(text);
            if (parsed.predictions && Array.isArray(parsed.predictions)) {
                return parsed.predictions
                    .map((p: any) => `${p.description} (${Math.round((p.probability || 0.5) * 100)}% probability)`)
                    .join('. ');
            }
            if (parsed.report) return parsed.report;
            if (parsed.summary) return parsed.summary;
        } catch {
            // Try to extract description fields from malformed JSON
            const descriptions = text.match(/"description"\s*:\s*"([^"]+)"/g);
            if (descriptions && descriptions.length > 0) {
                return descriptions
                    .map(d => d.replace(/"description"\s*:\s*"/, '').replace(/"$/, ''))
                    .slice(0, 3)
                    .join('. ') + '.';
            }
        }
    }
    // Truncate if too long
    return text.length > 280 ? text.slice(0, 280) + '…' : text;
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function timeLeft(dateStr: string): string {
    const diff = new Date(dateStr).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return `${hours}h left`;
    const days = Math.floor(hours / 24);
    return `${days}d left`;
}

const CATEGORIES = [
    { id: 'all', label: 'All Signals', icon: '🔮' },
    { id: 'crypto', label: 'Crypto', icon: '₿' },
    { id: 'polymarket', label: 'Polymarket', icon: '🗳️' },
    { id: 'forex', label: 'Forex', icon: '💱' },
    { id: 'commodities', label: 'Commodities', icon: '🥇' },
    { id: 'tech-trends', label: 'Tech', icon: '📡' },
    { id: 'energy', label: 'Energy', icon: '⚡' },
    { id: 'real-estate', label: 'Real Estate', icon: '🏠' },
];

const IMPACT_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
    critical: { color: '#ff4466', bg: 'rgba(255,68,102,0.12)', label: '🔴 CRITICAL' },
    high: { color: '#ff8844', bg: 'rgba(255,136,68,0.12)', label: '🟠 HIGH' },
    medium: { color: '#00cc88', bg: 'rgba(0,204,136,0.12)', label: '🟢 MEDIUM' },
    low: { color: '#6688aa', bg: 'rgba(102,136,170,0.12)', label: '🔵 LOW' },
};

export default function PredictionsPage() {
    const { t } = useTranslation('common');
    const [tonConnectUI] = useTonConnectUI();
    const { address, gstdBalance } = useWalletStore();

    const [signals, setSignals] = useState<Signal[]>([]);
    const [mySignals, setMySignals] = useState<Signal[]>([]);
    const [stats, setStats] = useState<NetworkStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [buying, setBuying] = useState<string | null>(null);
    const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
    const [activeCategory, setActiveCategory] = useState('all');
    const [showMyOnly, setShowMyOnly] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [sigRes, statsRes] = await Promise.allSettled([
                apiGet('/api/v1/signals/public'),
                apiGet('/api/v1/signals/stats'),
            ]);
            if (sigRes.status === 'fulfilled') setSignals(sigRes.value?.signals || []);
            if (statsRes.status === 'fulfilled') setStats(statsRes.value || null);

            if (address) {
                const [premRes, myRes] = await Promise.allSettled([
                    apiGet('/api/v1/signals/premium'),
                    apiGet('/api/v1/signals/my'),
                ]);
                // Merge premium into signals (deduplicate by id)
                if (premRes.status === 'fulfilled') {
                    const prem = premRes.value?.signals || [];
                    setSignals(prev => {
                        const ids = new Set(prev.map(s => s.id));
                        return [...prev, ...prem.filter((s: Signal) => !ids.has(s.id))];
                    });
                }
                if (myRes.status === 'fulfilled') setMySignals(myRes.value?.signals || []);
            }
        } finally {
            setLoading(false);
        }
    }, [address]);

    useEffect(() => { loadData(); }, [loadData]);

    // Auto-refresh every 2 min
    useEffect(() => {
        const iv = setInterval(loadData, 120000);
        return () => clearInterval(iv);
    }, [loadData]);

    const buySignal = async (signal: Signal) => {
        if (!address) {
            toast.error('Connect wallet to buy signals');
            tonConnectUI.openModal();
            return;
        }
        setBuying(signal.id);
        try {
            // Step 1: Build real GSTD jetton transfer to treasury
            toast.loading('Building on-chain payment...', { id: 'buy-signal' });
            const tx = await buildSignalPurchaseTx(address, signal.id, signal.price_gstd);

            // Step 2: Sign & send via TonConnect (Tonkeeper/MyTonWallet)
            toast.loading('Please confirm in your wallet...', { id: 'buy-signal' });
            const result = await tonConnectUI.sendTransaction(tx);
            const txHash = result.boc || '';

            // Step 3: Notify backend with tx hash to unlock the signal
            toast.loading('Verifying payment on-chain...', { id: 'buy-signal' });
            const res = await apiPost(`/api/v1/signals/buy/${signal.id}`, { tx_hash: txHash });

            if (res?.full_report) {
                setSelectedSignal({ ...signal, full_report: res.full_report });
                toast.success(`✅ Signal unlocked on-chain for ${signal.price_gstd} GSTD!`, { id: 'buy-signal' });
                loadData();
            } else {
                toast.success(res?.message || '✅ Purchase confirmed on-chain!', { id: 'buy-signal' });
                loadData();
            }
        } catch (e: any) {
            const msg = e?.data?.error || e?.message || 'Purchase failed';
            if (msg.includes('User rejected') || msg.includes('Cancelled')) {
                toast.error('Transaction cancelled', { id: 'buy-signal' });
            } else if (msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('balance') || e?.status === 402) {
                const serverBalance = e?.data?.balance ?? (gstdBalance || 0);
                toast.error(`Need ${signal.price_gstd} GSTD. Balance: ${Number(serverBalance).toFixed(2)}`, { id: 'buy-signal' });
            } else {
                toast.error(msg, { id: 'buy-signal' });
            }
        } finally {
            setBuying(null);
        }
    };

    const filteredSignals = useMemo(() => {
        let list = showMyOnly ? mySignals : signals;
        if (activeCategory !== 'all') {
            list = list.filter(s => s.category === activeCategory);
        }
        // Sort: premium first, then by confidence desc
        return list.sort((a, b) => {
            if (a.is_premium !== b.is_premium) return a.is_premium ? -1 : 1;
            return b.confidence - a.confidence;
        });
    }, [signals, mySignals, activeCategory, showMyOnly]);

    const featuredSignal = useMemo(() => {
        const premium = signals.filter(s => s.is_premium && s.price_gstd > 0);
        return premium.sort((a, b) => b.confidence - a.confidence)[0] || null;
    }, [signals]);

    const ownedIds = useMemo(() => new Set(mySignals.map(s => s.id)), [mySignals]);

    return (
        <>
            <Head>
                <title>AI Signals — GSTD Prediction Marketplace</title>
                <meta name="description" content="Premium AI prediction signals powered by swarm intelligence. Buy actionable market forecasts with GSTD tokens." />
            </Head>

            <div className="min-h-screen bg-[#030014] text-white">
                {/* Ambient glow */}
                <div className="fixed inset-0 pointer-events-none z-0">
                    <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/[0.03] rounded-full blur-[120px]" />
                    <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-500/[0.03] rounded-full blur-[120px]" />
                </div>

                <div className="relative z-10 max-w-7xl mx-auto px-4 pt-20 pb-24">

                    {/* ─── HERO HEADER ─── */}
                    <div className="text-center mb-10 fu d1">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-4">
                            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"/><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"/></span>
                            LIVE — {stats?.agents_active || 7} AI Agents Active
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black mb-3 tracking-tight">
                            <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">AI Prediction Signals</span>
                        </h1>
                        <p className="text-gray-400 max-w-xl mx-auto text-base leading-relaxed">
                            Real-time market intelligence from our swarm AI network.
                            Premium signals unlock full reports with actionable trade recommendations.
                        </p>
                    </div>

                    {/* ─── STATS GRID ─── */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8 fu d2">
                        {[
                            { icon: <Activity size={16} />, label: 'Total Signals', value: stats?.total_signals || signals.length, color: 'text-emerald-400' },
                            { icon: <Crown size={16} />, label: 'Premium', value: stats?.premium_signals || signals.filter(s => s.is_premium).length, color: 'text-amber-400' },
                            { icon: <Users size={16} />, label: 'AI Agents', value: stats?.agents_active || 7, color: 'text-cyan-400' },
                            { icon: <Sparkles size={16} />, label: 'Learning Epochs', value: stats?.learning_epochs || 0, color: 'text-violet-400' },
                        ].map(s => (
                            <div key={s.label} className="sov-card !p-4 text-center">
                                <div className={`flex items-center justify-center gap-1.5 ${s.color} mb-2`}>
                                    {s.icon}
                                    <span className="text-[10px] font-bold uppercase tracking-widest">{s.label}</span>
                                </div>
                                <div className="text-2xl font-black text-white">{s.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* ─── WALLET + FILTER BAR ─── */}
                    <div className="flex flex-col sm:flex-row gap-3 mb-6 fu d3">
                        {/* Wallet */}
                        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex-1">
                            <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
                            {address ? (
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="font-mono text-emerald-400 font-bold">{address.slice(0, 6)}...{address.slice(-4)}</span>
                                    <span className="px-2 py-0.5 rounded-lg bg-emerald-400/10 text-[11px] font-bold text-emerald-400">
                                        {(gstdBalance ?? 0).toFixed(2)} GSTD
                                    </span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <span className="text-sm text-gray-500">Connect wallet to buy signals</span>
                                    <TonConnectButton />
                                </div>
                            )}
                        </div>
                        {/* My Signals toggle */}
                        {address && mySignals.length > 0 && (
                            <button
                                onClick={() => setShowMyOnly(!showMyOnly)}
                                className={`px-4 py-3 rounded-2xl border text-sm font-bold transition-all shrink-0 ${
                                    showMyOnly
                                        ? 'bg-violet-500/15 border-violet-500/30 text-violet-400'
                                        : 'bg-white/[0.03] border-white/[0.06] text-gray-400 hover:text-white'
                                }`}
                            >
                                <Eye size={14} className="inline mr-1.5" />
                                My Signals ({mySignals.length})
                            </button>
                        )}
                        <button onClick={loadData} className="px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-gray-400 hover:text-white transition-all shrink-0" title="Refresh">
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    {/* ─── CATEGORY FILTERS ─── */}
                    <div className="flex gap-2 mb-8 overflow-x-auto pb-2 -mx-4 px-4 fu d4" style={{ scrollbarWidth: 'none' }}>
                        {CATEGORIES.map(cat => {
                            const count = cat.id === 'all' ? signals.length : signals.filter(s => s.category === cat.id).length;
                            if (cat.id !== 'all' && count === 0) return null;
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => { setActiveCategory(cat.id); setShowMyOnly(false); }}
                                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                                        activeCategory === cat.id
                                            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.1)]'
                                            : 'bg-white/[0.02] border-white/[0.06] text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
                                    }`}
                                >
                                    <span>{cat.icon}</span>
                                    {cat.label}
                                    {count > 0 && <span className="ml-1 opacity-60">{count}</span>}
                                </button>
                            );
                        })}
                    </div>

                    {/* ─── FEATURED SIGNAL (Hero Card) ─── */}
                    {!loading && !showMyOnly && activeCategory === 'all' && featuredSignal && (
                        <div
                            className="mb-8 relative rounded-3xl overflow-hidden cursor-pointer group fu d5"
                            onClick={() => setSelectedSignal(featuredSignal)}
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-violet-500/5 to-emerald-500/10 group-hover:from-amber-500/15 group-hover:to-emerald-500/15 transition-all" />
                            <div className="absolute inset-0 border border-amber-500/20 rounded-3xl" />
                            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-400/5 rounded-full blur-3xl" />

                            <div className="relative p-6 md:p-8">
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-[10px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1">
                                        <Crown size={11} /> Featured Signal
                                    </span>
                                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-[10px] font-bold text-emerald-400">
                                        {Math.round(featuredSignal.confidence * 100)}% confidence
                                    </span>
                                    <span className="ml-auto text-xs text-gray-500">{timeAgo(featuredSignal.created_at)}</span>
                                </div>

                                <h2 className="text-xl md:text-2xl font-black text-white mb-3 group-hover:text-amber-100 transition-colors">
                                    {featuredSignal.title}
                                </h2>
                                <p className="text-gray-400 text-sm leading-relaxed mb-6 max-w-2xl">
                                    {cleanSummary(featuredSignal.summary)}
                                </p>

                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="text-sm font-bold text-amber-400">
                                        {featuredSignal.agent_name}
                                    </span>
                                    <span className="text-xs text-gray-500">•</span>
                                    <span className="text-xs text-gray-500 flex items-center gap-1">
                                        <Clock size={11} /> {featuredSignal.time_horizon} horizon
                                    </span>
                                    <span className="text-xs text-gray-500">•</span>
                                    <span className="text-xs text-gray-500 flex items-center gap-1">
                                        <Target size={11} /> {featuredSignal.accuracy?.toFixed(0)}% accuracy
                                    </span>
                                    <div className="ml-auto flex items-center gap-2">
                                        {ownedIds.has(featuredSignal.id) ? (
                                            <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-400 text-xs font-bold">
                                                ✅ Unlocked
                                            </span>
                                        ) : featuredSignal.price_gstd > 0 ? (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); buySignal(featuredSignal); }}
                                                disabled={buying === featuredSignal.id}
                                                className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-bold hover:from-amber-400 hover:to-orange-400 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
                                            >
                                                {buying === featuredSignal.id ? '...' : `Unlock — ${featuredSignal.price_gstd} GSTD`}
                                            </button>
                                        ) : (
                                            <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-400 text-xs font-bold">FREE</span>
                                        )}
                                        <ChevronRight size={16} className="text-gray-500 group-hover:text-white transition-colors" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── LOADING ─── */}
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-20">
                            <Brain size={40} className="text-emerald-500/50 mb-4 animate-pulse" />
                            <p className="text-gray-500 text-sm font-bold uppercase tracking-widest">Neural network processing…</p>
                        </div>
                    )}

                    {/* ─── SIGNAL GRID ─── */}
                    {!loading && (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {filteredSignals.map(signal => {
                                const impact = IMPACT_CONFIG[signal.impact] || IMPACT_CONFIG.medium;
                                const owned = ownedIds.has(signal.id);
                                const conf = Math.round(signal.confidence * 100);
                                const isFeatured = featuredSignal?.id === signal.id && activeCategory === 'all' && !showMyOnly;

                                if (isFeatured) return null; // Skip featured in grid

                                return (
                                    <div
                                        key={signal.id}
                                        onClick={() => setSelectedSignal(signal)}
                                        className={`group relative rounded-2xl border cursor-pointer transition-all hover:scale-[1.01] hover:shadow-lg ${
                                            signal.is_premium && !owned
                                                ? 'bg-gradient-to-br from-amber-500/[0.04] to-violet-500/[0.02] border-amber-500/15 hover:border-amber-500/30 hover:shadow-amber-500/5'
                                                : owned
                                                ? 'bg-gradient-to-br from-emerald-500/[0.04] to-cyan-500/[0.02] border-emerald-500/15 hover:border-emerald-500/30'
                                                : 'bg-white/[0.02] border-white/[0.06] hover:border-white/15 hover:bg-white/[0.04]'
                                        }`}
                                    >
                                        {/* Top bar */}
                                        <div className="flex items-center justify-between px-5 pt-4 pb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm">{CATEGORIES.find(c => c.id === signal.category)?.icon || '🔮'}</span>
                                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{signal.category}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {owned && <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-[10px] font-bold text-emerald-400">OWNED</span>}
                                                {signal.is_premium && !owned && (
                                                    <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-[10px] font-bold text-amber-400 flex items-center gap-1">
                                                        <Crown size={9} /> {signal.price_gstd} GSTD
                                                    </span>
                                                )}
                                                {!signal.is_premium && <span className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-bold text-gray-500">FREE</span>}
                                            </div>
                                        </div>

                                        {/* Content */}
                                        <div className="px-5 pb-4">
                                            <h3 className="text-base font-bold text-white mb-2 leading-snug group-hover:text-emerald-100 transition-colors">
                                                {signal.title}
                                            </h3>
                                            <p className="text-xs text-gray-400 leading-relaxed line-clamp-3 mb-4">
                                                {cleanSummary(signal.summary)}
                                            </p>

                                            {/* Metrics */}
                                            <div className="flex items-center gap-3 mb-3">
                                                {/* Confidence ring */}
                                                <div className="relative w-10 h-10 shrink-0">
                                                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                                                        <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                                                        <circle
                                                            cx="18" cy="18" r="14" fill="none"
                                                            stroke={conf >= 70 ? '#00cc88' : conf >= 50 ? '#ffaa00' : '#ff6644'}
                                                            strokeWidth="3"
                                                            strokeDasharray={`${conf * 0.88} ${88 - conf * 0.88}`}
                                                            strokeLinecap="round"
                                                        />
                                                    </svg>
                                                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white">{conf}%</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5 flex-1">
                                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ background: impact.bg, color: impact.color }}>
                                                        {signal.impact.toUpperCase()}
                                                    </span>
                                                    <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 text-[10px] font-bold text-cyan-400 flex items-center gap-0.5">
                                                        <Clock size={9} /> {signal.time_horizon}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Footer */}
                                            <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
                                                <div className="flex items-center gap-2 text-[11px] text-gray-500">
                                                    <span className="font-bold text-gray-400">{signal.agent_name}</span>
                                                    <span>•</span>
                                                    <span>{signal.accuracy?.toFixed(0)}% acc</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] text-gray-600">{timeAgo(signal.created_at)}</span>
                                                    {signal.is_premium && !owned && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); buySignal(signal); }}
                                                            disabled={buying === signal.id}
                                                            className="ml-2 px-3 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-[11px] font-bold text-white hover:from-amber-400 hover:to-orange-400 transition-all disabled:opacity-50"
                                                        >
                                                            {buying === signal.id ? '...' : 'Unlock'}
                                                        </button>
                                                    )}
                                                    {(owned || !signal.is_premium) && (
                                                        <ArrowUpRight size={14} className="text-gray-600 group-hover:text-emerald-400 transition-colors" />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Empty state */}
                    {!loading && filteredSignals.length === 0 && (
                        <div className="text-center py-20">
                            <Brain size={48} className="text-gray-700 mx-auto mb-4" />
                            <h3 className="text-gray-500 font-bold mb-2">
                                {showMyOnly ? 'No purchased signals yet' : 'No signals in this category'}
                            </h3>
                            <p className="text-gray-600 text-sm max-w-md mx-auto">
                                {showMyOnly
                                    ? 'Purchase premium signals to unlock full AI reports and actionable trade recommendations.'
                                    : 'AI agents are analyzing data. New signals appear every 2 hours.'
                                }
                            </p>
                        </div>
                    )}

                    {/* ─── HOW IT WORKS ─── */}
                    {!loading && !showMyOnly && (
                        <div className="mt-16 fu d6">
                            <h2 className="text-center text-xs font-bold text-gray-500 uppercase tracking-widest mb-8 flex items-center justify-center gap-2">
                                <Zap size={14} className="text-amber-400" /> How Signal Marketplace Works
                            </h2>
                            <div className="grid md:grid-cols-4 gap-4">
                                {[
                                    { icon: '📡', title: 'Real-Time Data', desc: 'CoinGecko, ECB Forex, Polymarket, HackerNews — refreshed every 30 min', color: 'from-cyan-500/10 to-cyan-500/5' },
                                    { icon: '🧠', title: 'Swarm AI Analysis', desc: '7 specialized AI agents analyze data and generate predictions with confidence scores', color: 'from-violet-500/10 to-violet-500/5' },
                                    { icon: '💎', title: 'GSTD Purchase', desc: 'Free summaries for all. Premium reports with trade signals cost GSTD tokens', color: 'from-amber-500/10 to-amber-500/5' },
                                    { icon: '🏦', title: 'Revenue Split', desc: '50% Gold Reserve backing, 20% Node rewards, 30% platform development', color: 'from-emerald-500/10 to-emerald-500/5' },
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

                {/* ─── SIGNAL DETAIL MODAL ─── */}
                {selectedSignal && (
                    <div
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setSelectedSignal(null)}
                    >
                        <div
                            onClick={e => e.stopPropagation()}
                            className="bg-[#0d1525] border border-white/10 rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl"
                        >
                            {/* Modal header */}
                            <div className="sticky top-0 bg-[#0d1525]/95 backdrop-blur-sm px-6 pt-6 pb-4 border-b border-white/[0.06] z-10">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-xl">{CATEGORIES.find(c => c.id === selectedSignal.category)?.icon || '🔮'}</span>
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{selectedSignal.category}</span>
                                            {selectedSignal.is_premium && (
                                                <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-[10px] font-bold text-amber-400 flex items-center gap-1">
                                                    <Crown size={9} /> PREMIUM
                                                </span>
                                            )}
                                        </div>
                                        <h2 className="text-xl font-black text-white leading-tight">{selectedSignal.title}</h2>
                                    </div>
                                    <button
                                        onClick={() => setSelectedSignal(null)}
                                        className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all shrink-0 ml-3"
                                    >✕</button>
                                </div>
                            </div>

                            <div className="px-6 py-5 space-y-5">
                                {/* Metrics */}
                                <div className="grid grid-cols-4 gap-3">
                                    {[
                                        { label: 'Confidence', value: `${Math.round(selectedSignal.confidence * 100)}%`, color: 'text-emerald-400' },
                                        { label: 'Impact', value: selectedSignal.impact.toUpperCase(), color: IMPACT_CONFIG[selectedSignal.impact]?.color ? '' : 'text-gray-400', style: { color: IMPACT_CONFIG[selectedSignal.impact]?.color } },
                                        { label: 'Horizon', value: selectedSignal.time_horizon, color: 'text-cyan-400' },
                                        { label: 'Accuracy', value: `${selectedSignal.accuracy?.toFixed(0)}%`, color: 'text-violet-400' },
                                    ].map(m => (
                                        <div key={m.label} className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-3 text-center">
                                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{m.label}</div>
                                            <div className={`text-lg font-black ${m.color}`} style={m.style}>{m.value}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Summary */}
                                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5">
                                    <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                        <Activity size={12} /> Analysis Summary
                                    </h4>
                                    <p className="text-sm text-gray-300 leading-relaxed">{cleanSummary(selectedSignal.summary)}</p>
                                </div>

                                {/* Full Report or Paywall */}
                                {selectedSignal.full_report ? (
                                    <div className="rounded-2xl bg-emerald-500/[0.04] border border-emerald-500/15 p-5">
                                        <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                            <Unlock size={12} /> Full Report — Unlocked
                                        </h4>
                                        <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{selectedSignal.full_report}</div>
                                    </div>
                                ) : selectedSignal.is_premium && selectedSignal.price_gstd > 0 ? (
                                    <div className="rounded-2xl bg-gradient-to-br from-amber-500/[0.06] to-violet-500/[0.04] border border-amber-500/20 p-6 text-center">
                                        <Lock size={32} className="text-amber-400 mx-auto mb-3" />
                                        <h3 className="text-lg font-bold text-white mb-2">Full Report Locked</h3>
                                        <p className="text-sm text-gray-400 mb-5 max-w-sm mx-auto">
                                            Unlock the complete AI analysis with actionable trade recommendations, entry/exit points, and risk assessment.
                                        </p>
                                        <button
                                            onClick={() => buySignal(selectedSignal)}
                                            disabled={buying === selectedSignal.id}
                                            className="px-8 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-base hover:from-amber-400 hover:to-orange-400 transition-all shadow-lg shadow-amber-500/25 disabled:opacity-50"
                                        >
                                            {buying === selectedSignal.id
                                                ? 'Processing…'
                                                : `Unlock for ${selectedSignal.price_gstd} GSTD`
                                            }
                                        </button>
                                        {!address && (
                                            <p className="text-xs text-gray-500 mt-3">Connect wallet first to purchase</p>
                                        )}
                                    </div>
                                ) : null}

                                {/* Agent info */}
                                <div className="flex items-center justify-between py-3 border-t border-white/[0.05]">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-cyan-500/20 flex items-center justify-center text-sm">
                                            🤖
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-white">{selectedSignal.agent_name}</div>
                                            <div className="text-[11px] text-gray-500">Score: {(selectedSignal.agent_score * 100).toFixed(0)}% • {selectedSignal.buyers} buyers</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[11px] text-gray-500">Created {timeAgo(selectedSignal.created_at)}</div>
                                        <div className="text-[11px] text-gray-500">{timeLeft(selectedSignal.expires_at)}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

export async function getServerSideProps({ locale }: { locale: string }) {
    return {
        props: await getCommonStaticProps(locale),
    };
}
