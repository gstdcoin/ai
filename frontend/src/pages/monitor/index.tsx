import { useTranslation } from 'next-i18next';
import React, { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import {
    Briefcase, Zap, CheckCircle, Clock,
    ShieldCheck, RefreshCw,
    Eye, Brain, Sparkles, Target, Lock,
    BarChart3, Users, Coins, Activity, Play
} from 'lucide-react';
import { toast } from '../../lib/toast';
import { apiGet, apiPost } from '../../lib/apiClient';
import { useWalletStore } from '../../store/walletStore';
import { useTonConnectUI } from '@tonconnect/ui-react';

// ═══════════════════════════════════════════════════════════════
//  GSTD SWARM AI SIMULATION HUB
//  Powered by GSTD Swarm Intelligence Engine
//  Paid real-time simulations across crypto, forex, polymarket, tech
// ═══════════════════════════════════════════════════════════════

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

export default function SwarmSimulations() {
    const { t } = useTranslation('common');
    const { address, gstdBalance } = useWalletStore();
    const [tonConnectUI] = useTonConnectUI();

    const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
    const [mySimulations, setMySimulations] = useState<Simulation[]>([]);
    const [stats, setStats] = useState<SimStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [launching, setLaunching] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'catalog' | 'my' | 'live' | 'stats'>('catalog');
    const [selectedSim, setSelectedSim] = useState<SimResult | null>(null);
    const [customScenario, setCustomScenario] = useState('');
    const [customSeed, setCustomSeed] = useState('');
    const [showCustomModal, setShowCustomModal] = useState(false);
    const [pulsePhase, setPulsePhase] = useState(0);

    // Pulse animation
    useEffect(() => {
        const timer = setInterval(() => setPulsePhase(p => (p + 1) % 360), 50);
        return () => clearInterval(timer);
    }, []);

    // Data loading
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

    // Auto-refresh active simulations
    useEffect(() => {
        const hasActive = mySimulations.some(s => s.status === 'processing');
        if (!hasActive) return;
        const interval = setInterval(async () => {
            if (address) {
                const myRes = await apiGet('/api/v1/simulations/my');
                setMySimulations(myRes?.simulations || []);
            }
        }, 10000);
        return () => clearInterval(interval);
    }, [mySimulations, address]);

    // Launch simulation
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
                toast.success(`⚡ Simulation launched! Processing with ${res.agent_count || 200} AI agents...`);
                setActiveTab('my');
                setShowCustomModal(false);
                fetchData();
            }
        } catch (e: any) {
            const msg = e?.data?.error || e?.message || 'Launch failed';
            if (msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('balance') || e?.status === 402) {
                const serverBalance = e?.data?.balance ?? (gstdBalance || 0);
                const deepLink = `https://t.me/GstdAppBot?start=buy-gstd-${Math.ceil(price * 100)}`;
                window.open(deepLink, '_blank');
                toast.error(`Need ${price} GSTD. Balance: ${Number(serverBalance).toFixed(2)}. Opening Telegram to buy...`);
            } else {
                toast.error(msg);
            }
        } finally {
            setLaunching(null);
        }
    };

    // View full simulation result
    const viewResult = async (simId: string) => {
        try {
            const res = await apiGet(`/api/v1/simulations/results/${simId}`);
            if (res) setSelectedSim(res);
        } catch {
            toast.error('Failed to load result');
        }
    };

    // Category colors
    const catColor = (cat: string) => {
        const colors: Record<string, string> = {
            crypto: '#f7931a', forex: '#00cc88', polymarket: '#8b5cf6',
            'tech-trends': '#00aaff', custom: '#ff66aa',
        };
        return colors[cat] || '#888';
    };

    const catGlow = (cat: string) => `0 0 40px ${catColor(cat)}33`;

    const statusBadge = (status: string) => {
        if (status === 'processing') return { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', label: '⏳ Processing...' };
        if (status === 'completed') return { bg: 'rgba(16,185,129,0.15)', color: '#34d399', label: '✅ Completed' };
        if (status === 'failed') return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: '❌ Failed' };
        return { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8', label: status };
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0a0a1a 0%, #0d1525 30%, #0a1a2e 60%, #0d0d20 100%)',
            color: '#e0e0e0',
            fontFamily: "'Inter', -apple-system, sans-serif",
            paddingTop: 24,
        }}>
            <Head>
                <title>GSTD AI Simulations — Swarm Intelligence Engine | GSTD</title>
                <meta name="description" content="Launch paid AI simulations powered by GSTD swarm intelligence. Crypto, Forex, Polymarket, Tech Trends analysis with 200+ AI agents." />
            </Head>

            {/* Neural Background */}
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: `radial-gradient(circle at ${30 + Math.sin(pulsePhase * 0.02) * 20}% ${40 + Math.cos(pulsePhase * 0.015) * 15}%, rgba(247,147,26,0.05) 0%, transparent 50%),
                             radial-gradient(circle at ${70 + Math.cos(pulsePhase * 0.018) * 15}% ${60 + Math.sin(pulsePhase * 0.025) * 10}%, rgba(139,92,246,0.04) 0%, transparent 50%)`,
                pointerEvents: 'none', zIndex: 0,
            }} />

            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px 80px', position: 'relative', zIndex: 1 }}>

                {/* ─── HEADER ─────────────────────────────────────────── */}
                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
                        <Brain size={36} color="#f7931a" style={{ filter: 'drop-shadow(0 0 12px rgba(247,147,26,0.5))' }} />
                        <h1 style={{
                            fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
                            fontWeight: 800,
                            background: 'linear-gradient(135deg, #f7931a, #ff6600, #aa66ff)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            margin: 0,
                        }}>GSTD Swarm Simulations</h1>
                    </div>
                    <p style={{ color: '#88aacc', fontSize: 16, maxWidth: 640, margin: '0 auto' }}>
                        Launch real-time simulations powered by 200+ AI agents. Predict crypto markets, forex movements, 
                        polymarket events, and tech trends. Pay with GSTD, receive full reports.
                    </p>
                </div>

                {/* ─── STATS BAR ─────────────────────────────────────── */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: 12, marginBottom: 32,
                }}>
                    {[
                        { icon: <Activity size={18} />, label: 'Total Sims', value: stats?.total_simulations || 0, color: '#f7931a' },
                        { icon: <Zap size={18} />, label: 'Active', value: stats?.active_simulations || 0, color: '#60a5fa' },
                        { icon: <CheckCircle size={18} />, label: 'Completed', value: stats?.completed_simulations || 0, color: '#34d399' },
                        { icon: <Coins size={18} />, label: 'Revenue', value: `${(stats?.total_revenue_gstd || 0).toFixed(1)}`, color: '#ffaa00' },
                        { icon: <Users size={18} />, label: 'Users', value: stats?.unique_users || 0, color: '#aa66ff' },
                    ].map(s => (
                        <div key={s.label} style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 14, padding: '14px 16px',
                            textAlign: 'center', backdropFilter: 'blur(10px)',
                        }}>
                            <div style={{ color: s.color, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                {s.icon} <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</span>
                            </div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{s.value}</div>
                        </div>
                    ))}
                </div>

                {/* ─── WALLET BAR ─────────────────────────────────────── */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'rgba(247,147,26,0.06)', border: '1px solid rgba(247,147,26,0.15)',
                    borderRadius: 14, padding: '12px 20px', marginBottom: 24,
                    flexWrap: 'wrap', gap: 12,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <ShieldCheck size={18} color="#f7931a" />
                        {address ? (
                            <span style={{ color: '#aaccbb', fontSize: 14 }}>
                                <span style={{ color: '#f7931a' }}>{address.slice(0, 6)}...{address.slice(-4)}</span>
                                {' '} · Balance: <strong style={{ color: '#fff' }}>{(gstdBalance || 0).toFixed(2)} GSTD</strong>
                            </span>
                        ) : (
                            <span style={{ color: '#88aacc', fontSize: 14 }}>Connect wallet to launch paid simulations</span>
                        )}
                    </div>
                    {!address && (
                        <button onClick={() => tonConnectUI.openModal()} style={{
                            background: 'linear-gradient(135deg, #f7931a, #ff6600)',
                            color: '#fff', border: 'none', borderRadius: 10,
                            padding: '8px 18px', fontWeight: 600, cursor: 'pointer', fontSize: 13,
                        }}>Connect Wallet</button>
                    )}
                </div>

                {/* ─── TABS ─────────────────────────────────────────── */}
                <div style={{
                    display: 'flex', gap: 4,
                    background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 4,
                    marginBottom: 24, overflowX: 'auto',
                }}>
                    {([
                        { id: 'catalog' as const, label: '⚡ Simulation Catalog', count: catalog.length },
                        { id: 'my' as const, label: '📦 My Simulations', count: mySimulations.length },
                        { id: 'live' as const, label: '⚡ Live Feed', count: stats?.recent_simulations?.length || 0 },
                        { id: 'stats' as const, label: '📊 Platform Stats', count: 0 },
                    ]).map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                            flex: 1, minWidth: 100, padding: '10px 10px',
                            background: activeTab === tab.id ? 'rgba(247,147,26,0.15)' : 'transparent',
                            border: activeTab === tab.id ? '1px solid rgba(247,147,26,0.3)' : '1px solid transparent',
                            borderRadius: 10, color: activeTab === tab.id ? '#f7931a' : '#88aacc',
                            fontWeight: activeTab === tab.id ? 700 : 500,
                            cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap', transition: 'all 0.2s',
                        }}>
                            {tab.label} {tab.count > 0 && <span style={{ opacity: 0.6 }}>({tab.count})</span>}
                        </button>
                    ))}
                </div>

                {/* Loading */}
                {loading && (
                    <div style={{ textAlign: 'center', padding: 60 }}>
                        <RefreshCw size={32} color="#f7931a" style={{ animation: 'spin 1s linear infinite' }} />
                        <p style={{ color: '#88aacc', marginTop: 12 }}>Loading simulation data...</p>
                    </div>
                )}

                {/* ═══ CATALOG TAB ═══════════════════════════════════════ */}
                {!loading && activeTab === 'catalog' && (
                    <div>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                            gap: 20,
                        }}>
                            {catalog.map(entry => (
                                <div key={entry.id} style={{
                                    background: 'rgba(255,255,255,0.04)',
                                    border: `1px solid ${catColor(entry.category)}33`,
                                    borderRadius: 20, padding: 24,
                                    transition: 'all 0.3s',
                                    position: 'relative', overflow: 'hidden',
                                    cursor: 'pointer',
                                }}
                                onMouseEnter={e => {
                                    (e.currentTarget as HTMLDivElement).style.borderColor = catColor(entry.category) + '66';
                                    (e.currentTarget as HTMLDivElement).style.boxShadow = catGlow(entry.category);
                                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLDivElement).style.borderColor = catColor(entry.category) + '33';
                                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                                }}
                                >
                                    {/* Price badge */}
                                    <div style={{
                                        position: 'absolute', top: 16, right: 16,
                                        background: `linear-gradient(135deg, ${catColor(entry.category)}, ${catColor(entry.category)}cc)`,
                                        borderRadius: 10, padding: '6px 12px',
                                        fontSize: 13, fontWeight: 700, color: '#fff',
                                        display: 'flex', alignItems: 'center', gap: 4,
                                    }}>
                                        <Coins size={14} /> {entry.price_gstd} GSTD
                                    </div>

                                    {/* Icon + Title */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                                        <span style={{ fontSize: 40, lineHeight: 1 }}>{entry.icon}</span>
                                        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff', paddingRight: 90 }}>
                                            {entry.title}
                                        </h3>
                                    </div>

                                    <p style={{ color: '#99aabb', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
                                        {entry.description}
                                    </p>

                                    {/* Features */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                                        {entry.features.map(f => (
                                            <span key={f} style={{
                                                background: 'rgba(255,255,255,0.06)',
                                                border: '1px solid rgba(255,255,255,0.08)',
                                                borderRadius: 6, padding: '3px 8px',
                                                fontSize: 11, color: '#aabbcc',
                                            }}>✓ {f}</span>
                                        ))}
                                    </div>

                                    {/* Meta */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                        <span style={{ fontSize: 12, color: '#667788' }}>
                                            <Users size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                            {entry.agent_count} AI agents
                                        </span>
                                        <span style={{ fontSize: 12, color: '#667788' }}>
                                            <Clock size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                            {entry.duration_rounds} rounds
                                        </span>
                                    </div>

                                    {/* Launch Button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (entry.id === 'custom') {
                                                setShowCustomModal(true);
                                            } else {
                                                launchSimulation(entry.id);
                                            }
                                        }}
                                        disabled={launching === entry.id}
                                        style={{
                                            width: '100%', padding: '12px 0',
                                            background: launching === entry.id ? 'rgba(255,255,255,0.1)' : `linear-gradient(135deg, ${catColor(entry.category)}, ${catColor(entry.category)}cc)`,
                                            border: 'none', borderRadius: 12,
                                            color: '#fff', fontWeight: 700, fontSize: 14,
                                            cursor: launching === entry.id ? 'wait' : 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        {launching === entry.id ? (
                                            <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Launching...</>
                                        ) : (
                                            <><Play size={16} /> Launch Simulation — {entry.price_gstd} GSTD</>
                                        )}
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* How it Works */}
                        <div style={{
                            marginTop: 48, padding: 32,
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 18,
                        }}>
                            <h2 style={{
                                textAlign: 'center', margin: '0 0 24px',
                                fontSize: 20, fontWeight: 700, color: '#fff',
                            }}>How Swarm Simulations Work</h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
                                {[
                                    { icon: '💰', title: 'Pay with GSTD', desc: 'Choose a simulation category and pay with your GSTD tokens. Funds are split: 50% Gold Reserve, 20% Node Rewards, 30% Platform.' },
                                    { icon: '🧠', title: 'Swarm Processing', desc: '200+ AI agents with independent personalities simulate market behavior using GSTD swarm intelligence engine and real-time data feeds.' },
                                    { icon: '📊', title: 'Live Results', desc: 'Track your simulation progress in real-time. Results include predictions, confidence levels, and emergent patterns.' },
                                    { icon: '📑', title: 'Full Report', desc: 'Receive a comprehensive report with actionable trading signals, risk assessment, and AI-generated insights.' },
                                ].map(step => (
                                    <div key={step.title} style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 36, marginBottom: 8 }}>{step.icon}</div>
                                        <h4 style={{ color: '#f7931a', marginBottom: 6, fontWeight: 700, fontSize: 14 }}>{step.title}</h4>
                                        <p style={{ color: '#88aacc', fontSize: 13, lineHeight: 1.5 }}>{step.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══ MY SIMULATIONS TAB ═══════════════════════════════ */}
                {!loading && activeTab === 'my' && (
                    <div>
                        {!address && (
                            <div style={{
                                textAlign: 'center', padding: '60px 20px',
                                background: 'rgba(255,200,0,0.03)', borderRadius: 18,
                                border: '1px solid rgba(255,200,0,0.1)',
                            }}>
                                <Lock size={48} color="#ffaa00" style={{ marginBottom: 16 }} />
                                <h3 style={{ color: '#ccaa66', marginBottom: 8 }}>Wallet Required</h3>
                                <p style={{ color: '#998866' }}>Connect your TON wallet to view your simulations.</p>
                                <button onClick={() => tonConnectUI.openModal()} style={{
                                    marginTop: 16, background: 'linear-gradient(135deg, #f7931a, #ff6600)',
                                    color: '#fff', border: 'none', borderRadius: 12,
                                    padding: '12px 24px', fontWeight: 700, cursor: 'pointer',
                                }}>Connect Wallet</button>
                            </div>
                        )}

                        {address && mySimulations.length === 0 && (
                            <div style={{
                                textAlign: 'center', padding: '60px 20px',
                                background: 'rgba(255,255,255,0.03)', borderRadius: 18,
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}>
                                <Sparkles size={48} color="#556677" />
                                <h3 style={{ color: '#667788', marginTop: 16 }}>No simulations yet</h3>
                                <p style={{ color: '#556677' }}>Launch your first AI simulation from the catalog.</p>
                                <button onClick={() => setActiveTab('catalog')} style={{
                                    marginTop: 16, background: 'linear-gradient(135deg, #f7931a, #ff6600)',
                                    color: '#fff', border: 'none', borderRadius: 12,
                                    padding: '12px 24px', fontWeight: 700, cursor: 'pointer',
                                }}>Browse Catalog</button>
                            </div>
                        )}

                        {address && mySimulations.length > 0 && (
                            <div style={{ display: 'grid', gap: 16 }}>
                                {mySimulations.map(sim => {
                                    const badge = statusBadge(sim.status);
                                    return (
                                        <div key={sim.id}
                                            onClick={() => sim.status === 'completed' ? viewResult(sim.id) : undefined}
                                            style={{
                                                background: 'rgba(255,255,255,0.04)',
                                                border: `1px solid ${catColor(sim.category)}22`,
                                                borderRadius: 16, padding: 20,
                                                cursor: sim.status === 'completed' ? 'pointer' : 'default',
                                                transition: 'all 0.3s',
                                                position: 'relative',
                                            }}
                                        >
                                            {/* Status badge */}
                                            <div style={{
                                                position: 'absolute', top: 14, right: 14,
                                                background: badge.bg,
                                                borderRadius: 8, padding: '4px 10px',
                                                fontSize: 12, fontWeight: 600, color: badge.color,
                                            }}>{badge.label}</div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                                                <span style={{ fontSize: 28 }}>
                                                    {sim.category === 'crypto' ? '₿' : sim.category === 'forex' ? '💱' : sim.category === 'polymarket' ? '🗳️' : sim.category === 'tech-trends' ? '📡' : '🧪'}
                                                </span>
                                                <div>
                                                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>
                                                        {sim.category.charAt(0).toUpperCase() + sim.category.slice(1)} Simulation
                                                    </h3>
                                                    <span style={{ fontSize: 12, color: '#667788' }}>
                                                        {sim.id} · {new Date(sim.created_at).toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>

                                            {sim.result_summary && (
                                                <p style={{
                                                    color: '#aabbcc', fontSize: 13, lineHeight: 1.5,
                                                    margin: '10px 0', paddingRight: 100,
                                                }}>
                                                    {sim.result_summary.slice(0, 200)}
                                                    {sim.result_summary.length > 200 ? '...' : ''}
                                                </p>
                                            )}

                                            <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                                                {sim.confidence > 0 && (
                                                    <span style={{ fontSize: 12, color: '#34d399' }}>
                                                        <Target size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                                        {(sim.confidence * 100).toFixed(0)}% confidence
                                                    </span>
                                                )}
                                                {sim.predictions_count > 0 && (
                                                    <span style={{ fontSize: 12, color: '#60a5fa' }}>
                                                        <Sparkles size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                                        {sim.predictions_count} predictions
                                                    </span>
                                                )}
                                                <span style={{ fontSize: 12, color: '#f7931a' }}>
                                                    <Coins size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                                    {sim.price_gstd} GSTD
                                                </span>
                                                {sim.compute_ms > 0 && (
                                                    <span style={{ fontSize: 12, color: '#667788' }}>
                                                        <Clock size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                                        {(sim.compute_ms / 1000).toFixed(1)}s
                                                    </span>
                                                )}
                                            </div>

                                            {sim.status === 'processing' && (
                                                <div style={{
                                                    marginTop: 12, padding: '8px 12px',
                                                    background: 'rgba(59,130,246,0.08)',
                                                    borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8,
                                                }}>
                                                    <RefreshCw size={14} color="#60a5fa" style={{ animation: 'spin 2s linear infinite' }} />
                                                    <span style={{ fontSize: 12, color: '#60a5fa' }}>
                                                        Swarm is processing... {sim.agent_count} AI agents active
                                                    </span>
                                                </div>
                                            )}

                                            {sim.status === 'completed' && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); viewResult(sim.id); }}
                                                    style={{
                                                        marginTop: 12, padding: '8px 16px',
                                                        background: 'rgba(16,185,129,0.15)',
                                                        border: '1px solid rgba(16,185,129,0.3)',
                                                        borderRadius: 10, color: '#34d399',
                                                        fontWeight: 600, fontSize: 13,
                                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                                    }}
                                                >
                                                    <Eye size={14} /> View Full Report
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ LIVE FEED TAB ═══════════════════════════════════ */}
                {!loading && activeTab === 'live' && (
                    <div>
                        <div style={{
                            background: 'rgba(247,147,26,0.06)', border: '1px solid rgba(247,147,26,0.15)',
                            borderRadius: 14, padding: '16px 20px', marginBottom: 20, textAlign: 'center',
                        }}>
                            <span style={{ fontSize: 14, color: '#88aacc' }}>
                                Recent simulations across the platform (anonymized)
                            </span>
                        </div>

                        <div style={{ display: 'grid', gap: 12 }}>
                            {(stats?.recent_simulations || []).map(sim => {
                                const badge = statusBadge(sim.status);
                                return (
                                    <div key={sim.id} style={{
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        borderRadius: 14, padding: '16px 20px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        flexWrap: 'wrap', gap: 12,
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{ fontSize: 24 }}>
                                                {sim.category === 'crypto' ? '₿' : sim.category === 'forex' ? '💱' : sim.category === 'polymarket' ? '🗳️' : sim.category === 'tech-trends' ? '📡' : '🧪'}
                                            </span>
                                            <div>
                                                <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>
                                                    {sim.category.charAt(0).toUpperCase() + sim.category.slice(1)} Simulation
                                                </div>
                                                <div style={{ fontSize: 11, color: '#667788' }}>
                                                    {new Date(sim.created_at).toLocaleString()}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                            {sim.confidence > 0 && (
                                                <span style={{ fontSize: 12, color: '#34d399', fontWeight: 600 }}>
                                                    {(sim.confidence * 100).toFixed(0)}%
                                                </span>
                                            )}
                                            {sim.predictions_count > 0 && (
                                                <span style={{ fontSize: 12, color: '#60a5fa' }}>
                                                    {sim.predictions_count} pred.
                                                </span>
                                            )}
                                            <span style={{
                                                background: badge.bg, color: badge.color,
                                                padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                            }}>{badge.label}</span>
                                        </div>
                                    </div>
                                );
                            })}
                            {(!stats?.recent_simulations || stats.recent_simulations.length === 0) && (
                                <div style={{ textAlign: 'center', padding: 40, color: '#667788' }}>
                                    <Brain size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
                                    <p>No simulations on the platform yet. Be the first to launch one!</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ═══ STATS TAB ═══════════════════════════════════════ */}
                {!loading && activeTab === 'stats' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
                        <div style={{
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 18, padding: 24,
                        }}>
                            <h3 style={{ color: '#f7931a', margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <BarChart3 size={18} /> Simulation Overview
                            </h3>
                            <div style={{ display: 'grid', gap: 10 }}>
                                {[
                                    { l: 'Total Simulations', v: stats?.total_simulations || 0 },
                                    { l: 'Completed', v: stats?.completed_simulations || 0 },
                                    { l: 'Active Now', v: stats?.active_simulations || 0 },
                                    { l: 'Unique Users', v: stats?.unique_users || 0 },
                                    { l: 'Total Revenue', v: `${(stats?.total_revenue_gstd || 0).toFixed(2)} GSTD` },
                                ].map(r => (
                                    <div key={r.l} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                                    }}>
                                        <span style={{ fontSize: 13, color: '#88aacc' }}>{r.l}</span>
                                        <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{r.v}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 18, padding: 24,
                        }}>
                            <h3 style={{ color: '#ffaa00', margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <ShieldCheck size={18} /> Revenue Distribution
                            </h3>
                            {/* Revenue bar */}
                            <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', height: 32, marginBottom: 20 }}>
                                <div style={{ width: '50%', background: 'linear-gradient(90deg, #00cc88, #00aa77)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>50% Gold Reserve</div>
                                <div style={{ width: '20%', background: 'linear-gradient(90deg, #6666ff, #8866ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>20% Nodes</div>
                                <div style={{ width: '30%', background: 'linear-gradient(90deg, #ffaa00, #ff8800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>30% Platform</div>
                            </div>

                            <div style={{ display: 'grid', gap: 10, fontSize: 13, color: '#aabbcc' }}>
                                {[
                                    { icon: '🏦', text: 'Gold Reserve — 50% of all simulation revenue strengthens XAUt-backed token value' },
                                    { icon: '🖥️', text: 'Compute Nodes — 20% rewards nodes that contribute computing power for simulations' },
                                    { icon: '⚙️', text: 'Platform Operations — 30% funds ongoing development and AI improvements' },
                                ].map((item, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ fontSize: 18 }}>{item.icon}</span>
                                        <span>{item.text}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ═══ CUSTOM SIMULATION MODAL ═══════════════════════════ */}
            {showCustomModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.7)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
                }} onClick={() => setShowCustomModal(false)}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: '#141828', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 20, padding: 28, maxWidth: 500, width: '100%',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                                🧪 Custom Simulation
                            </h3>
                            <button onClick={() => setShowCustomModal(false)} style={{
                                background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8,
                                width: 32, height: 32, cursor: 'pointer', color: '#aaa', fontSize: 16,
                            }}>✕</button>
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', fontSize: 12, color: '#88aacc', marginBottom: 6, fontWeight: 600 }}>
                                Scenario Description
                            </label>
                            <textarea
                                value={customScenario}
                                onChange={e => setCustomScenario(e.target.value)}
                                placeholder="Describe what you want the AI swarm to simulate and predict..."
                                rows={4}
                                style={{
                                    width: '100%', padding: '12px 14px',
                                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: 12, color: '#fff', fontSize: 14,
                                    resize: 'vertical', outline: 'none',
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: 20 }}>
                            <label style={{ display: 'block', fontSize: 12, color: '#88aacc', marginBottom: 6, fontWeight: 600 }}>
                                Seed Data (optional)
                            </label>
                            <textarea
                                value={customSeed}
                                onChange={e => setCustomSeed(e.target.value)}
                                placeholder="Paste any relevant data (news articles, reports, stats) to use as seed material..."
                                rows={3}
                                style={{
                                    width: '100%', padding: '12px 14px',
                                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: 12, color: '#fff', fontSize: 14,
                                    resize: 'vertical', outline: 'none',
                                }}
                            />
                        </div>

                        <div style={{
                            padding: '12px 16px', background: 'rgba(247,147,26,0.08)',
                            border: '1px solid rgba(247,147,26,0.15)',
                            borderRadius: 12, marginBottom: 16,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <span style={{ color: '#88aacc', fontSize: 13 }}>Simulation Price</span>
                            <span style={{ color: '#f7931a', fontWeight: 700, fontSize: 16 }}>30 GSTD</span>
                        </div>

                        <button
                            onClick={() => launchSimulation('custom', customScenario, customSeed)}
                            disabled={launching === 'custom' || !customScenario.trim()}
                            style={{
                                width: '100%', padding: '14px 0',
                                background: launching === 'custom' ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #ff66aa, #aa66ff)',
                                border: 'none', borderRadius: 12,
                                color: '#fff', fontWeight: 700, fontSize: 15,
                                cursor: (launching === 'custom' || !customScenario.trim()) ? 'not-allowed' : 'pointer',
                                opacity: !customScenario.trim() ? 0.5 : 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            }}
                        >
                            {launching === 'custom' ? (
                                <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Launching...</>
                            ) : (
                                <><Play size={16} /> Launch Custom Simulation</>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* ═══ RESULT DETAIL MODAL ═══════════════════════════════ */}
            {selectedSim && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.75)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
                }} onClick={() => setSelectedSim(null)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && setSelectedSim(null)}>
                    <div onClick={e => e.stopPropagation()} role="presentation" style={{
                        background: '#141828', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 20, padding: 28, maxWidth: 700, width: '100%',
                        maxHeight: '85vh', overflowY: 'auto',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                            <div>
                                <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: '#fff' }}>
                                    📊 {selectedSim.category.charAt(0).toUpperCase() + selectedSim.category.slice(1)} Simulation Report
                                </h2>
                                <span style={{ fontSize: 12, color: '#667788' }}>{selectedSim.id}</span>
                            </div>
                            <button onClick={() => setSelectedSim(null)} style={{
                                background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8,
                                width: 32, height: 32, cursor: 'pointer', color: '#aaa', fontSize: 16,
                            }}>✕</button>
                        </div>

                        {/* Meta badges */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                            {selectedSim.confidence > 0 && (
                                <span style={{
                                    background: 'rgba(16,185,129,0.15)', color: '#34d399',
                                    padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                }}>{(selectedSim.confidence * 100).toFixed(0)}% confident</span>
                            )}
                            {selectedSim.predictions_count > 0 && (
                                <span style={{
                                    background: 'rgba(59,130,246,0.15)', color: '#60a5fa',
                                    padding: '4px 10px', borderRadius: 8, fontSize: 12,
                                }}>{selectedSim.predictions_count} predictions</span>
                            )}
                            <span style={{
                                background: 'rgba(247,147,26,0.15)', color: '#f7931a',
                                padding: '4px 10px', borderRadius: 8, fontSize: 12,
                            }}>{selectedSim.price_gstd} GSTD</span>
                            {selectedSim.compute_ms > 0 && (
                                <span style={{
                                    background: 'rgba(148,163,184,0.15)', color: '#94a3b8',
                                    padding: '4px 10px', borderRadius: 8, fontSize: 12,
                                }}>{(selectedSim.compute_ms / 1000).toFixed(1)}s compute</span>
                            )}
                        </div>

                        {/* Full Report */}
                        <div style={{
                            background: 'rgba(0,200,136,0.06)', borderRadius: 14, padding: 20,
                            border: '1px solid rgba(0,200,136,0.15)',
                        }}>
                            <h4 style={{ color: '#34d399', fontSize: 12, textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Eye size={14} /> Full Simulation Report
                            </h4>
                            <div style={{
                                color: '#ccc', lineHeight: 1.7, fontSize: 14,
                                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            }}>
                                {selectedSim.result_report || 'Report generating...'}
                            </div>
                        </div>

                        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', color: '#667788', fontSize: 12 }}>
                            <span>Created: {new Date(selectedSim.created_at).toLocaleString()}</span>
                            {selectedSim.completed_at && (
                                <span>Completed: {new Date(selectedSim.completed_at).toLocaleString()}</span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style jsx global>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}

import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
    props: {
        ...(await serverSideTranslations(locale || 'en', ['common'])),
    },
});
