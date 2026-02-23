import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { Activity, Globe2, Cpu, Network, Zap, Database, ArrowRight, ShieldCheck, TrendingUp, AlertCircle, DollarSign, Coins } from 'lucide-react';
import { apiGet } from '../../lib/apiClient';

interface LogEntry {
    id: string;
    type: 'AI_TASK' | 'ASSET_TRANSFER' | 'NODE_JOIN' | 'ANOMALY';
    chain: 'TON' | 'SOL' | 'XRP' | 'SWARM';
    amount?: number;
    message: string;
    timestamp: string;
    lat: number;
    lng: number;
    targetLat: number;
    targetLng: number;
}

export default function GlobalMonitor() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [stats, setStats] = useState({
        activeNodes: 14502,
        tps: 342.5,
        tvl: 45000000,
        tasksProcessed: 14502500,
        revenue24h: 0,
        goldReserve: 0,
        protocolFund: 0,
        tasksPending: 0,
        tasksCompleted: 0,
        totalUsers: 0,
        telegramLinked: 0,
        activeDevices: 0,
    });
    const [analysis, setAnalysis] = useState('NEURAL_SYNAPSE_INIT...');
    const [health, setHealth] = useState(0.85);
    const [lastDecision, setLastDecision] = useState('');
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Unified Organism Polling — single endpoint for organism + flows + monetization + neural
    useEffect(() => {
        const fetchUnified = async () => {
            try {
                const data = await apiGet<any>('/monitor/unified');
                if (data) {
                    const org = data.organism || {};
                    const flows = data.flows || {};
                    const mon = data.monetization || {};
                    if (flows.recent_events) setLogs(flows.recent_events);
                    setHealth(org.health_score ?? 0.85);
                    setAnalysis(data.neural || 'NEURAL_STABLE');
                    setLastDecision(org.last_decision || '');
                    const eco = data.ecosystem || {};
                    setStats(prev => ({
                        ...prev,
                        tps: flows.global_tps ?? prev.tps,
                        tvl: flows.total_volume_24h ?? prev.tvl,
                        revenue24h: mon.total_revenue_24h ?? org.revenue_24h ?? prev.revenue24h,
                        goldReserve: mon.gold_reserve ?? org.gold_reserve ?? prev.goldReserve,
                        protocolFund: mon.protocol_fund ?? org.protocol_fund ?? prev.protocolFund,
                        tasksPending: org.tasks_pending ?? eco.tasks_pending ?? prev.tasksPending,
                        tasksCompleted: org.tasks_completed ?? eco.tasks_completed ?? prev.tasksCompleted,
                        totalUsers: eco.total_users ?? prev.totalUsers,
                        telegramLinked: eco.telegram_linked ?? prev.telegramLinked,
                        activeDevices: eco.active_devices ?? eco.active_nodes ?? prev.activeDevices,
                        activeNodes: eco.active_nodes ?? prev.activeNodes,
                    }));
                }
            } catch (e) {
                // Fallback: fetch individual endpoints
                try {
                    const [flowsRes, orgRes, revRes, neuralRes] = await Promise.all([
                        apiGet<any>('/monitor/flows'),
                        apiGet<any>('/monitor/organism-state'),
                        apiGet<any>('/monitor/revenue'),
                        apiGet<any>('/monitor/neural'),
                    ]);
                    if (flowsRes?.recent_events) setLogs(flowsRes.recent_events);
                    if (orgRes?.health_score != null) setHealth(orgRes.health_score);
                    if (neuralRes?.analysis) setAnalysis(neuralRes.analysis);
                    if (revRes) {
                        setStats(prev => ({
                            ...prev,
                            revenue24h: revRes.total_revenue_24h ?? prev.revenue24h,
                            goldReserve: revRes.gold_reserve ?? prev.goldReserve,
                            protocolFund: revRes.protocol_fund ?? prev.protocolFund,
                        }));
                    }
                } catch (e2) {
                    console.error('Monitor fetch error');
                }
            }
        };
        fetchUnified();
        const interval = setInterval(fetchUnified, 3000);
        return () => clearInterval(interval);
    }, []);

    // WebGL/Canvas Visualizer
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        const particles: any[] = [];
        const arcs: any[] = [];

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', resize);
        resize();

        const project = (lat: number, lng: number) => {
            const x = (lng + 180) * (canvas.width / 360);
            const y = (90 - lat) * (canvas.height / 180);
            return { x, y };
        };

        const drawMap = () => {
            ctx.fillStyle = 'rgba(3, 0, 20, 0.15)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.strokeStyle = 'rgba(59, 130, 246, 0.05)';
            ctx.lineWidth = 1;
            const stepX = canvas.width / 24;
            const stepY = canvas.height / 12;
            ctx.beginPath();
            for (let x = 0; x <= canvas.width; x += stepX) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
            for (let y = 0; y <= canvas.height; y += stepY) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
            ctx.stroke();

            const time = Date.now() / 3000;
            const radarX = canvas.width / 2;
            const radarY = canvas.height / 2;
            const gradient = ctx.createConicGradient(time, radarX, radarY);
            gradient.addColorStop(0, "rgba(59, 130, 246, 0)");
            gradient.addColorStop(0.1, "rgba(59, 130, 246, 0.1)");
            gradient.addColorStop(1, "rgba(59, 130, 246, 0)");
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(radarX, radarY, canvas.height, 0, Math.PI * 2);
            ctx.fill();
        };

        const animate = () => {
            drawMap();
            // Only add arcs if they are new (based on logs)
            // Visual stimulation
            if (Math.random() < 0.05 && logs.length > 0) {
                const log = logs[Math.floor(Math.random() * logs.length)];
                const start = project(log.lat, log.lng);
                const end = project(log.targetLat, log.targetLng);
                let color = '#3b82f6';
                if (log.chain === 'SOL') color = '#10b981';
                if (log.chain === 'XRP') color = '#fbbf24';
                arcs.push({ start, end, progress: 0, color, height: Math.random() * 150 + 50 });
            }

            for (let i = arcs.length - 1; i >= 0; i--) {
                const arc = arcs[i];
                arc.progress += 0.008;
                if (arc.progress >= 1) {
                    arcs.splice(i, 1);
                    continue;
                }
                const currentX = arc.start.x + (arc.end.x - arc.start.x) * arc.progress;
                const currentY = arc.start.y + (arc.end.y - arc.start.y) * arc.progress - Math.sin(arc.progress * Math.PI) * arc.height;
                ctx.beginPath();
                ctx.arc(currentX, currentY, 2, 0, Math.PI * 2);
                ctx.fillStyle = arc.color;
                ctx.shadowBlur = 15;
                ctx.shadowColor = arc.color;
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            animationFrameId = requestAnimationFrame(animate);
        };
        animate();
        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationFrameId);
        };
    }, [logs]);

    return (
        <div className="bg-[#030014] text-white min-h-screen relative overflow-hidden font-mono antialiased selection:bg-blue-500/30">
            <Head>
                <title>GSTD | Global Financial Monitor</title>
            </Head>

            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-0" />

            <div className="relative z-10 flex flex-col h-screen p-6 pointer-events-none">
                <header className="flex items-center justify-between mb-8 pointer-events-auto">
                    <div className="flex items-center gap-5">
                        <div className="w-14 h-14 bg-gradient-to-br from-blue-600/20 to-purple-600/20 rounded-2xl flex items-center justify-center border border-white/10 shadow-2xl backdrop-blur-md">
                            <Globe2 className="w-8 h-8 text-blue-400 animate-pulse" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black uppercase tracking-[0.3em] text-white drop-shadow-2xl">Monitor</h1>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                                <span className="text-[10px] font-bold text-emerald-400 tracking-[0.2em] uppercase">Sovereign Swarm Live</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl backdrop-blur-xl flex items-center gap-3">
                            <ShieldCheck className="w-4 h-4 text-blue-400" />
                            <span className="text-[10px] font-black uppercase text-gray-300">Integrity: 100%</span>
                        </div>
                        <button
                            onClick={() => setIsFullscreen(!isFullscreen)}
                            className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
                        >
                            <Zap className="w-5 h-5 text-amber-400" />
                        </button>
                    </div>
                </header>

                <main className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-8 pointer-events-auto overflow-hidden">
                    {/* Activity Stream */}
                    <div className="col-span-1 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 flex flex-col shadow-2xl overflow-hidden relative group">
                        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-6 flex items-center gap-3">
                            <Activity className="w-4 h-4 text-blue-400" />
                            Global Ledger Flow
                        </h2>
                        <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                            {logs.map((log) => (
                                <div key={log.id} className="p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-all border-l-2"
                                    style={{ borderLeftColor: log.chain === 'TON' ? '#3b82f6' : log.chain === 'SOL' ? '#10b981' : '#fbbf24' }}>
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[9px] font-black uppercase text-gray-400">{log.chain}</span>
                                        <span className="text-[9px] text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                    <p className="text-[11px] font-medium leading-relaxed">{log.message}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="col-span-2 hidden lg:block" />

                    {/* Stats & AI */}
                    <div className="col-span-1 space-y-6">
                        <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-8 flex items-center gap-3">
                                <Cpu className="w-4 h-4 text-purple-400" />
                                Network Metrics
                            </h2>
                            <div className="space-y-8">
                                <div>
                                    <label className="text-[9px] uppercase font-black text-gray-500 block mb-1">Swarm Agents</label>
                                    <div className="text-4xl font-black text-white tracking-tighter">{stats.activeNodes?.toLocaleString() ?? '0'}</div>
                                </div>
                                <div>
                                    <label className="text-[9px] uppercase font-black text-gray-500 block mb-1">Users / Bot</label>
                                    <div className="text-xl font-black text-white tracking-tighter">{stats.totalUsers?.toLocaleString() ?? '0'} / {stats.telegramLinked ?? '0'}</div>
                                </div>
                                <div>
                                    <label className="text-[9px] uppercase font-black text-gray-500 block mb-1">Throughput</label>
                                    <div className="text-3xl font-black text-amber-400 tracking-tighter">{stats.tps.toFixed(1)} <span className="text-sm">TPS</span></div>
                                </div>
                                <div>
                                    <label className="text-[9px] uppercase font-black text-gray-500 block mb-1">Global TVL Secured</label>
                                    <div className="text-3xl font-black text-emerald-400 tracking-tighter">${(stats.tvl / 1e6).toFixed(1)}M</div>
                                </div>
                                <div>
                                    <label className="text-[9px] uppercase font-black text-gray-500 block mb-1">Revenue 24h</label>
                                    <div className="text-2xl font-black text-amber-400 tracking-tighter flex items-center gap-1">
                                        <DollarSign className="w-5 h-5" />
                                        {stats.revenue24h?.toFixed(2) ?? '0.00'} GSTD
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[9px] uppercase font-black text-gray-500 block mb-1">Gold Reserve</label>
                                    <div className="text-2xl font-black text-yellow-500 tracking-tighter flex items-center gap-1">
                                        <Coins className="w-5 h-5" />
                                        {stats.goldReserve?.toFixed(2) ?? '0.00'} GSTD
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gradient-to-br from-purple-900/40 to-blue-900/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-3xl" />
                            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-400 mb-6 flex items-center gap-3">
                                <Zap className="w-4 h-4 text-amber-400" />
                                Organism Health
                            </h2>
                            <div className="relative z-10">
                                <div className="text-3xl font-black uppercase tracking-tighter leading-tight mb-2">{(health * 100).toFixed(1)}%</div>
                                {lastDecision && (
                                    <div className="text-[9px] uppercase font-bold text-amber-400/80 mb-1">Decision: {lastDecision}</div>
                                )}
                                <div className="text-[10px] uppercase font-bold text-gray-400 mb-6 truncate">{analysis}</div>
                                <div className="flex items-center gap-4">
                                    <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 animate-shimmer" style={{ width: `${health * 100}%` }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>

                <footer className="mt-8 border-t border-white/10 pt-6 flex justify-between items-center pointer-events-auto">
                    <div className="flex gap-8">
                        {['TON', 'Solana', 'XRPL'].map(c => (
                            <div key={c} className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                <span className="text-[9px] font-black uppercase text-gray-500">{c} Gateway</span>
                            </div>
                        ))}
                    </div>
                    <div className="text-[9px] font-black text-gray-600 uppercase tracking-widest">
                        GSTD SWARM CONTROL • NODE_ID: {typeof window !== 'undefined' ? window.location.hostname : 'GENESIS'}
                    </div>
                </footer>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        @keyframes shimmer { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
        .animate-shimmer { animation: shimmer 2s infinite ease-in-out; }
      `}} />
        </div>
    );
}
