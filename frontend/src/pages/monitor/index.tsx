import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import {
    Globe2, Sprout, HeartPulse, Droplets, BookOpen, Sun,
    Activity, ShieldCheck, Code, Zap, Database, CheckCircle,
    Target, Dna, ArrowRight, TrendingUp, Cpu, Star, Lock, BrainCircuit, Share2, Radio, AlertTriangle, MapPin, Network
} from 'lucide-react';
import { toast } from '../../lib/toast';
import { apiGet, apiPost } from '../../lib/apiClient';

interface GlobalSignal {
    id: string;
    title: string;
    description: string;
    source: string;
    severity: 'critical' | 'high' | 'medium';
    location: string;
    dataVolume: string;
    icon: any;
    color: string;
    bgColor: string;
    starsCost: number;    // Cost in Telegram Stars
    gstdReward: number;   // Equivalent reward for Swarm in GSTD
    platformFee: number;  // Fee sent to Admin Wallet (Gold Backing)
    category: string;
}

interface LogEntry {
    id: string;
    type: string;
    chain: string;
    message: string;
    timestamp: string;
}

const ACTIVE_SIGNALS: GlobalSignal[] = [
    {
        id: 'gdelt_crisis',
        title: 'GDELT Crisis Event Mapping',
        description: 'Analyze massive global event logs (news, social, reports) to identify emerging humanitarian aid gaps and population displacement vectors.',
        source: 'GDELT Project (Global Database)',
        severity: 'critical',
        location: 'Global / MENA Focus',
        dataVolume: '14.2 TB / day',
        icon: Globe2, color: 'text-rose-400', bgColor: 'bg-rose-500/10',
        starsCost: 2000, gstdReward: 160, platformFee: 40, category: 'Humanitarian'
    },
    {
        id: 'nasa_eosdis',
        title: 'NASA EOSDIS Climate Anomaly Extraction',
        description: 'Process raw satellite imagery and atmospheric data to detect early signs of severe deforestation and extreme surface temperature anomalies.',
        source: 'NASA Earth Observation System',
        severity: 'high',
        location: 'Equatorial Band',
        dataVolume: '45.8 TB / week',
        icon: Sun, color: 'text-amber-400', bgColor: 'bg-amber-500/10',
        starsCost: 3500, gstdReward: 280, platformFee: 70, category: 'Ecological'
    },
    {
        id: 'who_pubmed',
        title: 'Epidemiological Pattern Matching',
        description: 'Semantic analysis of global medical literature and regional health reports to predict early-stage disease outbreak vectors.',
        source: 'WHO GHO & PubMed Central',
        severity: 'critical',
        location: 'Southeast Asia / Global',
        dataVolume: '2.4 TB / text',
        icon: HeartPulse, color: 'text-purple-400', bgColor: 'bg-purple-500/10',
        starsCost: 5000, gstdReward: 400, platformFee: 100, category: 'Medical AI'
    },
    {
        id: 'copernicus_marine',
        title: 'Copernicus Ocean Heatwave Modeling',
        description: 'Process deep oceanic temperature, drift, and salinity arrays to model the impact on marine ecosystems and global weather phenomena.',
        source: 'Copernicus Marine Service',
        severity: 'medium',
        location: 'Pacific & Atlantic Oceans',
        dataVolume: '8.1 TB / mo',
        icon: Droplets, color: 'text-cyan-400', bgColor: 'bg-cyan-500/10',
        starsCost: 1500, gstdReward: 120, platformFee: 30, category: 'Oceanography'
    },
    {
        id: 'osm_disaster',
        title: 'HOTOSM Disaster Zone Mapping',
        description: 'Identify damaged infrastructure, blocked roads, and safe zones from satellite signals in post-disaster areas to optimize rescue routing.',
        source: 'Humanitarian OpenStreetMap',
        severity: 'high',
        location: 'Current Disaster Zones',
        dataVolume: '1.2 TB / area',
        icon: MapPin, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10',
        starsCost: 1000, gstdReward: 80, platformFee: 20, category: 'Infrastructure'
    },
    {
        id: 'cern_physics',
        title: 'CERN Particle Collision Crunching',
        description: 'Process high-energy collision layer data to assist in foundational physics discovery and material science advancements for clean energy.',
        source: 'CERN Open Data Portal',
        severity: 'medium',
        location: 'Geneva / Virtual',
        dataVolume: '120 TB / batch',
        icon: Network, color: 'text-blue-400', bgColor: 'bg-blue-500/10',
        starsCost: 8000, gstdReward: 640, platformFee: 160, category: 'Physics & Energy'
    },
];

export default function HumanityMonitor() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [selectedSignal, setSelectedSignal] = useState<GlobalSignal | null>(null);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [purchaseStep, setPurchaseStep] = useState<number>(0);
    const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);
    const [stats, setStats] = useState({
        activeNodes: 0,
        gstdPrice: 0,
        dataProcessed: 0,
        health: 0.95
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const data = await apiGet<any>('/monitor/unified').catch(() => null);
                if (data) {
                    if (data.flows?.recent_events) {
                        setLiveLogs(data.flows.recent_events.slice(0, 10));
                    }
                    const eco = data.ecosystem || {};
                    const mkt = data.market || {};
                    const org = data.organism || {};
                    setStats({
                        activeNodes: eco.active_nodes || 15420,
                        gstdPrice: mkt.gstd_price_usd || 0.052,
                        dataProcessed: data.flows?.global_tps * 1.5 || 245.5, // TB Processed mock
                        health: org.health_score || 0.99
                    });
                }
            } catch (e) { }
        };
        fetchData();
        const interval = setInterval(fetchData, 4000);
        return () => clearInterval(interval);
    }, []);

    // Canvas Background (Global Signal Radar Effect)
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let ptime = 0;
        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', resize);
        resize();

        const signals: any[] = [];
        for (let i = 0; i < 30; i++) {
            signals.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                radius: 0,
                maxRadius: Math.random() * 100 + 50,
                speed: Math.random() * 0.5 + 0.2,
                color: ['rgba(14, 165, 233,', 'rgba(16, 185, 129,', 'rgba(244, 63, 94,'][Math.floor(Math.random() ** 2 * 3)] // weighted colors
            });
        }

        const animate = (time: number) => {
            if (time - ptime > 30) {
                ctx.fillStyle = 'rgba(2, 6, 23, 0.15)'; // Deep fading trail
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ptime = time;
            }

            signals.forEach((sig) => {
                sig.radius += sig.speed;
                if (sig.radius > sig.maxRadius) {
                    sig.radius = 0;
                    sig.x = Math.random() * canvas.width;
                    sig.y = Math.random() * canvas.height;
                }

                const alpha = (1 - (sig.radius / sig.maxRadius)) * 0.3;
                ctx.beginPath();
                ctx.arc(sig.x, sig.y, sig.radius, 0, Math.PI * 2);
                ctx.strokeStyle = sig.color + alpha + ')';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            });

            // Draw grid
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let x = 0; x < canvas.width; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
            for (let y = 0; y < canvas.height; y += 100) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
            ctx.stroke();

            animationFrameId = requestAnimationFrame(animate);
        };
        animationFrameId = requestAnimationFrame(animate);
        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    const handleAnalyzeSignal = async () => {
        if (!selectedSignal) return;
        setIsPurchasing(true);
        setPurchaseStep(1);

        try {
            const resp = await apiPost('/tasks/telegram-launch', {
                task_id: selectedSignal.id,
                stars_paid: selectedSignal.starsCost,
                reward_gstd: selectedSignal.gstdReward,
                admin_fee_gstd: selectedSignal.platformFee
            });

            if (resp.invoice_url) {
                setPurchaseStep(2);

                // Open real Telegram Telegram Stars invoice if in WebApp
                if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.openInvoice) {
                    (window as any).Telegram.WebApp.openInvoice(resp.invoice_url, (status: string) => {
                        if (status === 'paid') {
                            setPurchaseStep(3);
                            setTimeout(() => {
                                toast.success("Signal Routed to Swarm! " + selectedSignal.gstdReward + " GSTD locked for resolution. Insights will be saved to Collective Memory.");
                                setIsPurchasing(false);
                                setPurchaseStep(0);
                                setSelectedSignal(null);

                                setLiveLogs(prev => [{
                                    id: Math.random().toString(),
                                    type: 'SIGNAL_PROCESS',
                                    chain: 'SWARM',
                                    message: "[Signal Routing] " + selectedSignal.title + " assigned to Swarm.",
                                    timestamp: new Date().toISOString()
                                }, ...prev].slice(0, 15));
                            }, 2000);
                        } else {
                            toast.error('Payment ' + status);
                            setIsPurchasing(false);
                            setPurchaseStep(0);
                        }
                    });
                } else {
                    // Fallback for dev/external browser
                    window.open(resp.invoice_url, '_blank');
                    setPurchaseStep(3);
                    setTimeout(() => {
                        toast.success("Signal Routed to Swarm! (Fallback Mode)");
                        setIsPurchasing(false);
                        setPurchaseStep(0);
                        setSelectedSignal(null);
                    }, 2000);
                }
            } else {
                toast.error("Failed to generate invoice");
                setIsPurchasing(false);
                setPurchaseStep(0);
            }
        } catch (e: any) {
            toast.error('Failed to route signal: ' + (e?.message || 'Unknown error'));
            setIsPurchasing(false);
            setPurchaseStep(0);
        }
    };

    const getSeverityStyles = (severity: string) => {
        if (severity === 'critical') return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
        if (severity === 'high') return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
        return 'text-sky-400 bg-sky-500/10 border-sky-500/30';
    };

    return (
        <div className="bg-slate-950 text-white min-h-screen relative overflow-hidden font-sans antialiased selection:bg-sky-500/30">
            <Head>
                <title>Global Intelligence Monitor | GSTD</title>
            </Head>

            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-0" />

            <div className="relative z-10 flex flex-col h-screen p-6 overflow-y-auto custom-scrollbar">
                {/* Header */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                    <div className="flex items-center gap-5">
                        <div className="w-16 h-16 bg-slate-900/80 rounded-2xl flex items-center justify-center border border-slate-700/80 shadow-[0_0_30px_rgba(14,165,233,0.1)] backdrop-blur-md relative overflow-hidden">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.3)_0%,transparent_70%)] animate-pulse" />
                            <Radio className="w-8 h-8 text-sky-400 relative z-10" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black tracking-tight text-white drop-shadow-2xl flex items-center gap-3">
                                GLOBAL SIGNAL MONITOR
                                <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-bold text-sky-400 tracking-widest uppercase flex items-center gap-1.5 shadow-[0_0_10px_rgba(14,165,233,0.1)]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping absolute" />
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 relative" />
                                    Live Signals
                                </span>
                            </h1>
                            <p className="text-sm font-medium text-slate-400 mt-1 max-w-2xl leading-relaxed">
                                Real-time intelligence dashboard mapping global open-data signals. Use Telegram Stars to sponsor deeper Swarm analysis on critical anomalies. Extracted knowledge is permanently injected into the Collective Memory.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row items-end gap-3 md:gap-6">
                        <div className="flex gap-4">
                            <div className="px-5 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl backdrop-blur-xl flex items-center gap-3 shadow-xl">
                                <Database className="w-5 h-5 text-sky-400 opacity-70" />
                                <div className="flex flex-col items-start">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Data Processed</span>
                                    <span className="text-sm font-bold text-sky-400">{stats.dataProcessed.toFixed(1)} TB/day</span>
                                </div>
                            </div>
                            <div className="px-5 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl backdrop-blur-xl flex flex-col shadow-xl min-w-[120px]">
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Swarm Pulse</span>
                                <span className="text-sm font-bold text-sky-400">{stats.activeNodes.toLocaleString()} <span className="text-[10px] text-slate-500">Nodes</span></span>
                            </div>
                        </div>
                    </div>
                </header>

                <div className="flex flex-col lg:flex-row gap-8 flex-1 content-start pb-20">
                    {/* Signals Grid (Left) */}
                    <div className="w-full lg:w-3/4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {ACTIVE_SIGNALS.map((signal) => (
                            <div
                                key={signal.id}
                                className="group relative bg-slate-900/60 backdrop-blur-xl border border-slate-700/60 hover:border-slate-500/50 rounded-3xl p-6 transition-all duration-300 hover:shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col justify-between"
                            >
                                <div className={"absolute top-0 right-0 w-32 h-32 rounded-full blur-[70px] opacity-10 group-hover:opacity-20 transition-opacity duration-500 " + signal.bgColor} />

                                <div>
                                    <div className="flex items-start justify-between mb-4 relative z-10">
                                        <div className="flex flex-col gap-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={"text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border " + getSeverityStyles(signal.severity)}>
                                                    {signal.severity}
                                                </span>
                                                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                                    <MapPin className="w-3 h-3" /> {signal.location}
                                                </span>
                                            </div>
                                            <h2 className="text-lg font-bold text-slate-100 leading-tight mt-1 group-hover:text-white transition-colors">{signal.title}</h2>
                                        </div>
                                    </div>

                                    <div className="bg-slate-950/40 rounded-xl p-3 border border-slate-800/80 mb-4 relative z-10">
                                        <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Data Source</div>
                                        <div className="text-xs font-mono text-sky-400 flex items-center justify-between">
                                            <span>{signal.source}</span>
                                            <span className="text-slate-500">{signal.dataVolume}</span>
                                        </div>
                                    </div>

                                    <p className="text-xs text-slate-300 font-medium leading-relaxed mb-6 relative z-10">
                                        {signal.description}
                                    </p>
                                </div>

                                <div className="pt-5 border-t border-slate-800/80 flex flex-col gap-3 relative z-10">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-medium text-slate-400">Compute Reward</span>
                                        <span className="font-bold text-emerald-400 flex items-center gap-1">
                                            <Database className="w-3 h-3" /> {signal.gstdReward} GSTD
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => setSelectedSignal(signal)}
                                        className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-sky-500/50 text-sm font-bold text-white transition-all shadow-lg flex items-center justify-center gap-2 group/btn"
                                    >
                                        <Cpu className="w-4 h-4 text-sky-400 group-hover/btn:animate-pulse" />
                                        Process Signal ({signal.starsCost} <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 inline" />)
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Right Live Terminal */}
                    <div className="w-full lg:w-1/4">
                        <div className="h-full bg-slate-900/80 backdrop-blur-3xl border border-slate-700/60 rounded-3xl p-6 flex flex-col shadow-2xl relative group min-h-[500px]">
                            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-sky-400 mb-6 flex items-center gap-3">
                                <Activity className="w-4 h-4" />
                                Global Intake Feed
                            </h2>
                            <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                                {liveLogs.length === 0 ? (
                                    <div className="text-slate-500 text-xs text-center py-10 flex flex-col items-center gap-2">
                                        <Radio className="w-6 h-6 animate-pulse opacity-50" />
                                        Awaiting Global Transmissions...
                                    </div>
                                ) : (
                                    liveLogs.map((log, index) => (
                                        <div key={index} className="pb-4 border-b border-slate-800/80 last:border-0 relative">
                                            <div className="flex justify-between items-center mb-1.5">
                                                <span className="text-[9px] font-black uppercase text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">{log.chain || 'NODE'}</span>
                                                <span className="text-[10px] text-slate-500 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                            </div>
                                            <p className="text-xs font-medium leading-relaxed text-slate-300 relative pl-3">
                                                <span className="absolute left-0 top-1.5 w-1 h-1 bg-sky-500 rounded-full shadow-[0_0_5px_rgba(14,165,233,0.8)]" />
                                                {log.message}
                                            </p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Signal Process Modal */}
            {selectedSignal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => !isPurchasing && setSelectedSignal(null)} />
                    <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-md w-full relative z-10 shadow-[0_0_60px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in duration-300">

                        <div className={"w-16 h-16 rounded-2xl border flex items-center justify-center mb-6 mx-auto relative " + selectedSignal.bgColor + " " + getSeverityStyles(selectedSignal.severity).split(' ')[2]}>
                            {isPurchasing && purchaseStep < 3 ? (
                                <Zap className={"w-8 h-8 animate-pulse " + selectedSignal.color} />
                            ) : isPurchasing && purchaseStep === 3 ? (
                                <CheckCircle className={"w-8 h-8 " + selectedSignal.color} />
                            ) : (
                                <selectedSignal.icon className={"w-8 h-8 " + selectedSignal.color} />
                            )}
                        </div>

                        <h3 className="text-xl font-black text-white text-center mb-2">Sponsor Signal Analysis</h3>
                        <p className="text-slate-400 text-center text-sm font-medium mb-8 leading-relaxed px-2">
                            Deploy the Swarm to structure and solve this open-source anomaly. Insights are permanently archived for humanity.
                        </p>

                        <div className="bg-slate-950/80 rounded-2xl p-5 mb-8 border border-slate-800 shadow-inner">
                            <div className="flex justify-between items-start mb-4 gap-4">
                                <span className="text-sm font-medium text-slate-400 flex items-center gap-2 whitespace-nowrap">
                                    <Target className="w-4 h-4" /> Signal Focus
                                </span>
                                <span className="text-sm font-bold text-white text-right leading-tight">{selectedSignal.title}</span>
                            </div>

                            <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-800/80">
                                <span className="text-sm font-medium text-slate-400 flex items-center gap-2">
                                    <Share2 className="w-4 h-4" /> Save To
                                </span>
                                <span className="text-xs font-bold text-sky-400 bg-sky-500/10 px-2 py-1 rounded border border-sky-500/20">
                                    Collective Memory DB
                                </span>
                            </div>

                            <div className="flex justify-between items-center mb-3">
                                <span className="text-sm font-medium text-slate-400 flex items-center gap-2">
                                    <Database className="w-4 h-4 text-emerald-400" /> Reward to Swarm Nodes
                                </span>
                                <span className="text-sm font-bold text-emerald-400">+{selectedSignal.gstdReward} GSTD</span>
                            </div>
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-sm font-medium text-slate-400 flex items-center gap-2">
                                    <Lock className="w-4 h-4 text-amber-400" /> Platform Gold Fund
                                </span>
                                <span className="text-sm font-bold text-amber-400">+{selectedSignal.platformFee} GSTD</span>
                            </div>

                            <div className="flex justify-between items-center pt-4 border-t border-slate-800 mt-2">
                                <span className="text-sm font-bold text-white">Sponsorship Cost</span>
                                <span className="text-lg font-black text-white flex items-center gap-1.5 bg-slate-800 px-3 py-1 rounded-lg border border-slate-600">
                                    {selectedSignal.starsCost} <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                                </span>
                            </div>
                        </div>

                        {isPurchasing ? (
                            <div className="flex flex-col gap-4 mb-2">
                                <div className="h-12 flex items-center justify-center bg-slate-800/50 rounded-xl border border-slate-700">
                                    <span className="text-sm font-bold text-sky-400 animate-pulse flex items-center gap-2">
                                        {purchaseStep === 1 && "Confirming Telegram Stars..."}
                                        {purchaseStep === 2 && "Minting GSTD & Locking Funds..."}
                                        {purchaseStep === 3 && "Signal Dispatched to Swarm!"}
                                    </span>
                                </div>
                                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-sky-500 transition-all duration-500 ease-out"
                                        style={{ width: ((purchaseStep / 3) * 100) + '%' }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="flex gap-4 mt-2">
                                <button
                                    onClick={() => setSelectedSignal(null)}
                                    className="flex-1 px-4 py-3.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-sm font-bold text-slate-300 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAnalyzeSignal}
                                    className="flex-[2] px-4 py-3.5 rounded-xl text-sm font-bold text-slate-900 transition-all shadow-[0_0_20px_rgba(14,165,233,0.2)] bg-sky-400 hover:bg-sky-300 flex items-center justify-center gap-2 group/pay"
                                >
                                    <Star className="w-4 h-4 text-slate-900 group-hover/pay:scale-110 transition-transform" />
                                    Pay with Stars
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(51, 65, 85, 0.5); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(71, 85, 105, 0.8); }
        `}} />
        </div>
    );
}
