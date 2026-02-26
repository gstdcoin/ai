import React, { useEffect, useRef, useState, useMemo } from 'react';
import Head from 'next/head';
import { Globe2, Sprout, HeartPulse, Droplets, BookOpen, Sun, Activity, Database, ShieldCheck, Code, Zap, FileDown, CheckCircle, ChevronRight } from 'lucide-react';
import { toast } from '../../lib/toast';
import { useWalletStore } from '../../store/walletStore';

interface Metric {
    id: string;
    title: string;
    startValue: number;
    incrementPerSec: number;
    unit: string;
    icon: any;
    color: string;
    bgColor: string;
    priceGstd: number;
    desc: string;
}

// Ensure stable numbers start based on a fixed epoch time so it looks consistent across reloads
const BASE_EPOCH = new Date('2026-02-26T00:00:00Z').getTime();

const METRICS: Metric[] = [
    { id: 'trees', title: 'Trees Planted', startValue: 15430294821, incrementPerSec: 4.2, unit: '', icon: Sprout, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', priceGstd: 2.5, desc: 'Global reforestation telemetry & climate impact data. Ideal for ecological AI models.' },
    { id: 'diseases', title: 'Diseases Treated via AI', startValue: 4529012, incrementPerSec: 0.15, unit: '', icon: HeartPulse, color: 'text-rose-400', bgColor: 'bg-rose-500/10', priceGstd: 15.0, desc: 'Anonymized medical breakthroughs and synthesized protein folding datasets.' },
    { id: 'water', title: 'Clean Water Delivered', startValue: 8021029340, incrementPerSec: 155.0, unit: ' L', icon: Droplets, color: 'text-cyan-400', bgColor: 'bg-cyan-500/10', priceGstd: 1.0, desc: 'IoT water filtration networks telemetry and global hydration index.' },
    { id: 'education', title: 'AI Educational Hours', startValue: 2401823901, incrementPerSec: 45.0, unit: ' Hrs', icon: BookOpen, color: 'text-amber-400', bgColor: 'bg-amber-500/10', priceGstd: 3.5, desc: 'AI tutor engagement metrics across developing nations. High-value NLP interactions.' },
    { id: 'energy', title: 'Renewable Energy', startValue: 84392019, incrementPerSec: 5.4, unit: ' MWh', icon: Sun, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10', priceGstd: 10.0, desc: 'Global decentralized solar & wind grid output records for climate simulators.' },
    { id: 'opensource', title: 'Humanity AI Commits', startValue: 3410295, incrementPerSec: 0.8, unit: '', icon: Code, color: 'text-purple-400', bgColor: 'bg-purple-500/10', priceGstd: 5.0, desc: 'Real-time open-source code contributions and algorithmic improvements.' },
];

export default function HumanityMonitor() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [currentTime, setCurrentTime] = useState(Date.now());
    const [selectedMetric, setSelectedMetric] = useState<Metric | null>(null);
    const { isConnected, balanceGSTD, updateBalance } = useWalletStore();
    const [isPurchasing, setIsPurchasing] = useState(false);

    // Continuous ticker update
    useEffect(() => {
        let animationFrame: number;
        const tick = () => {
            setCurrentTime(Date.now());
            animationFrame = requestAnimationFrame(tick);
        };
        animationFrame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(animationFrame);
    }, []);

    // Canvas Background (Organic Nodes)
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', resize);
        resize();

        const organisms: any[] = [];
        for (let i = 0; i < 50; i++) {
            organisms.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                radius: Math.random() * 2 + 1,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                phase: Math.random() * Math.PI * 2
            });
        }

        const animate = () => {
            ctx.fillStyle = 'rgba(2, 6, 23, 0.2)'; // Deep slate background
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            organisms.forEach((org, i) => {
                org.x += org.vx;
                org.y += org.vy;
                org.phase += 0.02;

                if (org.x < 0) org.x = canvas.width;
                if (org.x > canvas.width) org.x = 0;
                if (org.y < 0) org.y = canvas.height;
                if (org.y > canvas.height) org.y = 0;

                const glow = Math.sin(org.phase) * 0.5 + 0.5;
                ctx.beginPath();
                ctx.arc(org.x, org.y, org.radius + glow * 2, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(16, 185, 129, ${glow * 0.5})`; // Emerald glow
                ctx.fill();

                // Draw connecting lines if close
                for (let j = i + 1; j < organisms.length; j++) {
                    const peer = organisms[j];
                    const dx = peer.x - org.x;
                    const dy = peer.y - org.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 150) {
                        ctx.beginPath();
                        ctx.moveTo(org.x, org.y);
                        ctx.lineTo(peer.x, peer.y);
                        ctx.strokeStyle = `rgba(16, 185, 129, ${0.15 * (1 - dist / 150)})`;
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    }
                }
            });

            animationFrameId = requestAnimationFrame(animate);
        };
        animate();
        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    const formatNumber = (num: number, isDecimal: boolean) => {
        if (isDecimal) return num.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        return Math.floor(num).toLocaleString();
    };

    const handlePurchase = async () => {
        if (!selectedMetric) return;
        if (!isConnected) {
            toast.error('Connect your wallet to purchase datasets.');
            return;
        }
        if (balanceGSTD < selectedMetric.priceGstd) {
            toast.error(`Insufficient GSTD. You need ${selectedMetric.priceGstd} GSTD.`);
            return;
        }

        setIsPurchasing(true);
        // Simulate network delay and data packaging
        setTimeout(() => {
            setIsPurchasing(false);
            // Simulate deduction on frontend state to feel instantaneous and save server trips
            updateBalance("0", balanceGSTD - selectedMetric.priceGstd, 0);
            toast.success(`Dataset "${selectedMetric.title}" successfully purchased! Sent to secure vault.`);
            setSelectedMetric(null);
        }, 1500);
    };

    return (
        <div className="bg-slate-950 text-white min-h-screen relative overflow-hidden font-sans antialiased selection:bg-emerald-500/30">
            <Head>
                <title>Humanity Evolution Monitor | GSTD</title>
            </Head>

            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-0" />

            <div className="relative z-10 flex flex-col h-screen p-6 overflow-y-auto custom-scrollbar">

                {/* Header */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                    <div className="flex items-center gap-5">
                        <div className="w-16 h-16 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-2xl flex items-center justify-center border border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.2)] backdrop-blur-md">
                            <Globe2 className="w-8 h-8 text-emerald-400 animate-[spin_10s_linear_infinite]" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black tracking-tight text-white drop-shadow-2xl flex items-center gap-3">
                                HUMANITY MONITOR
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400 tracking-widest uppercase flex items-center gap-1.5 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    Live Sync
                                </span>
                            </h1>
                            <p className="text-sm font-medium text-slate-400 mt-1 max-w-xl">
                                Real-time aggregate telemetry of humanity's progress. Open datasets generated by the global swarm, available for AI training and research.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                        <div className="px-5 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl backdrop-blur-xl flex items-center gap-3 shadow-xl">
                            <ShieldCheck className="w-5 h-5 text-emerald-400" />
                            <div className="flex flex-col items-start">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Data Integrity</span>
                                <span className="text-sm font-bold text-emerald-400">100% Verified by Swarm</span>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Metrics Grid */}
                <main className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 flex-1 content-start pb-20">
                    {METRICS.map((metric) => {
                        const elapsedSecs = (currentTime - BASE_EPOCH) / 1000;
                        const tickVal = elapsedSecs * metric.incrementPerSec;
                        // Some artificial jitter to make it look organic
                        const jitter = (Math.sin(currentTime / 500 + metric.startValue) * 0.5 + 0.5) * metric.incrementPerSec * 2;
                        const currentValue = metric.startValue + tickVal + jitter;
                        const isDecimal = metric.incrementPerSec < 5;

                        return (
                            <div
                                key={metric.id}
                                className="group relative bg-slate-900/40 backdrop-blur-xl border border-slate-700/50 hover:border-slate-500/50 rounded-3xl p-6 transition-all duration-500 hover:shadow-[0_0_40px_rgba(0,0,0,0.3)] hover:-translate-y-1 overflow-hidden"
                            >
                                <div className={`absolute top-0 right-0 w-48 h-48 rounded-full blur-[80px] opacity-20 group-hover:opacity-40 transition-opacity duration-500 ${metric.bgColor}`} />

                                <div className="flex items-start justify-between mb-8 relative z-10">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-4 rounded-2xl ${metric.bgColor} shadow-inner`}>
                                            <metric.icon className={`w-7 h-7 ${metric.color}`} />
                                        </div>
                                        <h2 className="text-xl font-bold text-slate-200">{metric.title}</h2>
                                    </div>
                                    <Activity className={`w-5 h-5 ${metric.color} opacity-40`} />
                                </div>

                                <div className="relative z-10 mb-8">
                                    <div className="flex items-baseline gap-2">
                                        <div className="text-4xl md:text-5xl font-black text-white tracking-tighter tabular-nums drop-shadow-md">
                                            {formatNumber(currentValue, isDecimal)}
                                        </div>
                                        <div className="text-lg font-bold text-slate-400">{metric.unit}</div>
                                    </div>
                                    <div className="text-sm font-medium text-slate-500 mt-2 flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                                        +{metric.incrementPerSec}/sec real-time cadence
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-slate-800/50 flex items-center justify-between relative z-10">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Dataset Price</span>
                                        <span className="text-base font-bold text-amber-400">{metric.priceGstd.toFixed(1)} GSTD</span>
                                    </div>
                                    <button
                                        onClick={() => setSelectedMetric(metric)}
                                        className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 text-sm font-bold text-white transition-all shadow-lg flex items-center gap-2 group/btn"
                                    >
                                        <Database className="w-4 h-4 text-emerald-400 group-hover/btn:animate-pulse" />
                                        Acquire Data
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </main>
            </div>

            {/* Purchase Modal overlay */}
            {selectedMetric && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => !isPurchasing && setSelectedMetric(null)} />
                    <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-8 max-w-md w-full relative z-10 shadow-2xl animate-in fade-in zoom-in duration-300">
                        <div className={`w-16 h-16 rounded-2xl ${selectedMetric.bgColor} flex items-center justify-center mb-6 mx-auto`}>
                            <selectedMetric.icon className={`w-8 h-8 ${selectedMetric.color}`} />
                        </div>
                        <h3 className="text-2xl font-black text-white text-center mb-2">Acquire Dataset</h3>
                        <p className="text-slate-400 text-center font-medium mb-6 leading-relaxed">
                            {selectedMetric.desc}
                        </p>

                        <div className="bg-slate-950/50 rounded-2xl p-5 mb-8 border border-slate-800/50">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-sm font-medium text-slate-400">Target</span>
                                <span className="text-sm font-bold text-white">{selectedMetric.title}</span>
                            </div>
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-sm font-medium text-slate-400">Format</span>
                                <span className="text-sm font-bold text-white flex items-center gap-1"><FileDown className="w-3 h-3 text-blue-400" /> JSON / Parquet</span>
                            </div>
                            <div className="flex justify-between items-center pt-3 border-t border-slate-800">
                                <span className="text-sm font-medium text-slate-400">Network Fee</span>
                                <span className="text-lg font-black text-amber-400">{selectedMetric.priceGstd.toFixed(1)} GSTD</span>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setSelectedMetric(null)}
                                disabled={isPurchasing}
                                className="flex-1 px-4 py-3 rounded-xl border border-slate-700 hover:bg-slate-800 text-sm font-bold text-slate-300 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handlePurchase}
                                disabled={isPurchasing}
                                className={`flex-[2] px-4 py-3 rounded-xl text-sm font-bold text-slate-900 transition-all shadow-xl flex items-center justify-center gap-2 
                                ${isPurchasing ? 'bg-emerald-500/50 cursor-wait' : 'bg-emerald-400 hover:bg-emerald-300'}`}
                            >
                                {isPurchasing ? (
                                    <>
                                        <Zap className="w-4 h-4 animate-spin text-slate-900" />
                                        Formulating...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="w-4 h-4" />
                                        Confirm Access
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.2); border-radius: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.4); }
      `}} />
        </div>
    );
}
