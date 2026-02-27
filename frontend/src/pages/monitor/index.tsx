import React, { useEffect, useRef, useState, useMemo } from 'react';
import Head from 'next/head';
import {
    Globe2, Sprout, HeartPulse, Droplets, BookOpen, Sun,
    Activity, ShieldCheck, Code, Zap, Database, CheckCircle,
    Target, Dna, ArrowRight, TrendingUp, Cpu, Star, Lock, BrainCircuit, Share2, Radio, AlertTriangle, MapPin, Network,
    Satellite, Microscope, Wind, Waves, Shield, Search, Filter, BarChart3, Users, Clock, ChevronRight, ExternalLink
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
    starsCost: number;
    gstdReward: number;
    platformFee: number;
    category: string;
    progress?: number;
    contributors?: number;
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
        id: 'gdelt_crisis', title: 'GDELT Crisis Event Mapping',
        description: 'Analyze massive global event logs (news, social, reports) to identify emerging humanitarian aid gaps and population displacement vectors.',
        source: 'GDELT Project (Global Database)', severity: 'critical', location: 'Global / MENA Focus',
        dataVolume: '14.2 TB / day', icon: Globe2, color: 'text-rose-400', bgColor: 'bg-rose-500/10',
        starsCost: 2000, gstdReward: 160, platformFee: 40, category: 'Humanitarian',
        progress: 34, contributors: 127
    },
    {
        id: 'nasa_eosdis', title: 'NASA Climate Anomaly Extraction',
        description: 'Process raw satellite imagery and atmospheric data to detect early signs of severe deforestation and extreme surface temperature anomalies.',
        source: 'NASA Earth Observation System', severity: 'high', location: 'Equatorial Band',
        dataVolume: '45.8 TB / week', icon: Sun, color: 'text-amber-400', bgColor: 'bg-amber-500/10',
        starsCost: 3500, gstdReward: 280, platformFee: 70, category: 'Ecological',
        progress: 61, contributors: 89
    },
    {
        id: 'who_pubmed', title: 'Epidemiological Pattern Matching',
        description: 'Semantic analysis of global medical literature and regional health reports to predict early-stage disease outbreak vectors.',
        source: 'WHO GHO & PubMed Central', severity: 'critical', location: 'Southeast Asia / Global',
        dataVolume: '2.4 TB / text', icon: HeartPulse, color: 'text-purple-400', bgColor: 'bg-purple-500/10',
        starsCost: 5000, gstdReward: 400, platformFee: 100, category: 'Medical AI',
        progress: 18, contributors: 214
    },
    {
        id: 'alphafold_protein', title: 'Complex Protein Folding (Orphan Diseases)',
        description: 'Perform immense permutations to predict 3D protein structures for rare uncurable genetic diseases, accelerating drug discovery.',
        source: 'Global Genetic Banks', severity: 'critical', location: 'Global / Decentralized',
        dataVolume: '120 TB / mo', icon: Dna, color: 'text-emerald-300', bgColor: 'bg-emerald-400/10',
        starsCost: 8000, gstdReward: 640, platformFee: 160, category: 'Life Science',
        progress: 7, contributors: 341
    },
    {
        id: 'seismic_array', title: 'Global Seismic Anomaly Detection',
        description: 'Analyze real-time low-frequency tectonic data from global seismograph networks to find micro-patterns preceding major earthquakes.',
        source: 'IRIS & Global Seismographic Network', severity: 'high', location: 'Pacific Ring of Fire',
        dataVolume: '18.5 TB / day', icon: Activity, color: 'text-orange-400', bgColor: 'bg-orange-500/10',
        starsCost: 4000, gstdReward: 320, platformFee: 80, category: 'Geophysics',
        progress: 52, contributors: 156
    },
    {
        id: 'darknet_tracker', title: 'Human Trafficking Vector Analysis',
        description: 'NLP and image hash analysis across Dark Web scrapes to identify illicit supply chains and assist global law enforcement anonymously.',
        source: 'OSINT Protocol Drops', severity: 'critical', location: 'Shadow Web / Global',
        dataVolume: '3.1 TB / batch', icon: ShieldCheck, color: 'text-fuchsia-400', bgColor: 'bg-fuchsia-500/10',
        starsCost: 6000, gstdReward: 480, platformFee: 120, category: 'Cyber Security',
        progress: 42, contributors: 78
    },
    {
        id: 'deepfake_firewall', title: 'Real-Time AGI Deception Filter',
        description: 'Run adversarial generative models to detect synthetic media (video/audio) designed to manipulate elections and stock markets.',
        source: 'Global Social Firehose', severity: 'high', location: 'North America / EU',
        dataVolume: '50.1 TB / week', icon: BrainCircuit, color: 'text-cyan-300', bgColor: 'bg-cyan-400/10',
        starsCost: 2500, gstdReward: 200, platformFee: 50, category: 'Information Security',
        progress: 71, contributors: 203
    },
    {
        id: 'cern_physics', title: 'CERN Particle Collision Crunching',
        description: 'Process high-energy collision data to assist in foundational physics discovery and material science advancements for clean energy.',
        source: 'CERN Open Data Portal', severity: 'medium', location: 'Geneva / Virtual',
        dataVolume: '120 TB / batch', icon: Network, color: 'text-blue-400', bgColor: 'bg-blue-500/10',
        starsCost: 8000, gstdReward: 640, platformFee: 160, category: 'Physics & Energy',
        progress: 13, contributors: 92
    },
    {
        id: 'copernicus_marine', title: 'Copernicus Ocean Heatwave Modeling',
        description: 'Process deep oceanic temperature, drift, and salinity arrays to model the impact on marine ecosystems and global weather phenomena.',
        source: 'Copernicus Marine Service', severity: 'medium', location: 'Pacific & Atlantic Oceans',
        dataVolume: '8.1 TB / mo', icon: Droplets, color: 'text-teal-400', bgColor: 'bg-teal-500/10',
        starsCost: 1500, gstdReward: 120, platformFee: 30, category: 'Oceanography',
        progress: 88, contributors: 64
    },
    {
        id: 'osm_disaster', title: 'HOTOSM Disaster Zone Mapping',
        description: 'Identify damaged infrastructure, blocked roads, and safe zones from satellite signals in post-disaster areas to optimize rescue routing.',
        source: 'Humanitarian OpenStreetMap', severity: 'high', location: 'Current Disaster Zones',
        dataVolume: '1.2 TB / area', icon: MapPin, color: 'text-red-400', bgColor: 'bg-red-500/10',
        starsCost: 1000, gstdReward: 80, platformFee: 20, category: 'Infrastructure',
        progress: 95, contributors: 48
    },
    {
        id: 'wildfire_sentinel', title: 'Wildfire Early Detection Grid',
        description: 'Cross-reference Sentinel-2 thermal bands and MODIS hotspot data with wind models to predict wildfire spread within 6-hour windows.',
        source: 'ESA Sentinel-2 & FIRMS', severity: 'critical', location: 'California / Australia / Siberia',
        dataVolume: '22.7 TB / week', icon: AlertTriangle, color: 'text-orange-300', bgColor: 'bg-orange-400/10',
        starsCost: 3000, gstdReward: 240, platformFee: 60, category: 'Ecological',
        progress: 45, contributors: 112
    },
    {
        id: 'space_debris', title: 'LEO Space Debris Collision Avoidance',
        description: 'Track 40,000+ orbital debris objects and predict collision probabilities for active satellites and the ISS using Swarm-distributed orbit propagation.',
        source: 'US Space Command TLE Data', severity: 'high', location: 'Low Earth Orbit',
        dataVolume: '5.3 TB / day', icon: Satellite, color: 'text-indigo-400', bgColor: 'bg-indigo-500/10',
        starsCost: 4500, gstdReward: 360, platformFee: 90, category: 'Space',
        progress: 29, contributors: 67
    },
    {
        id: 'antibiotic_resistance', title: 'Antimicrobial Resistance Genome Scan',
        description: 'Sequence-align bacterial genomes from hospital wastewater samples worldwide to map the spread of antibiotic-resistant superbug mutations.',
        source: 'NCBI SRA & CARD Database', severity: 'critical', location: 'Global Hospital Networks',
        dataVolume: '35 TB / batch', icon: Microscope, color: 'text-lime-400', bgColor: 'bg-lime-500/10',
        starsCost: 6500, gstdReward: 520, platformFee: 130, category: 'Medical AI',
        progress: 22, contributors: 189
    },
    {
        id: 'air_quality_mesh', title: 'Urban Air Quality Mesh Intelligence',
        description: 'Aggregate and normalize low-cost PM2.5/PM10 sensor networks across 12,000 cities to build real-time AQI maps with health risk heatmaps.',
        source: 'OpenAQ & PurpleAir APIs', severity: 'medium', location: '12,000+ Cities Worldwide',
        dataVolume: '3.8 TB / day', icon: Wind, color: 'text-sky-300', bgColor: 'bg-sky-400/10',
        starsCost: 1200, gstdReward: 96, platformFee: 24, category: 'Ecological',
        progress: 76, contributors: 310
    },
    {
        id: 'financial_contagion', title: 'Systemic Financial Contagion Model',
        description: 'Simulate cascading bank failures across 200+ interconnected institutions using real-time CDS spreads and interbank exposure data.',
        source: 'BIS & ECB Open Data', severity: 'high', location: 'Global Financial System',
        dataVolume: '1.5 TB / cycle', icon: TrendingUp, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10',
        starsCost: 5000, gstdReward: 400, platformFee: 100, category: 'Finance & Risk',
        progress: 55, contributors: 73
    },
    {
        id: 'ocean_plastic', title: 'Ocean Plastic Drift Prediction',
        description: 'Model microplastic dispersion using ocean current data from Argo floats and satellite altimetry to predict accumulation zones and cleanup routes.',
        source: 'Argo Float Network & NOAA', severity: 'medium', location: 'Pacific Gyre / Indian Ocean',
        dataVolume: '6.2 TB / mo', icon: Waves, color: 'text-cyan-400', bgColor: 'bg-cyan-500/10',
        starsCost: 2000, gstdReward: 160, platformFee: 40, category: 'Oceanography',
        progress: 63, contributors: 95
    },
];

const CATEGORIES = ['All', ...Array.from(new Set(ACTIVE_SIGNALS.map(s => s.category)))];

export default function HumanityMonitor() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [selectedSignal, setSelectedSignal] = useState<GlobalSignal | null>(null);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [purchaseStep, setPurchaseStep] = useState<number>(0);
    const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);
    const [activeCategory, setActiveCategory] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [stats, setStats] = useState({
        activeNodes: 0, gstdPrice: 0, dataProcessed: 0, health: 0.95,
        totalUsers: 0, tasksCompleted: 0, totalBurned: 0
    });

    const filteredSignals = useMemo(() => {
        return ACTIVE_SIGNALS.filter(s => {
            if (activeCategory !== 'All' && s.category !== activeCategory) return false;
            if (searchQuery && !s.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
                !s.description.toLowerCase().includes(searchQuery.toLowerCase()) &&
                !s.category.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            return true;
        });
    }, [activeCategory, searchQuery]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const data = await apiGet<any>('/monitor/unified').catch(() => null);
                if (data) {
                    if (data.flows?.recent_events) setLiveLogs(data.flows.recent_events.slice(0, 15));
                    const eco = data.ecosystem || {};
                    const mkt = data.market || {};
                    const org = data.organism || {};
                    setStats({
                        activeNodes: eco.active_nodes || eco.active_devices || 0,
                        gstdPrice: mkt.gstd_price_usd || 0,
                        dataProcessed: (data.flows?.global_tps || 0) * 1.5,
                        health: org.health_score || 0.66,
                        totalUsers: eco.total_users || 0,
                        tasksCompleted: eco.tasks_completed || 0,
                        totalBurned: mkt.total_burned || 0
                    });
                }
            } catch (e) { }
        };
        fetchData();
        const interval = setInterval(fetchData, 4000);
        return () => clearInterval(interval);
    }, []);

    // Canvas Background
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        let animationFrameId: number;
        let ptime = 0;
        const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
        window.addEventListener('resize', resize); resize();
        const signals: any[] = [];
        for (let i = 0; i < 40; i++) {
            signals.push({
                x: Math.random() * canvas.width, y: Math.random() * canvas.height,
                radius: 0, maxRadius: Math.random() * 120 + 40, speed: Math.random() * 0.4 + 0.15,
                color: ['rgba(14,165,233,', 'rgba(16,185,129,', 'rgba(244,63,94,', 'rgba(168,85,247,'][Math.floor(Math.random() ** 2 * 4)]
            });
        }
        const animate = (time: number) => {
            if (time - ptime > 30) {
                ctx.fillStyle = 'rgba(2, 6, 23, 0.12)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ptime = time;
            }
            signals.forEach((sig) => {
                sig.radius += sig.speed;
                if (sig.radius > sig.maxRadius) { sig.radius = 0; sig.x = Math.random() * canvas.width; sig.y = Math.random() * canvas.height; }
                const alpha = (1 - (sig.radius / sig.maxRadius)) * 0.25;
                ctx.beginPath(); ctx.arc(sig.x, sig.y, sig.radius, 0, Math.PI * 2);
                ctx.strokeStyle = sig.color + alpha + ')'; ctx.lineWidth = 1; ctx.stroke();
            });
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)'; ctx.lineWidth = 1; ctx.beginPath();
            for (let x = 0; x < canvas.width; x += 80) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
            for (let y = 0; y < canvas.height; y += 80) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
            ctx.stroke();
            animationFrameId = requestAnimationFrame(animate);
        };
        animationFrameId = requestAnimationFrame(animate);
        return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(animationFrameId); };
    }, []);

    const handleAnalyzeSignal = async () => {
        if (!selectedSignal) return;
        setIsPurchasing(true); setPurchaseStep(1);
        try {
            const resp = await apiPost('/tasks/telegram-launch', {
                task_id: selectedSignal.id, stars_paid: selectedSignal.starsCost,
                reward_gstd: selectedSignal.gstdReward, admin_fee_gstd: selectedSignal.platformFee
            });
            if (resp.invoice_url) {
                setPurchaseStep(2);
                if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.openInvoice) {
                    (window as any).Telegram.WebApp.openInvoice(resp.invoice_url, (status: string) => {
                        if (status === 'paid') {
                            setPurchaseStep(3);
                            setTimeout(() => {
                                toast.success("Signal Routed to Swarm! " + selectedSignal.gstdReward + " GSTD locked.");
                                setIsPurchasing(false); setPurchaseStep(0); setSelectedSignal(null);
                                setLiveLogs(prev => [{
                                    id: Math.random().toString(), type: 'SIGNAL_PROCESS', chain: 'SWARM',
                                    message: "[Signal Routing] " + selectedSignal.title + " assigned to Swarm.", timestamp: new Date().toISOString()
                                }, ...prev].slice(0, 15));
                            }, 2000);
                        } else { toast.error('Payment ' + status); setIsPurchasing(false); setPurchaseStep(0); }
                    });
                } else {
                    window.open(resp.invoice_url, '_blank');
                    setPurchaseStep(3);
                    setTimeout(() => { toast.success("Signal Routed!"); setIsPurchasing(false); setPurchaseStep(0); setSelectedSignal(null); }, 2000);
                }
            } else { toast.error("Failed to generate invoice"); setIsPurchasing(false); setPurchaseStep(0); }
        } catch (e: any) { toast.error('Failed: ' + (e?.message || 'Unknown')); setIsPurchasing(false); setPurchaseStep(0); }
    };

    const getSeverityStyles = (severity: string) => {
        if (severity === 'critical') return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
        if (severity === 'high') return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
        return 'text-sky-400 bg-sky-500/10 border-sky-500/30';
    };

    return (
        <div className="bg-slate-950 text-white min-h-screen relative overflow-hidden font-sans antialiased selection:bg-sky-500/30">
            <Head>
                <title>Global Intelligence Monitor — GSTD Sovereign Organism</title>
                <meta name="description" content="Real-time intelligence dashboard mapping 16 planetary-scale open-data signals. Sponsor Swarm analysis on critical anomalies with Telegram Stars." />
            </Head>

            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-0" />

            <div className="relative z-10 flex flex-col min-h-screen p-4 sm:p-6 overflow-y-auto custom-scrollbar">
                {/* Header */}
                <header className="flex flex-col gap-6 mb-8">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-slate-900/80 rounded-2xl flex items-center justify-center border border-slate-700/80 shadow-[0_0_30px_rgba(14,165,233,0.15)] backdrop-blur-md relative overflow-hidden flex-shrink-0">
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.3)_0%,transparent_70%)] animate-pulse" />
                                <Radio className="w-7 h-7 text-sky-400 relative z-10" />
                            </div>
                            <div>
                                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3 flex-wrap">
                                    GLOBAL SIGNAL MONITOR
                                    <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-bold text-sky-400 tracking-widest uppercase flex items-center gap-1.5 relative">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping absolute left-2" />
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 relative ml-0" />
                                        <span className="ml-1">{ACTIVE_SIGNALS.length} Live Signals</span>
                                    </span>
                                </h1>
                                <p className="text-sm text-slate-400 mt-1 max-w-xl leading-relaxed">
                                    Planetary intelligence dashboard. Sponsor deeper Swarm analysis on critical anomalies with Telegram Stars. Insights are permanently injected into Collective Memory.
                                </p>
                            </div>
                        </div>

                        {/* Stats Bar */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full md:w-auto">
                            {[
                                { label: 'Health', value: (stats.health * 100).toFixed(0) + '%', color: stats.health > 0.8 ? 'text-emerald-400' : 'text-amber-400', icon: Activity },
                                { label: 'Users', value: stats.totalUsers.toLocaleString(), color: 'text-violet-400', icon: Users },
                                { label: 'Tasks Done', value: stats.tasksCompleted.toLocaleString(), color: 'text-cyan-400', icon: CheckCircle },
                                { label: 'GSTD Price', value: '$' + stats.gstdPrice.toFixed(6), color: 'text-amber-400', icon: TrendingUp },
                            ].map((s, i) => (
                                <div key={i} className="px-4 py-3 bg-slate-900/60 border border-slate-700/50 rounded-xl backdrop-blur-xl flex items-center gap-3">
                                    <s.icon className={`w-4 h-4 ${s.color} opacity-60 flex-shrink-0`} />
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 truncate">{s.label}</span>
                                        <span className={`text-sm font-bold ${s.color} tabular-nums truncate`}>{s.value}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Search + Category Filters */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Search signals..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500/50 backdrop-blur-xl"
                            />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            {CATEGORIES.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setActiveCategory(cat)}
                                    className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${activeCategory === cat
                                        ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                                        : 'bg-slate-800/50 text-slate-400 border border-slate-700/30 hover:bg-slate-700/50'}`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>
                </header>

                <div className="flex flex-col lg:flex-row gap-6 flex-1 content-start pb-16">
                    {/* Signals Grid */}
                    <div className="w-full lg:w-3/4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                        {filteredSignals.map((signal) => (
                            <div
                                key={signal.id}
                                className="group relative bg-slate-900/60 backdrop-blur-xl border border-slate-700/60 hover:border-slate-500/50 rounded-2xl p-5 transition-all duration-300 hover:shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col justify-between"
                            >
                                <div className={"absolute top-0 right-0 w-28 h-28 rounded-full blur-[60px] opacity-10 group-hover:opacity-20 transition-opacity duration-500 " + signal.bgColor} />

                                <div>
                                    <div className="flex items-start justify-between mb-3 relative z-10">
                                        <div className="flex flex-col gap-1.5">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={"text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border " + getSeverityStyles(signal.severity)}>
                                                    {signal.severity}
                                                </span>
                                                <span className="text-[9px] font-bold text-slate-500 bg-slate-800/80 px-2 py-0.5 rounded">{signal.category}</span>
                                            </div>
                                            <h2 className="text-base font-bold text-slate-100 leading-tight mt-0.5 group-hover:text-white transition-colors">{signal.title}</h2>
                                        </div>
                                        <div className={`p-2 rounded-xl ${signal.bgColor} flex-shrink-0 ml-2`}>
                                            <signal.icon className={`w-5 h-5 ${signal.color}`} />
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 text-[10px] text-slate-500 mb-3 relative z-10">
                                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{signal.location}</span>
                                        <span className="flex items-center gap-1"><Database className="w-3 h-3" />{signal.dataVolume}</span>
                                    </div>

                                    <p className="text-xs text-slate-400 leading-relaxed mb-4 relative z-10 line-clamp-3">
                                        {signal.description}
                                    </p>

                                    {/* Progress Bar */}
                                    <div className="mb-4 relative z-10">
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase">Analysis Progress</span>
                                            <span className="text-[10px] font-bold text-slate-400">{signal.progress || 0}%</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-1000 ${(signal.progress || 0) > 80 ? 'bg-emerald-500' : (signal.progress || 0) > 40 ? 'bg-sky-500' : 'bg-violet-500'}`}
                                                style={{ width: `${signal.progress || 0}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between items-center mt-1.5">
                                            <span className="text-[10px] text-slate-600 flex items-center gap-1">
                                                <Users className="w-3 h-3" />{signal.contributors || 0} contributors
                                            </span>
                                            <span className="text-[10px] text-slate-600">{signal.source.split('(')[0].trim()}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-slate-800/80 flex flex-col gap-3 relative z-10">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-medium text-slate-400">Swarm Reward</span>
                                        <span className="font-bold text-emerald-400 flex items-center gap-1">
                                            <Database className="w-3 h-3" /> {signal.gstdReward} GSTD
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => setSelectedSignal(signal)}
                                        className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-sky-500/50 text-sm font-bold text-white transition-all flex items-center justify-center gap-2 group/btn"
                                    >
                                        <Cpu className="w-4 h-4 text-sky-400 group-hover/btn:animate-pulse" />
                                        Sponsor ({signal.starsCost} <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 inline" />)
                                    </button>
                                </div>
                            </div>
                        ))}

                        {filteredSignals.length === 0 && (
                            <div className="col-span-full text-center py-20 text-slate-500">
                                <Search className="w-10 h-10 mx-auto mb-4 opacity-30" />
                                <p className="text-lg font-bold">No signals match your search</p>
                                <p className="text-sm mt-1">Try a different category or search term</p>
                            </div>
                        )}
                    </div>

                    {/* Right Panel: Live Feed + Summary */}
                    <div className="w-full lg:w-1/4 flex flex-col gap-5">
                        {/* Summary Card */}
                        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-5">
                            <h3 className="text-xs font-black uppercase tracking-widest text-violet-400 mb-4 flex items-center gap-2">
                                <BarChart3 className="w-4 h-4" /> Network Overview
                            </h3>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-400">Active Signals</span>
                                    <span className="text-sm font-bold text-white">{ACTIVE_SIGNALS.length}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-400">Critical</span>
                                    <span className="text-sm font-bold text-rose-400">{ACTIVE_SIGNALS.filter(s => s.severity === 'critical').length}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-400">Total Contributors</span>
                                    <span className="text-sm font-bold text-emerald-400">{ACTIVE_SIGNALS.reduce((a, s) => a + (s.contributors || 0), 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-400">Total Reward Pool</span>
                                    <span className="text-sm font-bold text-amber-400">{ACTIVE_SIGNALS.reduce((a, s) => a + s.gstdReward, 0).toLocaleString()} GSTD</span>
                                </div>
                                <div className="pt-3 border-t border-slate-800">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-slate-400">Avg. Progress</span>
                                        <span className="text-sm font-bold text-sky-400">{Math.round(ACTIVE_SIGNALS.reduce((a, s) => a + (s.progress || 0), 0) / ACTIVE_SIGNALS.length)}%</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-2">
                                        <div className="h-full bg-sky-500 rounded-full" style={{ width: `${Math.round(ACTIVE_SIGNALS.reduce((a, s) => a + (s.progress || 0), 0) / ACTIVE_SIGNALS.length)}%` }} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Live Feed */}
                        <div className="flex-1 bg-slate-900/80 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-5 flex flex-col min-h-[400px]">
                            <h3 className="text-xs font-black uppercase tracking-[0.15em] text-sky-400 mb-4 flex items-center gap-2">
                                <Activity className="w-4 h-4" /> Live Network Feed
                            </h3>
                            <div className="flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar">
                                {liveLogs.length === 0 ? (
                                    <div className="text-slate-500 text-xs text-center py-10 flex flex-col items-center gap-2">
                                        <Radio className="w-6 h-6 animate-pulse opacity-50" />
                                        Awaiting Global Transmissions...
                                    </div>
                                ) : (
                                    liveLogs.map((log, index) => (
                                        <div key={index} className="pb-3 border-b border-slate-800/80 last:border-0">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[9px] font-black uppercase text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">{log.chain || 'NODE'}</span>
                                                <span className="text-[10px] text-slate-600 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                            </div>
                                            <p className="text-[11px] leading-relaxed text-slate-400 pl-2 border-l border-slate-800">
                                                {log.message}
                                            </p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Join CTA */}
                        <a
                            href="https://t.me/GSTDBot"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block bg-gradient-to-br from-sky-600/20 to-violet-600/20 border border-sky-500/30 rounded-2xl p-5 hover:border-sky-400/50 transition-all group"
                        >
                            <h3 className="text-sm font-black text-white mb-1 flex items-center gap-2">
                                Join the Swarm <ExternalLink className="w-3 h-3 text-sky-400 group-hover:translate-x-0.5 transition-transform" />
                            </h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Contribute your device's compute power and earn GSTD tokens while helping humanity solve critical problems.
                            </p>
                        </a>
                    </div>
                </div>
            </div>

            {/* Signal Process Modal */}
            {selectedSignal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md" onClick={() => !isPurchasing && setSelectedSignal(null)} />
                    <div className="bg-slate-900 border border-slate-700 rounded-3xl p-7 max-w-md w-full relative z-10 shadow-[0_0_60px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in duration-300">

                        <div className={"w-14 h-14 rounded-2xl border flex items-center justify-center mb-5 mx-auto relative " + selectedSignal.bgColor + " " + getSeverityStyles(selectedSignal.severity).split(' ')[2]}>
                            {isPurchasing && purchaseStep < 3 ? (
                                <Zap className={"w-7 h-7 animate-pulse " + selectedSignal.color} />
                            ) : isPurchasing && purchaseStep === 3 ? (
                                <CheckCircle className={"w-7 h-7 " + selectedSignal.color} />
                            ) : (
                                <selectedSignal.icon className={"w-7 h-7 " + selectedSignal.color} />
                            )}
                        </div>

                        <h3 className="text-lg font-black text-white text-center mb-1">Sponsor Signal Analysis</h3>
                        <p className="text-slate-400 text-center text-xs mb-6 leading-relaxed px-2">
                            Deploy the Swarm to process this signal. Insights are permanently archived for humanity.
                        </p>

                        <div className="bg-slate-950/80 rounded-xl p-4 mb-6 border border-slate-800 space-y-3">
                            <div className="flex justify-between items-start gap-3">
                                <span className="text-xs text-slate-400 flex items-center gap-2 flex-shrink-0"><Target className="w-3.5 h-3.5" />Signal</span>
                                <span className="text-xs font-bold text-white text-right">{selectedSignal.title}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-slate-400 flex items-center gap-2"><Share2 className="w-3.5 h-3.5" />Storage</span>
                                <span className="text-[10px] font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">Collective Memory</span>
                            </div>
                            <div className="border-t border-slate-800 pt-3 space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-400 flex items-center gap-2"><Database className="w-3.5 h-3.5 text-emerald-400" />Swarm Reward</span>
                                    <span className="text-xs font-bold text-emerald-400">+{selectedSignal.gstdReward} GSTD</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-400 flex items-center gap-2"><Lock className="w-3.5 h-3.5 text-amber-400" />Gold Fund</span>
                                    <span className="text-xs font-bold text-amber-400">+{selectedSignal.platformFee} GSTD</span>
                                </div>
                            </div>
                            <div className="flex justify-between items-center pt-3 border-t border-slate-800">
                                <span className="text-sm font-bold text-white">Total Cost</span>
                                <span className="text-base font-black text-white flex items-center gap-1.5 bg-slate-800 px-3 py-1 rounded-lg border border-slate-600">
                                    {selectedSignal.starsCost} <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                                </span>
                            </div>
                        </div>

                        {isPurchasing ? (
                            <div className="flex flex-col gap-3">
                                <div className="h-11 flex items-center justify-center bg-slate-800/50 rounded-xl border border-slate-700">
                                    <span className="text-sm font-bold text-sky-400 animate-pulse flex items-center gap-2">
                                        {purchaseStep === 1 && "Confirming Stars..."}
                                        {purchaseStep === 2 && "Minting GSTD & Locking..."}
                                        {purchaseStep === 3 && "Signal Dispatched!"}
                                    </span>
                                </div>
                                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                    <div className="h-full bg-sky-500 transition-all duration-500 ease-out" style={{ width: ((purchaseStep / 3) * 100) + '%' }} />
                                </div>
                            </div>
                        ) : (
                            <div className="flex gap-3">
                                <button onClick={() => setSelectedSignal(null)} className="flex-1 px-4 py-3 rounded-xl border border-slate-700 hover:bg-slate-800 text-sm font-bold text-slate-300 transition-colors">Cancel</button>
                                <button onClick={handleAnalyzeSignal} className="flex-[2] px-4 py-3 rounded-xl text-sm font-bold text-slate-900 bg-sky-400 hover:bg-sky-300 flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(14,165,233,0.2)]">
                                    <Star className="w-4 h-4 text-slate-900" /> Pay with Stars
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
        .line-clamp-3 { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        `}} />
        </div>
    );
}
