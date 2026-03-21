import { useTranslation } from 'next-i18next';
import React, { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import {
    Brain, Lock, Unlock, Eye,
    Users, Coins, RefreshCw, ShieldCheck,
    Activity, Sparkles, Target, Clock, Crown
} from 'lucide-react';
import { toast } from '../../lib/toast';
import { apiGet, apiPost } from '../../lib/apiClient';
import { useWalletStore } from '../../store/walletStore';
import { useTonConnectUI } from '@tonconnect/ui-react';

import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

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

interface Agent {
    name: string;
    specialty: string;
    accuracy: number;
    signals: number;
    icon: string;
}

interface NetworkStats {
    total_signals: number;
    premium_signals: number;
    total_buyers: number;
    total_revenue_gstd: number;
    network_accuracy: number;
    agents_active: number;
    learning_epochs: number;
}

export default function PredictionsPage() {

    const [tonConnectUI] = useTonConnectUI();
    const { address, gstdBalance } = useWalletStore();

    const [activeTab, setActiveTab] = useState<'signals' | 'premium' | 'agents' | 'my' | 'sources' | 'compute' | 'revenue'>('signals');
    const [signals, setSignals] = useState<Signal[]>([]);
    const [premiumSignals, setPremiumSignals] = useState<Signal[]>([]);
    const [mySignals, setMySignals] = useState<Signal[]>([]);
    const [agents, setAgents] = useState<Agent[]>([]);
    const [stats, setStats] = useState<NetworkStats | null>(null);
    const [dataSources, setDataSources] = useState<any[]>([]);
    const [computeRewards, setComputeRewards] = useState<any>(null);
    const [revenueStats, setRevenueStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [buying, setBuying] = useState<string | null>(null);
    const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
    const [pulsePhase, setPulsePhase] = useState(0);

    // Neural pulse animation
    useEffect(() => {
        const timer = setInterval(() => setPulsePhase(p => (p + 1) % 360), 50);
        return () => clearInterval(timer);
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [sigRes, statsRes, agentRes, srcRes, compRes, revRes] = await Promise.allSettled([
                apiGet('/api/v1/signals/public'),
                apiGet('/api/v1/signals/stats'),
                apiGet('/api/v1/signals/leaderboard'),
                apiGet('/api/v1/signals/data-sources'),
                apiGet('/api/v1/signals/compute-rewards'),
                apiGet('/api/v1/signals/revenue'),
            ]);
            if (sigRes.status === 'fulfilled') setSignals(sigRes.value?.signals || []);
            if (statsRes.status === 'fulfilled') setStats(statsRes.value || null);
            if (agentRes.status === 'fulfilled') setAgents(agentRes.value?.agents || []);
            if (srcRes.status === 'fulfilled') setDataSources(srcRes.value?.sources || []);
            if (compRes.status === 'fulfilled') setComputeRewards(compRes.value || null);
            if (revRes.status === 'fulfilled') setRevenueStats(revRes.value || null);

            if (address) {
                const [premRes, myRes] = await Promise.allSettled([
                    apiGet('/api/v1/signals/premium'),
                    apiGet('/api/v1/signals/my'),
                ]);
                if (premRes.status === 'fulfilled') setPremiumSignals(premRes.value?.signals || []);
                if (myRes.status === 'fulfilled') setMySignals(myRes.value?.signals || []);
            }
        } finally {
            setLoading(false);
        }
    }, [address]);

    useEffect(() => { loadData(); }, [loadData]);

    const buySignal = async (signal: Signal) => {
        if (!address) {
            toast.error('Connect wallet to buy signals');
            tonConnectUI.openModal();
            return;
        }
        setBuying(signal.id);
        try {
            const res = await apiPost(`/api/v1/signals/buy/${signal.id}`, {});
            if (res?.full_report) {
                setSelectedSignal({ ...signal, full_report: res.full_report });
                toast.success(`Signal unlocked for ${signal.price_gstd} GSTD`);
                loadData();
            } else if (res?.message) {
                toast.success(res.message);
                loadData();
            } else {
                toast.success('Purchase successful');
                loadData();
            }
        } catch (e: any) {
            const msg = e?.data?.error || e?.message || 'Purchase failed';
            if (msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('balance') || e?.status === 402) {
                const serverBalance = e?.data?.balance ?? (gstdBalance || 0);
                const deepLink = `https://t.me/GstdAppBot?start=buy-gstd-${Math.ceil(signal.price_gstd * 100)}`;
                window.open(deepLink, '_blank');
                toast.error(`Need ${signal.price_gstd} GSTD. Balance: ${Number(serverBalance).toFixed(2)}. Opening Telegram to buy...`);
            } else {
                toast.error(msg);
            }
        } finally {
            setBuying(null);
        }
    };

    const impactColor = (impact: string) => {
        switch (impact) {
            case 'critical': return '#ff4444';
            case 'high': return '#ff8800';
            case 'medium': return '#00cc88';
            case 'low': return '#6688aa';
            default: return '#8888aa';
        }
    };

    const categoryIcon = (cat: string) => {
        switch (cat) {
            case 'marketplace': return '📊';
            case 'tokenomics': return '💰';
            case 'growth': return '🚀';
            case 'security': return '🛡';
            case 'community': return '💬';
            case 'governance': return '⚖️';
            case 'defi': return '🧭';
            case 'crypto': return '₿';
            case 'forex': return '💱';
            case 'commodities': return '🥇';
            case 'tech-trends': return '📡';
            case 'real-estate': return '🏠';
            case 'energy': return '⚡';
            default: return '🔮';
        }
    };

    const getAgentColor = (acc: number) => acc > 80 ? '#00cc88' : acc > 70 ? '#ffaa00' : '#ff6644';
    const getAgentGradient = (acc: number) => acc > 80 ? 'linear-gradient(90deg, #00cc88, #00ffaa)' : acc > 70 ? 'linear-gradient(90deg, #ffaa00, #ff8800)' : 'linear-gradient(90deg, #ff6644, #ff4422)';
    const getSrcStatus = (status: string) => status === 'live' ? '● LIVE' : status === 'initializing' ? '⏳ Starting...' : '○ Stale';

    return (
        <>
            <Head>
                <title>GSTD AI Signals — Swarm Intelligence Predictions</title>
                <meta name="description" content="AI-powered prediction signals from GSTD swarm intelligence network. Buy premium signals with GSTD tokens." />
            </Head>


            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #0a0a1a 0%, #0d1525 30%, #0a1a2e 60%, #0d0d20 100%)',
                color: '#e0e0e0',
                fontFamily: "'Inter', -apple-system, sans-serif",
                paddingTop: 24,
            }}>
                {/* Neural Network Background */}
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: `radial-gradient(circle at ${30 + Math.sin(pulsePhase * 0.02) * 20}% ${40 + Math.cos(pulsePhase * 0.015) * 15}%, rgba(0,200,150,0.06) 0%, transparent 50%),
                                 radial-gradient(circle at ${70 + Math.cos(pulsePhase * 0.018) * 15}% ${60 + Math.sin(pulsePhase * 0.025) * 10}%, rgba(100,100,255,0.04) 0%, transparent 50%)`,
                    pointerEvents: 'none', zIndex: 0,
                }} />

                <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px 80px', position: 'relative', zIndex: 1 }}>
                    {/* Header */}
                    <div style={{ textAlign: 'center', marginBottom: 40 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
                            <Brain size={36} color="#00cc88" style={{ filter: 'drop-shadow(0 0 12px rgba(0,204,136,0.5))' }} />
                            <h1 style={{
                                fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
                                fontWeight: 800,
                                background: 'linear-gradient(135deg, #00cc88, #00aaff, #aa66ff)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                margin: 0,
                            }}>AI Prediction Signals</h1>
                        </div>
                        <p style={{ color: '#88aacc', fontSize: 16, maxWidth: 600, margin: '0 auto' }}>
                            Swarm AI analyzes network data in real-time.
                            The network learns, improves, and generates tradeable prediction signals for GSTD.
                        </p>
                    </div>

                    {/* Stats Bar */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: 12, marginBottom: 32,
                    }}>
                        {[
                            { icon: <Activity size={18} />, label: 'Signals', value: stats?.total_signals || 0, color: '#00cc88' },
                            { icon: <Users size={18} />, label: 'Agents', value: stats?.agents_active || 7, color: '#00aaff' },
                            { icon: <Target size={18} />, label: 'Accuracy', value: `${(stats?.network_accuracy || 0).toFixed(0)}%`, color: '#aa66ff' },
                            { icon: <Coins size={18} />, label: 'Revenue', value: `${(stats?.total_revenue_gstd || 0).toFixed(1)}`, color: '#ffaa00' },
                            { icon: <Sparkles size={18} />, label: 'Epochs', value: stats?.learning_epochs || 0, color: '#ff66aa' },
                        ].map((s) => (
                            <div key={s.label} style={{
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 14, padding: '14px 16px',
                                textAlign: 'center',
                                backdropFilter: 'blur(10px)',
                            }}>
                                <div style={{ color: s.color, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                    {s.icon} <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</span>
                                </div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{s.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Wallet Bar */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: 'rgba(0,200,136,0.06)', border: '1px solid rgba(0,200,136,0.15)',
                        borderRadius: 14, padding: '12px 20px', marginBottom: 24,
                        flexWrap: 'wrap', gap: 12,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <ShieldCheck size={18} color="#00cc88" />
                            {address ? (
                                <span style={{ color: '#aaccbb', fontSize: 14 }}>
                                    <span style={{ color: '#00cc88' }}>{address.slice(0, 6)}...{address.slice(-4)}</span>
                                    {' '} · Balance: <strong style={{ color: '#fff' }}>{(gstdBalance || 0).toFixed(2)} GSTD</strong>
                                </span>
                            ) : (
                                <span style={{ color: '#88aacc', fontSize: 14 }}>Connect wallet to buy premium signals</span>
                            )}
                        </div>
                        {!address && (
                            <button onClick={() => tonConnectUI.openModal()} style={{
                                background: 'linear-gradient(135deg, #00cc88, #00aa77)',
                                color: '#fff', border: 'none', borderRadius: 10,
                                padding: '8px 18px', fontWeight: 600, cursor: 'pointer',
                                fontSize: 13,
                            }}>Connect Wallet</button>
                        )}
                    </div>

                    {/* Tabs */}
                    <div style={{
                        display: 'flex', gap: 4,
                        background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 4,
                        marginBottom: 24, overflowX: 'auto',
                    }}>
                        {([
                            { id: 'signals' as const, label: '🔮 Free', count: signals.length },
                            { id: 'premium' as const, label: '💎 Premium', count: premiumSignals.length },
                            { id: 'agents' as const, label: '🐟 Agents', count: agents.length },
                            { id: 'sources' as const, label: '📡 Data Feeds', count: dataSources.filter((s: any) => s.fresh).length },
                            { id: 'compute' as const, label: '🖥️ Compute', count: computeRewards?.contributing_nodes || 0 },
                            { id: 'revenue' as const, label: '💰 Revenue', count: 0 },
                            { id: 'my' as const, label: '📦 My', count: mySignals.length },
                        ]).map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                                flex: 1, minWidth: 80, padding: '10px 10px',
                                background: activeTab === tab.id ? 'rgba(0,204,136,0.15)' : 'transparent',
                                border: activeTab === tab.id ? '1px solid rgba(0,204,136,0.3)' : '1px solid transparent',
                                borderRadius: 10, color: activeTab === tab.id ? '#00cc88' : '#88aacc',
                                fontWeight: activeTab === tab.id ? 700 : 500,
                                cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap',
                                transition: 'all 0.2s',
                            }}>
                                {tab.label} {tab.count > 0 && <span style={{ opacity: 0.6 }}>({tab.count})</span>}
                            </button>
                        ))}
                    </div>

                    {/* Loading */}
                    {loading && (
                        <div style={{ textAlign: 'center', padding: 60 }}>
                            <RefreshCw size={32} color="#00cc88" style={{ animation: 'spin 1s linear infinite' }} />
                            <p style={{ color: '#88aacc', marginTop: 12 }}>Neural network processing...</p>
                        </div>
                    )}

                    {/* FREE SIGNALS TAB */}
                    {!loading && activeTab === 'signals' && (
                        <div>
                            {signals.length === 0 ? (
                                <div style={{
                                    textAlign: 'center', padding: '60px 20px',
                                    background: 'rgba(255,255,255,0.03)', borderRadius: 18,
                                    border: '1px solid rgba(255,255,255,0.06)',
                                }}>
                                    <Brain size={48} color="#334466" style={{ marginBottom: 16 }} />
                                    <h3 style={{ color: '#667788', marginBottom: 8 }}>Network Learning...</h3>
                                    <p style={{ color: '#556677', maxWidth: 400, margin: '0 auto' }}>
                                        AI agents are collecting data and training. First signals will appear shortly.
                                    </p>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gap: 16 }}>
                                    {signals.map(sig => (
                                        <SignalCard
                                            key={sig.id} signal={sig}
                                            onBuy={() => buySignal(sig)}
                                            onView={() => setSelectedSignal(sig)}
                                            buying={buying === sig.id}
                                            impactColor={impactColor}
                                            categoryIcon={categoryIcon}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* PREMIUM SIGNALS TAB */}
                    {!loading && activeTab === 'premium' && (
                        <div>
                            {!address && (
                                <div style={{
                                    textAlign: 'center', padding: '60px 20px',
                                    background: 'rgba(255,200,0,0.03)', borderRadius: 18,
                                    border: '1px solid rgba(255,200,0,0.1)',
                                }}>
                                    <Lock size={48} color="#ffaa00" style={{ marginBottom: 16 }} />
                                    <h3 style={{ color: '#ccaa66', marginBottom: 8 }}>Wallet Required</h3>
                                    <p style={{ color: '#998866' }}>Connect your TON wallet to access premium prediction signals.</p>
                                    <button onClick={() => tonConnectUI.openModal()} style={{
                                        marginTop: 16, background: 'linear-gradient(135deg, #ffaa00, #ff8800)',
                                        color: '#fff', border: 'none', borderRadius: 12,
                                        padding: '12px 24px', fontWeight: 700, cursor: 'pointer',
                                    }}>Connect Wallet</button>
                                </div>
                            )}
                            {address && premiumSignals.length === 0 && (
                                <div style={{
                                    textAlign: 'center', padding: '60px 20px',
                                    background: 'rgba(255,255,255,0.03)', borderRadius: 18,
                                    border: '1px solid rgba(255,255,255,0.06)',
                                }}>
                                    <Sparkles size={48} color="#aa66ff" />
                                    <h3 style={{ color: '#aa88cc', marginTop: 16 }}>Premium signals generating...</h3>
                                    <p style={{ color: '#887799' }}>Our AI agents are working on deep analysis. Check back soon.</p>
                                </div>
                            )}
                            {address && premiumSignals.length > 0 && (
                                <div style={{ display: 'grid', gap: 16 }}>
                                    {premiumSignals.map(sig => (
                                        <SignalCard
                                            key={sig.id} signal={sig}
                                            onBuy={() => buySignal(sig)}
                                            onView={() => setSelectedSignal(sig)}
                                            buying={buying === sig.id}
                                            impactColor={impactColor}
                                            categoryIcon={categoryIcon}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* AGENTS TAB */}
                    {!loading && activeTab === 'agents' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                            {agents.map((agent, i) => (
                                <div key={agent.name} style={{
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: 16, padding: 20,
                                    transition: 'all 0.3s',
                                    position: 'relative', overflow: 'hidden',
                                }}>
                                    {i === 0 && (
                                        <div style={{
                                            position: 'absolute', top: 10, right: 10,
                                            background: 'linear-gradient(135deg, #ffaa00, #ff6600)',
                                            borderRadius: 8, padding: '3px 8px', fontSize: 10,
                                            fontWeight: 700, color: '#fff',
                                        }}>TOP AGENT</div>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                                        <span style={{ fontSize: 32 }}>{agent.icon}</span>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>{agent.name}</h3>
                                            <span style={{ fontSize: 12, color: '#88aacc' }}>{agent.specialty}</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                        <div style={{ background: 'rgba(0,200,136,0.08)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                                            <div style={{ fontSize: 11, color: '#88aacc', marginBottom: 4 }}>Accuracy</div>
                                            <div style={{ fontSize: 20, fontWeight: 700, color: getAgentColor(agent.accuracy) }}>
                                                {agent.accuracy}%
                                            </div>
                                        </div>
                                        <div style={{ background: 'rgba(100,100,255,0.08)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                                            <div style={{ fontSize: 11, color: '#88aacc', marginBottom: 4 }}>Signals</div>
                                            <div style={{ fontSize: 20, fontWeight: 700, color: '#aabbff' }}>{agent.signals}</div>
                                        </div>
                                    </div>
                                    {/* Accuracy bar */}
                                    <div style={{ marginTop: 14, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                                        <div style={{
                                            width: `${agent.accuracy}%`, height: '100%', borderRadius: 2,
                                            background: getAgentGradient(agent.accuracy),
                                            transition: 'width 1s ease',
                                        }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* MY SIGNALS TAB */}
                    {!loading && activeTab === 'my' && (
                        <div>
                            {!address && (
                                <div style={{ textAlign: 'center', padding: 60 }}>
                                    <Lock size={48} color="#667788" />
                                    <p style={{ color: '#667788', marginTop: 12 }}>Connect wallet to see purchased signals</p>
                                </div>
                            )}
                            {address && mySignals.length === 0 && (
                                <div style={{
                                    textAlign: 'center', padding: '60px 20px',
                                    background: 'rgba(255,255,255,0.03)', borderRadius: 18,
                                    border: '1px solid rgba(255,255,255,0.06)',
                                }}>
                                    <Eye size={48} color="#556677" />
                                    <h3 style={{ color: '#667788', marginTop: 16 }}>No purchased signals yet</h3>
                                    <p style={{ color: '#556677' }}>Buy premium signals to unlock full AI reports and predictions.</p>
                                </div>
                            )}
                            {address && mySignals.length > 0 && (
                                <div style={{ display: 'grid', gap: 16 }}>
                                    {mySignals.map(sig => (
                                        <SignalCard
                                            key={sig.id} signal={sig}
                                            onView={() => setSelectedSignal(sig)}
                                            purchased
                                            impactColor={impactColor}
                                            categoryIcon={categoryIcon}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* How It Works — always visible */}
                    {!loading && (activeTab === 'signals' || activeTab === 'premium') && (
                        <div style={{
                            marginTop: 48, padding: 32,
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 18,
                        }}>
                            <h2 style={{
                                textAlign: 'center', margin: '0 0 24px',
                                fontSize: 20, fontWeight: 700, color: '#fff',
                            }}>How Swarm Intelligence Works</h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
                                {[
                                    { icon: '📡', title: 'Real Data Feeds', desc: 'CoinGecko, ECB Forex, Polymarket, HackerNews — real-time data, refreshed every 30 min' },
                                    { icon: '🧠', title: 'Swarm AI Analysis', desc: 'Multi-agent simulation processes data with 200+ AI personas predicting outcomes' },
                                    { icon: '🖥️', title: 'Node Compute', desc: 'GSTD nodes contribute computing power. Nodes earn 0.5-1.0 GSTD per signal processed' },
                                    { icon: '💎', title: 'Signal Trading', desc: 'Premium signals sold for GSTD. Revenue split: 50% Gold Reserve, 20% Node Rewards, 30% Platform' },
                                ].map((step) => (
                                    <div key={step.title} style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 36, marginBottom: 8 }}>{step.icon}</div>
                                        <h4 style={{ color: '#00cc88', marginBottom: 6, fontWeight: 700, fontSize: 14 }}>{step.title}</h4>
                                        <p style={{ color: '#88aacc', fontSize: 13, lineHeight: 1.5 }}>{step.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* DATA SOURCES TAB */}
                    {!loading && activeTab === 'sources' && (
                        <div>
                            <div style={{
                                background: 'rgba(0,200,136,0.06)', border: '1px solid rgba(0,200,136,0.15)',
                                borderRadius: 14, padding: '16px 20px', marginBottom: 20,
                                textAlign: 'center',
                            }}>
                                <span style={{ fontSize: 14, color: '#88aacc' }}>Real-time market data feeds enriching AI signal generation</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                                {dataSources.map((src: any) => (
                                    <div key={src.source} style={{
                                        background: src.fresh ? 'rgba(0,200,136,0.06)' : 'rgba(255,100,50,0.06)',
                                        border: `1px solid ${src.fresh ? 'rgba(0,200,136,0.2)' : 'rgba(255,100,50,0.15)'}`,
                                        borderRadius: 16, padding: 20,
                                        position: 'relative',
                                    }}>
                                        <div style={{ position: 'absolute', top: 12, right: 12 }}>
                                            <span style={{
                                                display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                                                background: src.fresh ? '#00cc88' : '#ff6644',
                                                boxShadow: src.fresh ? '0 0 8px rgba(0,204,136,0.6)' : 'none',
                                                animation: src.fresh ? 'pulse 2s infinite' : 'none',
                                            }} />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                            <span style={{ fontSize: 32 }}>{src.icon}</span>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>{src.source}</h3>
                                                <span style={{ fontSize: 12, color: '#88aacc' }}>{src.api_url}</span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#88aacc' }}>
                                            <span>Category: <strong style={{ color: '#aabbff' }}>{src.category}</strong></span>
                                            <span>Status: <strong style={{ color: src.fresh ? '#00cc88' : '#ff6644' }}>
                                                {getSrcStatus(src.status)}
                                            </strong></span>
                                        </div>
                                        {src.last_fetch && (
                                            <div style={{ marginTop: 8, fontSize: 11, color: '#667788' }}>
                                                Last fetch: {new Date(src.last_fetch).toLocaleString()} · {src.data_points} data points
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* COMPUTE REWARDS TAB */}
                    {!loading && activeTab === 'compute' && (
                        <div>
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(100,100,255,0.08), rgba(0,200,136,0.06))',
                                border: '1px solid rgba(100,100,255,0.15)',
                                borderRadius: 18, padding: 24, marginBottom: 20,
                            }}>
                                <h3 style={{ margin: '0 0 16px', color: '#fff', fontSize: 18 }}>🖥️ Swarm Compute Rewards</h3>
                                <p style={{ color: '#88aacc', fontSize: 13, marginBottom: 16 }}>
                                    Nodes that contribute computing power for AI signal generation earn GSTD rewards.
                                    When a user purchases a premium signal, 20% of revenue goes to the node that processed it.
                                </p>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                                    {[
                                        { label: 'Total Rewards', value: `${(computeRewards?.total_rewards_gstd || 0).toFixed(2)} GSTD`, color: '#00cc88' },
                                        { label: 'Active Nodes', value: computeRewards?.contributing_nodes || 0, color: '#aabbff' },
                                        { label: 'Avg Compute', value: `${(computeRewards?.avg_compute_ms || 0).toFixed(0)}ms`, color: '#ffaa00' },
                                        { label: 'Revenue Share', value: `${computeRewards?.revenue_share_pct || 20}%`, color: '#aa66ff' },
                                    ].map((s) => (
                                        <div key={s.label} style={{
                                            background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '12px 14px',
                                            textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: 11, color: '#88aacc', marginBottom: 4, textTransform: 'uppercase' }}>{s.label}</div>
                                            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Reward model explanation */}
                            <div style={{
                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 16, padding: 20,
                            }}>
                                <h4 style={{ color: '#fff', margin: '0 0 12px' }}>How Node Rewards Work</h4>
                                <div style={{ display: 'grid', gap: 10 }}>
                                    {[
                                        { icon: '🔄', text: 'Every 2 hours, AI generates new signals using real market data from 5+ sources' },
                                        { icon: '🖥️', text: 'A random online node is selected as compute contributor for each signal' },
                                        { icon: '💰', text: 'Base reward: 0.5 GSTD per signal. Fast compute bonus: 1.0 GSTD if < 5 seconds' },
                                        { icon: '💎', text: 'When users buy premium signals, 20% of the price goes to the compute node' },
                                        { icon: '🏦', text: 'Remaining 50% strengthens the Gold Reserve, 30% funds platform development' },
                                    ].map((item, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <span style={{ fontSize: 20 }}>{item.icon}</span>
                                            <span style={{ color: '#aabbcc', fontSize: 13 }}>{item.text}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* REVENUE TAB */}
                    {!loading && activeTab === 'revenue' && revenueStats && (
                        <div>
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(255,170,0,0.08), rgba(0,200,136,0.06))',
                                border: '1px solid rgba(255,170,0,0.15)',
                                borderRadius: 18, padding: 24, marginBottom: 20,
                            }}>
                                <h3 style={{ margin: '0 0 16px', color: '#fff', fontSize: 18 }}>💰 Signal Marketplace Revenue</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                                    {[
                                        { label: 'Total Revenue', value: `${(revenueStats.total_revenue_gstd || 0).toFixed(2)}`, color: '#ffaa00', unit: 'GSTD' },
                                        { label: 'Purchases', value: revenueStats.total_purchases || 0, color: '#00cc88', unit: '' },
                                        { label: 'Unique Buyers', value: revenueStats.unique_buyers || 0, color: '#aabbff', unit: '' },
                                    ].map((s) => (
                                        <div key={s.label} style={{
                                            background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '14px 16px',
                                            textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: 11, color: '#88aacc', marginBottom: 4, textTransform: 'uppercase' }}>{s.label}</div>
                                            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value} <span style={{ fontSize: 12, opacity: 0.6 }}>{s.unit}</span></div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Revenue split visualization */}
                            <div style={{
                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 16, padding: 20, marginBottom: 16,
                            }}>
                                <h4 style={{ color: '#fff', margin: '0 0 16px' }}>Revenue Distribution Model</h4>
                                <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', height: 32, marginBottom: 16 }}>
                                    <div style={{ width: '50%', background: 'linear-gradient(90deg, #00cc88, #00aa77)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>50% Gold Reserve</div>
                                    <div style={{ width: '20%', background: 'linear-gradient(90deg, #6666ff, #8866ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>20% Nodes</div>
                                    <div style={{ width: '30%', background: 'linear-gradient(90deg, #ffaa00, #ff8800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>30% Platform</div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 11, color: '#88aacc', marginBottom: 4 }}>🏦 Gold Reserve</div>
                                        <div style={{ fontSize: 18, fontWeight: 700, color: '#00cc88' }}>{(revenueStats.revenue_split?.gold_reserve_gstd || 0).toFixed(2)}</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 11, color: '#88aacc', marginBottom: 4 }}>🖥️ Compute Nodes</div>
                                        <div style={{ fontSize: 18, fontWeight: 700, color: '#aabbff' }}>{(revenueStats.revenue_split?.compute_rewards_gstd || 0).toFixed(2)}</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 11, color: '#88aacc', marginBottom: 4 }}>⚙️ Platform</div>
                                        <div style={{ fontSize: 18, fontWeight: 700, color: '#ffaa00' }}>{(revenueStats.revenue_split?.platform_fee_gstd || 0).toFixed(2)}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Signal Detail Modal */}
                {selectedSignal && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.7)', zIndex: 1000,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 20,
                    }} onClick={() => setSelectedSignal(null)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelectedSignal(null)}>
                        <div onClick={e => e.stopPropagation()} role="presentation" style={{
                            background: '#141828', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 20, padding: 28, maxWidth: 600, width: '100%',
                            maxHeight: '80vh', overflowY: 'auto',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                                <div>
                                    <span style={{ fontSize: 24, marginRight: 8 }}>{categoryIcon(selectedSignal.category)}</span>
                                    <h2 style={{ display: 'inline', fontSize: 20, fontWeight: 700, color: '#fff' }}>{selectedSignal.title}</h2>
                                </div>
                                <button onClick={() => setSelectedSignal(null)} style={{
                                    background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8,
                                    width: 32, height: 32, cursor: 'pointer', color: '#aaa', fontSize: 16,
                                }}>✕</button>
                            </div>

                            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                                <span style={{ background: impactColor(selectedSignal.impact) + '22', color: impactColor(selectedSignal.impact), padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
                                    {selectedSignal.impact.toUpperCase()}
                                </span>
                                <span style={{ background: 'rgba(0,170,255,0.15)', color: '#00aaff', padding: '4px 10px', borderRadius: 8, fontSize: 12 }}>
                                    <Clock size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />{selectedSignal.time_horizon}
                                </span>
                                <span style={{ background: 'rgba(0,200,136,0.15)', color: '#00cc88', padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
                                    {(selectedSignal.confidence * 100).toFixed(0)}% confident
                                </span>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                                <h4 style={{ color: '#88aacc', fontSize: 12, textTransform: 'uppercase', marginBottom: 8 }}>Summary</h4>
                                <p style={{ color: '#ccc', lineHeight: 1.6, margin: 0 }}>{selectedSignal.summary}</p>
                            </div>

                            {selectedSignal.full_report ? (
                                <div style={{ background: 'rgba(0,200,136,0.06)', borderRadius: 12, padding: 16, border: '1px solid rgba(0,200,136,0.15)' }}>
                                    <h4 style={{ color: '#00cc88', fontSize: 12, textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Unlock size={14} /> Full Report
                                    </h4>
                                    <p style={{ color: '#ccc', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{selectedSignal.full_report}</p>
                                </div>
                            ) : (
                                <div style={{ background: 'rgba(255,170,0,0.06)', borderRadius: 12, padding: 16, textAlign: 'center', border: '1px solid rgba(255,170,0,0.15)' }}>
                                    <Lock size={24} color="#ffaa00" style={{ marginBottom: 8 }} />
                                    <p style={{ color: '#ccaa66', margin: '0 0 12px' }}>Full report locked. Unlock for {selectedSignal.price_gstd} GSTD</p>
                                    <button onClick={() => buySignal(selectedSignal)} disabled={buying === selectedSignal.id} style={{
                                        background: 'linear-gradient(135deg, #ffaa00, #ff8800)',
                                        color: '#fff', border: 'none', borderRadius: 10,
                                        padding: '10px 24px', fontWeight: 700, cursor: 'pointer',
                                    }}>{buying === selectedSignal.id ? 'Purchasing...' : `Buy for ${selectedSignal.price_gstd} GSTD`}</button>
                                </div>
                            )}

                            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', color: '#667788', fontSize: 12 }}>
                                <span>Agent: {selectedSignal.agent_name}</span>
                                <span>{selectedSignal.buyers} buyers</span>
                            </div>
                        </div>
                    </div>
                )}

                <style jsx global>{`
                    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                    @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
                `}</style>
            </div>
        </>
    );
}

// ─── Signal Card Component ──────────────────────────────────

function SignalCard(props: Readonly<{
    signal: Signal;
    onBuy?: () => void;
    onView: () => void;
    buying?: boolean;
    purchased?: boolean;
    impactColor: (s: string) => string;
    categoryIcon: (s: string) => string;
}>) {
    const { signal, onBuy, onView, buying, purchased, impactColor, categoryIcon } = props;
    return (
        <div onClick={onView} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onView()} style={{
            background: signal.is_premium ? 'linear-gradient(135deg, rgba(255,170,0,0.06), rgba(170,100,255,0.04))' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${signal.is_premium ? 'rgba(255,170,0,0.15)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 16, padding: 20, cursor: 'pointer',
            transition: 'all 0.3s',
            position: 'relative',
        }}>
            {signal.is_premium && !purchased && (
                <div style={{
                    position: 'absolute', top: 12, right: 12,
                    background: 'linear-gradient(135deg, #ffaa00, #ff8800)',
                    borderRadius: 8, padding: '4px 10px', fontSize: 11,
                    fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 4,
                }}>
                    <Crown size={12} /> {signal.price_gstd} GSTD
                </div>
            )}
            {purchased && (
                <div style={{
                    position: 'absolute', top: 12, right: 12,
                    background: 'rgba(0,200,136,0.2)',
                    borderRadius: 8, padding: '4px 10px', fontSize: 11,
                    fontWeight: 700, color: '#00cc88',
                }}>
                    ✅ OWNED
                </div>
            )}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ fontSize: 28, lineHeight: 1 }}>{categoryIcon(signal.category)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#fff', paddingRight: signal.is_premium ? 80 : 0 }}>
                        {signal.title}
                    </h3>
                    <p style={{ margin: '0 0 12px', color: '#99aabb', fontSize: 13, lineHeight: 1.5 }}>
                        {signal.summary}
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        <span style={{
                            background: impactColor(signal.impact) + '22',
                            color: impactColor(signal.impact),
                            padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        }}>{signal.impact}</span>
                        <span style={{ background: 'rgba(0,200,136,0.1)', color: '#00cc88', padding: '3px 8px', borderRadius: 6, fontSize: 11 }}>
                            {(signal.confidence * 100).toFixed(0)}%
                        </span>
                        <span style={{ background: 'rgba(100,100,255,0.1)', color: '#aabbff', padding: '3px 8px', borderRadius: 6, fontSize: 11 }}>
                            {signal.time_horizon}
                        </span>
                        <span style={{ color: '#667788', fontSize: 11, marginLeft: 'auto' }}>
                            {signal.agent_name} · {signal.buyers} buyers
                        </span>
                    </div>
                </div>
            </div>
            {signal.is_premium && !purchased && !signal.full_report && onBuy && (
                <div style={{ marginTop: 14, textAlign: 'right' }}>
                    <button onClick={e => { e.stopPropagation(); onBuy(); }} disabled={buying} style={{
                        background: 'linear-gradient(135deg, #ffaa00, #ff8800)',
                        color: '#fff', border: 'none', borderRadius: 10,
                        padding: '8px 18px', fontWeight: 600, cursor: 'pointer', fontSize: 13,
                        opacity: buying ? 0.6 : 1,
                    }}>
                        {buying ? 'Buying...' : `Unlock ${signal.price_gstd} GSTD`}
                    </button>
                </div>
            )}
        </div>
    );
}

export async function getServerSideProps({ locale }: { locale: string }) {
    return {
        props: {
            ...(await serverSideTranslations(locale || 'en', ['common'])),
        },
    };
}
