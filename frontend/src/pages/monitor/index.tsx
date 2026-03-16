import { useTranslation } from 'next-i18next';
import React, { useEffect, useState, useMemo } from 'react';
import Head from 'next/head';
import {
    Globe2, Sprout, HeartPulse, Droplets, Sun,
    Activity, ShieldCheck, Zap, Database, CheckCircle,
    Target, Dna, TrendingUp, Star, BrainCircuit, Radio, AlertTriangle, MapPin, Network,
    Satellite, Microscope, Wind, Waves, Shield, Search, BarChart3, Users, ExternalLink,
    GraduationCap, Leaf, Wheat, Baby, Scale, Flame, Building2, PersonStanding, Brain
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
    impact?: string;
}

interface LogEntry {
    id: string;
    type: string;
    chain: string;
    message: string;
    timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 30 CRITICAL PLANETARY SIGNALS — covering ALL major problems of humanity
// Each signal is connected to real open-data sources and produces actionable
// results that feed back into the Collective Memory and train the Swarm.
// ═══════════════════════════════════════════════════════════════════════════
// Signal i18n key mapping for title/description
const SIGNAL_I18N: Record<string, { title: string; desc?: string; impact?: string }> = {
    'nasa_eosdis': { title: 'sig_nasa_title', desc: 'sig_nasa_desc', impact: 'sig_nasa_impact' },
    'wildfire_sentinel': { title: 'sig_wildfire_title', desc: 'sig_wildfire_desc', impact: 'sig_wildfire_impact' },
    'copernicus_marine': { title: 'sig_ocean_title', desc: 'sig_ocean_desc' },
    'air_quality_mesh': { title: 'sig_air_title' },
    'carbon_sink': { title: 'sig_carbon_title' },
    'who_pubmed': { title: 'sig_pandemic_title', desc: 'sig_pandemic_desc' },
    'alphafold_protein': { title: 'sig_orphan_title' },
    'antibiotic_resistance': { title: 'sig_superbug_title' },
    'mental_health_nlp': { title: 'sig_mental_title' },
    'gdelt_crisis': { title: 'sig_crisis_title', desc: 'sig_crisis_desc' },
    'darknet_tracker': { title: 'sig_trafficking_title' },
    'osm_disaster': { title: 'sig_disaster_title' },
    'refugee_flow': { title: 'sig_refugee_title' },
    'famine_prediction': { title: 'sig_famine_title' },
    'water_stress': { title: 'sig_water_title' },
    'seismic_array': { title: 'sig_seismic_title' },
    'tsunami_model': { title: 'sig_tsunami_title' },
    'deepfake_firewall': { title: 'sig_deepfake_title' },
    'critical_infra': { title: 'sig_infra_title' },
    'cern_physics': { title: 'sig_cern_title' },
    'fusion_sim': { title: 'sig_fusion_title' },
    'space_debris': { title: 'sig_debris_title' },
    'education_gap': { title: 'sig_education_title' },
    'poverty_mapping': { title: 'sig_poverty_title' },
    'child_mortality': { title: 'sig_child_title' },
    'financial_contagion': { title: 'sig_financial_title' },
    'corruption_trace': { title: 'sig_corruption_title' },
    'biodiversity_loss': { title: 'sig_biodiversity_title' },
    'ocean_plastic': { title: 'sig_plastic_title' },
};

const ACTIVE_SIGNALS: GlobalSignal[] = [
    // ─── CLIMATE & ENVIRONMENT ──────────────────────────────────────
    {
        id: 'nasa_eosdis', title: 'NASA Earth Observation',
        description: 'Process real-time satellite imagery from Terra, Aqua, and JPSS fleet. Detect deforestation, glacial melting, and atmospheric anomalies across the planet.',
        source: 'NASA EOSDIS / MODIS', severity: 'critical', location: 'Global',
        dataVolume: '45.8 TB/day', icon: Satellite, color: 'text-sky-400', bgColor: 'bg-sky-500/10',
        starsCost: 3500, gstdReward: 280, platformFee: 70, category: 'Climate',
        progress: 0, contributors: 0, impact: 'Early detection of deforestation and ice shelf collapse'
    },
    {
        id: 'wildfire_sentinel', title: 'Wildfire Early Warning',
        description: 'Fuse Sentinel-2, VIIRS hotspots and weather station data to predict fire ignition zones 48 hours ahead. Protect communities, forests, and wildlife.',
        source: 'Copernicus / VIIRS', severity: 'critical', location: 'Global Forests',
        dataVolume: '12 TB/day', icon: Flame, color: 'text-orange-400', bgColor: 'bg-orange-500/10',
        starsCost: 2500, gstdReward: 200, platformFee: 50, category: 'Climate',
        progress: 0, contributors: 0, impact: 'Predict wildfire ignition 48h before ground crews detect it'
    },
    {
        id: 'copernicus_marine', title: 'Ocean Health Monitor',
        description: 'Analyze sea surface temperature, acidification, and coral bleaching using combined Copernicus Marine and NOAA Argo float data.',
        source: 'Copernicus Marine', severity: 'high', location: 'Global Oceans',
        dataVolume: '8.2 TB/day', icon: Waves, color: 'text-cyan-400', bgColor: 'bg-cyan-500/10',
        starsCost: 2000, gstdReward: 160, platformFee: 40, category: 'Climate',
        progress: 0, contributors: 0, impact: 'Track ocean acidification threatening 500M coastal livelihoods'
    },
    {
        id: 'air_quality_mesh', title: 'Air Quality Intelligence',
        description: 'Cross-correlate 30,000+ ground air quality sensors with satellite aerosol data to generate hyper-local PM2.5 forecasts for 1,000+ cities.',
        source: 'OpenAQ / PurpleAir', severity: 'high', location: '1,000+ Cities',
        dataVolume: '5.6 TB/day', icon: Wind, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10',
        starsCost: 1500, gstdReward: 120, platformFee: 30, category: 'Climate',
        progress: 0, contributors: 0, impact: 'Air pollution kills 7M people yearly — early alerts save lives'
    },

    // ─── HEALTH ─────────────────────────────────────────────────────
    {
        id: 'who_pubmed', title: 'Pandemic Early Warning',
        description: 'NLP analysis of WHO reports, PubMed preprints, and hospital overflow data across 190 countries to detect novel pathogen emergence.',
        source: 'WHO / PubMed / ProMED', severity: 'critical', location: 'Global Health',
        dataVolume: '2.4 TB/day', icon: HeartPulse, color: 'text-rose-400', bgColor: 'bg-rose-500/10',
        starsCost: 5000, gstdReward: 400, platformFee: 100, category: 'Health',
        progress: 0, contributors: 0, impact: 'Detect pandemic signals 14 days before official WHO alerts'
    },
    {
        id: 'alphafold_protein', title: 'Orphan Drug Discovery',
        description: 'Use AlphaFold-derived protein structures and GSTD compute to discover drug candidates for 7,000+ rare diseases that pharma ignores.',
        source: 'AlphaFold DB / ChEMBL', severity: 'high', location: 'Research Labs',
        dataVolume: '18 TB/sync', icon: Dna, color: 'text-violet-400', bgColor: 'bg-violet-500/10',
        starsCost: 8000, gstdReward: 640, platformFee: 160, category: 'Health',
        progress: 0, contributors: 0, impact: 'Find treatments for 300M people with neglected diseases'
    },

    // ─── SECURITY & SAFETY ──────────────────────────────────────────
    {
        id: 'gdelt_crisis', title: 'Global Crisis Intelligence',
        description: 'Monitor GDELT event stream (65 languages, 300K+ news sources) to detect political instability, conflict escalation, and humanitarian crises in real-time.',
        source: 'GDELT Project', severity: 'critical', location: 'Global',
        dataVolume: '1.3 TB/day', icon: Globe2, color: 'text-amber-400', bgColor: 'bg-amber-500/10',
        starsCost: 3000, gstdReward: 240, platformFee: 60, category: 'Security',
        progress: 0, contributors: 0, impact: 'Early detection of crises affecting 100M+ people'
    },
    {
        id: 'seismic_array', title: 'Seismic Prediction Network',
        description: 'Feed global seismometer networks (IRIS, USGS) into ML models to detect pre-earthquake stress patterns hours before major events.',
        source: 'IRIS / USGS', severity: 'critical', location: 'Tectonic Zones',
        dataVolume: '800 GB/hr', icon: Activity, color: 'text-red-400', bgColor: 'bg-red-500/10',
        starsCost: 4000, gstdReward: 320, platformFee: 80, category: 'Security',
        progress: 0, contributors: 0, impact: 'Earthquake early warning for 1B+ people in seismic zones'
    },
    {
        id: 'deepfake_firewall', title: 'Deepfake Detection Grid',
        description: 'Run adversarial neural nets on social media video streams to detect synthetic media, political deepfakes, and AI-generated disinformation.',
        source: 'Social Media APIs', severity: 'high', location: 'Global Internet',
        dataVolume: '6.5 TB/day', icon: ShieldCheck, color: 'text-fuchsia-400', bgColor: 'bg-fuchsia-500/10',
        starsCost: 3000, gstdReward: 240, platformFee: 60, category: 'Security',
        progress: 0, contributors: 0, impact: 'Protect elections and public discourse from AI manipulation'
    },

    // ─── SCIENCE & SOCIETY ──────────────────────────────────────────
    {
        id: 'cern_physics', title: 'Particle Physics Compute',
        description: 'Contribute GSTD compute to CERN Open Data analysis — process collision data to search for physics beyond the Standard Model.',
        source: 'CERN Open Data', severity: 'medium', location: 'LHC / Geneva',
        dataVolume: '58 PB total', icon: Microscope, color: 'text-indigo-400', bgColor: 'bg-indigo-500/10',
        starsCost: 6000, gstdReward: 480, platformFee: 120, category: 'Science',
        progress: 0, contributors: 0, impact: 'Help discover new fundamental particles of the universe'
    },
    {
        id: 'space_debris', title: 'Space Debris Tracking',
        description: 'Track 130,000+ orbital objects using radar and optical observations. Predict potential collisions and generate avoidance trajectories for active satellites.',
        source: 'Space-Track.org / ESA', severity: 'high', location: 'Low Earth Orbit',
        dataVolume: '400 GB/day', icon: Satellite, color: 'text-sky-400', bgColor: 'bg-sky-500/10',
        starsCost: 2500, gstdReward: 200, platformFee: 50, category: 'Science',
        progress: 0, contributors: 0, impact: 'Protect $2T in space infrastructure from Kessler Syndrome'
    },
    {
        id: 'famine_prediction', title: 'Famine Early Warning',
        description: 'Fuse satellite vegetation indices, market prices, and conflict data to predict food crises 3 months before they strike vulnerable regions.',
        source: 'FEWS NET / WFP', severity: 'critical', location: 'Sub-Saharan Africa',
        dataVolume: '1.8 TB/day', icon: Wheat, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10',
        starsCost: 4500, gstdReward: 360, platformFee: 90, category: 'Society',
        progress: 0, contributors: 0, impact: 'Save 800M people from food insecurity with early intervention'
    },
];

const CATEGORIES = ['All', ...Array.from(new Set(ACTIVE_SIGNALS.map(s => s.category)))];

const CATEGORY_COLORS: Record<string, string> = {
    'Climate': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    'Health': 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    'Security': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    'Science': 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    'Society': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
};

const CATEGORY_I18N: Record<string, string> = {
    'All': 'all_signals',
    'Climate': 'cat_climate',
    'Health': 'cat_health',
    'Security': 'cat_security',
    'Science': 'cat_science',
    'Society': 'cat_society',
};

const SEVERITY_I18N: Record<string, string> = {
    'critical': 'critical',
    'high': 'high',
    'medium': 'medium',
};

export default function HumanityMonitor() {
    const { t } = useTranslation('common');

    const [selectedSignal, setSelectedSignal] = useState<GlobalSignal | null>(null);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [purchaseStep, setPurchaseStep] = useState<number>(0);
    const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);
    const [activeCategory, setActiveCategory] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [signalStats, setSignalStats] = useState<Record<string, any>>({});
    const [stats, setStats] = useState({
        activeNodes: 0, gstdPrice: 0, dataProcessed: 0, health: 0.95,
        totalUsers: 0, tasksCompleted: 0, totalBurned: 0
    });
    const [sovereigntyIndex, setSovereigntyIndex] = useState(100.0);

    // Merge static signal definitions with real backend progress data
    const signalsWithRealData = useMemo(() => {
        return ACTIVE_SIGNALS.map(s => {
            const real = signalStats[s.id];
            if (real) {
                return {
                    ...s,
                    progress: real.progress || 0,
                    contributors: real.contributor_count || 0,
                };
            }
            return { ...s, progress: 0, contributors: 0 };
        });
    }, [signalStats]);

    const filteredSignals = useMemo(() => {
        return signalsWithRealData.filter(s => {
            if (activeCategory !== 'All' && s.category !== activeCategory) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                return s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
                    || s.category.toLowerCase().includes(q) || s.source.toLowerCase().includes(q);
            }
            return true;
        });
    }, [activeCategory, searchQuery, signalsWithRealData]);

    // Fetch real signal stats from backend
    useEffect(() => {
        const fetchSignals = async () => {
            try {
                const data = await apiGet<any>('/monitor/signals').catch(() => null);
                if (data?.signals) setSignalStats(data.signals);
            } catch (_e) { /* signals fetch is non-critical */ }
        };
        fetchSignals();
        const interval = setInterval(fetchSignals, 8000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const data = await apiGet<any>('/monitor/unified').catch(() => null);
                if (data) {
                    if (data.flows?.recent_events) setLiveLogs(data.flows.recent_events.slice(0, 20));
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
            } catch (_e) { /* unified fetch is non-critical */ }
        };
        fetchData();
        const interval = setInterval(fetchData, 4000);
        return () => clearInterval(interval);
    }, []);

    // Fetch Sovereignty Index
    useEffect(() => {
        const fetchSov = async () => {
            try {
                const data = await apiGet<any>('/chat/sovereignty-index').catch(() => null);
                if (data?.sovereignty_index !== undefined) setSovereigntyIndex(data.sovereignty_index);
            } catch (_e) { /* sovereignty fetch is non-critical */ }
        };
        fetchSov();
        const interval = setInterval(fetchSov, 5000);
        return () => clearInterval(interval);
    }, []);



    const handleAnalyzeSignal = async () => {
        if (!selectedSignal) return;

        const isTelegram = typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.openInvoice;

        // If we're NOT inside the Telegram Mini App, redirect to the bot directly
        // The bot will send the Stars invoice in the chat — simplest purchase flow
        if (!isTelegram) {
            const deepLink = `https://t.me/GstdAppBot?start=sponsor-${selectedSignal.id}-${selectedSignal.starsCost}`;
            window.open(deepLink, '_blank');
            toast.success("Opening GstdAppBot in Telegram to pay with Stars...");
            setSelectedSignal(null);
            return;
        }

        // Inside Telegram WebApp — full invoice flow
        setIsPurchasing(true); setPurchaseStep(1);
        try {
            // Record real sponsorship in backend DB
            await apiPost(`/monitor/signals/${selectedSignal.id}/sponsor`, {
                user_id: 'web_' + Date.now(),
                stars_paid: selectedSignal.starsCost,
                gstd_reward: selectedSignal.gstdReward,
                gstd_gold_fee: selectedSignal.platformFee
            }).catch(() => null);

            const resp = await apiPost('/tasks/telegram-launch', {
                task_id: selectedSignal.id, stars_paid: selectedSignal.starsCost,
                reward_gstd: selectedSignal.gstdReward, admin_fee_gstd: selectedSignal.platformFee
            });
            if (resp.invoice_url) {
                setPurchaseStep(2);
                (window as any).Telegram.WebApp.openInvoice(resp.invoice_url, (status: string) => {
                    if (status === 'paid') {
                        setPurchaseStep(3);
                        setTimeout(() => {
                            toast.success("Signal Dispatched! " + selectedSignal.gstdReward + " GSTD locked for Swarm resolution.");
                            setIsPurchasing(false); setPurchaseStep(0); setSelectedSignal(null);
                            setLiveLogs(prev => [{
                                id: Math.random().toString(), type: 'SIGNAL_SPONSOR', chain: t('swarm', 'SWARM'),
                                message: `[Sponsored] ${selectedSignal.title} → Swarm processing initiated`, timestamp: new Date().toISOString()
                            }, ...prev].slice(0, 20));
                        }, 2000);
                    } else { toast.error('Payment ' + status); setIsPurchasing(false); setPurchaseStep(0); }
                });
            } else { toast.error("Failed to generate invoice"); setIsPurchasing(false); setPurchaseStep(0); }
        } catch (e: any) { toast.error('Error: ' + (e?.message || 'Unknown')); setIsPurchasing(false); setPurchaseStep(0); }
    };

    const getSeverityStyles = (s: string) => {
        if (s === 'critical') return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
        if (s === 'high') return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
        return 'text-sky-400 bg-sky-500/10 border-sky-500/30';
    };

    const totalRewardPool = ACTIVE_SIGNALS.reduce((a, s) => a + s.gstdReward, 0);
    const totalContributors = ACTIVE_SIGNALS.reduce((a, s) => a + (s.contributors || 0), 0);
    const avgProgress = Math.round(ACTIVE_SIGNALS.reduce((a, s) => a + (s.progress || 0), 0) / ACTIVE_SIGNALS.length);
    const criticalCount = ACTIVE_SIGNALS.filter(s => s.severity === 'critical').length;

    return (
        <div className="bg-[#030014] text-white min-h-screen relative overflow-hidden font-sans antialiased selection:bg-sky-500/30">
            <Head>
                <title>GSTD Monitor — Global Signal Intelligence</title>
                <meta name="description" content={`${ACTIVE_SIGNALS.length} planetary-scale signals covering climate, health, security, food, science, and society. Sponsor Swarm analysis to solve humanity's hardest problems.`} />
            </Head>

            {/* Static ambient background */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-violet-600/[0.04] blur-[120px]" />
                <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full bg-sky-600/[0.04] blur-[120px]" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-emerald-600/[0.02] blur-[150px]" />
            </div>

            <div className="relative z-10 flex flex-col min-h-screen p-4 sm:p-6 overflow-y-auto custom-scrollbar">
                {/* ─── HEADER ─────────────────────────────────────────────── */}
                <header className="flex flex-col gap-5 mb-6">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-slate-900/80 rounded-2xl flex items-center justify-center border border-slate-700/80 shadow-[0_0_30px_rgba(14,165,233,0.15)] backdrop-blur-md relative overflow-hidden flex-shrink-0">
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.3)_0%,transparent_70%)] animate-pulse" />
                                <Radio className="w-6 h-6 sm:w-7 sm:h-7 text-sky-400 relative z-10" />
                            </div>
                            <div>
                                <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-white flex items-center gap-3 flex-wrap">
                                    {t('humanitys_supercomputer', "HUMANITY'S SUPERCOMPUTER")}
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-bold text-emerald-400 tracking-widest uppercase flex items-center gap-1.5 relative">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping absolute left-2" />
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 relative" />
                                        <span className="ml-1">{ACTIVE_SIGNALS.length} {t('signals', 'Signals')}</span>
                                    </span>
                                </h1>
                                <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl leading-relaxed">
                                    {t('monitor_subtitle', 'Every signal is a real problem facing humanity. Sponsor analysis with Telegram Stars → Swarm solves it → Results train the Global Brain forever.')}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 w-full md:w-auto">
                            {[
                                { label: t('sovereignty', 'Sovereignty'), value: sovereigntyIndex.toFixed(1) + '%', color: sovereigntyIndex > 90 ? 'text-emerald-400' : sovereigntyIndex > 70 ? 'text-amber-400' : 'text-rose-400', icon: Shield },
                                { label: t('active_nodes', 'Active Nodes'), value: stats.activeNodes > 0 ? stats.activeNodes.toLocaleString() : '—', color: 'text-cyan-400', icon: Globe2 },
                                { label: t('health', 'Health'), value: (stats.health * 100).toFixed(0) + '%', color: stats.health > 0.8 ? 'text-emerald-400' : 'text-amber-400', icon: Activity },
                                { label: t('signals', 'Signals'), value: `${criticalCount} critical`, color: 'text-rose-400', icon: AlertTriangle },
                                { label: t('reward_pool', 'Reward Pool'), value: totalRewardPool.toLocaleString() + ' GSTD', color: 'text-emerald-400', icon: Database },
                            ].map((s) => (
                                <div key={s.label} className="px-3 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl backdrop-blur-xl flex items-center gap-2.5">
                                    <s.icon className={`w-4 h-4 ${s.color} opacity-60 flex-shrink-0`} />
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 truncate">{s.label}</span>
                                        <span className={`text-xs font-bold ${s.color} tabular-nums truncate`}>{s.value}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Search + Filters */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input type="text" placeholder={t('search_signals', 'Search signals, sources, topics...')} value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-slate-900/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500/50 backdrop-blur-xl" />
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                            {CATEGORIES.map(cat => (
                                <button key={cat} onClick={() => setActiveCategory(cat)}
                                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${activeCategory === cat
                                        ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                                        : 'bg-slate-800/50 text-slate-400 border border-slate-700/30 hover:bg-slate-700/50'}`}>
                                    {cat === 'All' ? `${t('all_signals', 'All')} (${ACTIVE_SIGNALS.length})` : t(CATEGORY_I18N[cat] || cat, cat)}
                                </button>
                            ))}
                        </div>
                    </div>
                </header>

                <div className="flex flex-col lg:flex-row gap-5 flex-1 content-start pb-12">
                    {/* ─── SIGNALS GRID ────────────────────────────────────── */}
                    <div className="w-full lg:w-3/4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {filteredSignals.map((signal) => (
                            <div key={signal.id}
                                className="group relative bg-slate-900/60 backdrop-blur-xl border border-slate-700/60 hover:border-slate-500/50 rounded-2xl p-5 transition-all duration-300 hover:shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col justify-between">
                                <div className={"absolute top-0 right-0 w-24 h-24 rounded-full blur-[50px] opacity-10 group-hover:opacity-20 transition-opacity " + signal.bgColor} />

                                <div>
                                    <div className="flex items-start justify-between mb-2.5 relative z-10">
                                        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className={"text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border " + getSeverityStyles(signal.severity)}>{t(SEVERITY_I18N[signal.severity] || signal.severity, signal.severity)}</span>
                                                <span className={"text-[8px] font-bold px-1.5 py-0.5 rounded border " + (CATEGORY_COLORS[signal.category] || 'text-slate-400 bg-slate-800 border-slate-700')}>{t(CATEGORY_I18N[signal.category] || signal.category, signal.category)}</span>
                                            </div>
                                            <h2 className="text-sm font-bold text-slate-100 leading-tight group-hover:text-white transition-colors">{SIGNAL_I18N[signal.id] ? t(SIGNAL_I18N[signal.id].title, signal.title) : signal.title}</h2>
                                        </div>
                                        <div className={`p-1.5 rounded-lg ${signal.bgColor} flex-shrink-0 ml-2`}>
                                            <signal.icon className={`w-4 h-4 ${signal.color}`} />
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 text-[9px] text-slate-500 mb-2 relative z-10">
                                        <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{signal.location}</span>
                                        <span className="flex items-center gap-0.5"><Database className="w-2.5 h-2.5" />{signal.dataVolume}</span>
                                    </div>

                                    <p className="text-[11px] text-slate-400 leading-relaxed mb-2 relative z-10 line-clamp-2">{SIGNAL_I18N[signal.id]?.desc ? t(SIGNAL_I18N[signal.id].desc!, signal.description) : signal.description}</p>

                                    {signal.impact && (
                                        <div className="text-[10px] text-amber-400/80 bg-amber-500/5 border border-amber-500/10 rounded-lg px-2 py-1 mb-3 relative z-10 flex items-start gap-1">
                                            <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                            <span>{SIGNAL_I18N[signal.id]?.impact ? t(SIGNAL_I18N[signal.id].impact!, signal.impact!) : signal.impact}</span>
                                        </div>
                                    )}

                                    {/* Progress */}
                                    <div className="mb-3 relative z-10">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[9px] font-bold text-slate-500 uppercase">{t('progress', 'Progress')}</span>
                                            <span className="text-[9px] font-bold text-slate-400 tabular-nums">{signal.progress || 0}%</span>
                                        </div>
                                        <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full transition-all duration-1000 ${(signal.progress || 0) > 80 ? 'bg-emerald-500' : (signal.progress || 0) > 40 ? 'bg-sky-500' : 'bg-violet-500'}`}
                                                style={{ width: `${signal.progress || 0}%` }} />
                                        </div>
                                        <div className="flex justify-between items-center mt-1">
                                            <span className="text-[9px] text-slate-600 flex items-center gap-0.5"><Users className="w-2.5 h-2.5" />{signal.contributors || 0}</span>
                                            <span className="text-[9px] text-slate-600 font-mono">{signal.source.split('&')[0].trim()}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between relative z-10">
                                    <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1"><Database className="w-3 h-3" />{signal.gstdReward} GSTD</span>
                                    <button onClick={() => setSelectedSignal(signal)}
                                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-sky-500/50 text-[11px] font-bold text-white transition-all flex items-center gap-1.5">
                                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />{signal.starsCost}
                                    </button>
                                </div>
                            </div>
                        ))}

                        {filteredSignals.length === 0 && (
                            <div className="col-span-full text-center py-16 text-slate-500">
                                <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
                                <p className="text-sm font-bold">{t('no_signals', 'No signals found')}</p>
                                <p className="text-xs mt-1">{t('try_different', 'Try a different category or search term')}</p>
                            </div>
                        )}
                    </div>

                    {/* ─── RIGHT PANEL ─────────────────────────────────────── */}
                    <div className="w-full lg:w-1/4 flex flex-col gap-4">
                        {/* Network Overview */}
                        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-4">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-violet-400 mb-3 flex items-center gap-2">
                                <BarChart3 className="w-3.5 h-3.5" />{t('planetary_overview', 'Planetary Overview')}</h3>
                            <div className="space-y-2.5">
                                {[
                                    { l: t('total_signals', 'Total Signals'), v: String(ACTIVE_SIGNALS.length), c: 'text-white' },
                                    { l: t('active_nodes', 'Active Nodes'), v: stats.activeNodes > 0 ? stats.activeNodes.toLocaleString() : '—', c: 'text-cyan-400' },
                                    { l: t('critical_priority', 'Critical Priority'), v: String(criticalCount), c: 'text-rose-400' },
                                    { l: t('categories', 'Categories'), v: String(CATEGORIES.length - 1), c: 'text-sky-400' },
                                    { l: t('total_contributors', 'Total Contributors'), v: totalContributors.toLocaleString(), c: 'text-violet-400' },
                                    { l: t('reward_pool', 'Reward Pool'), v: totalRewardPool.toLocaleString() + ' GSTD', c: 'text-emerald-400' },
                                ].map((r) => (
                                    <div key={r.l} className="flex justify-between items-center">
                                        <span className="text-[10px] text-slate-400">{r.l}</span>
                                        <span className={`text-xs font-bold ${r.c}`}>{r.v}</span>
                                    </div>
                                ))}
                                <div className="pt-2 border-t border-slate-800">
                                    <div className="flex justify-between items-center mb-1.5">
                                        <span className="text-[10px] text-slate-400">{t('avg_progress', 'Avg. Progress')}</span>
                                        <span className="text-xs font-bold text-sky-400">{avgProgress}%</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: `${avgProgress}%` }} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Category Breakdown */}
                        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-4">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-sky-400 mb-3 flex items-center gap-2">
                                <Target className="w-3.5 h-3.5" />{t('problems_by_domain', 'Problems by Domain')}</h3>
                            <div className="space-y-2">
                                {CATEGORIES.filter(c => c !== 'All').map(cat => {
                                    const count = ACTIVE_SIGNALS.filter(s => s.category === cat).length;
                                    const pct = Math.round((count / ACTIVE_SIGNALS.length) * 100);
                                    return (
                                        <button key={cat} onClick={() => setActiveCategory(cat)}
                                            className="w-full flex items-center justify-between text-left hover:bg-slate-800/50 rounded-lg px-2 py-1 transition-colors">
                                            <span className="text-[10px] font-bold text-slate-300">{t(CATEGORY_I18N[cat] || cat, cat)}</span>
                                            <div className="flex items-center gap-2">
                                                <div className="w-16 h-1 bg-slate-800 rounded-full overflow-hidden">
                                                    <div className="h-full bg-sky-500/60 rounded-full" style={{ width: `${pct}%` }} />
                                                </div>
                                                <span className="text-[10px] text-slate-500 tabular-nums w-4 text-right">{count}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Live Feed */}
                        <div className="flex-1 bg-slate-900/80 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-4 flex flex-col min-h-[300px]">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-sky-400 mb-3 flex items-center gap-2">
                                <Activity className="w-3.5 h-3.5" />{t('live_network_feed', 'Live Network Feed')}</h3>
                            <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 custom-scrollbar">
                                {liveLogs.length === 0 ? (
                                    <div className="text-slate-500 text-xs text-center py-8 flex flex-col items-center gap-2">
                                        <Radio className="w-5 h-5 animate-pulse opacity-50" />{t('awaiting_transmissions', 'Awaiting transmissions...')}</div>
                                ) : (
                                    liveLogs.map((log) => (
                                        <div key={log.id} className="pb-2 border-b border-slate-800/80 last:border-0">
                                            <div className="flex justify-between items-center mb-0.5">
                                                <span className="text-[8px] font-black uppercase text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded">{log.chain || 'NODE'}</span>
                                                <span className="text-[9px] text-slate-600 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                            </div>
                                            <p className="text-[10px] leading-relaxed text-slate-400 pl-2 border-l border-slate-800">{log.message}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Join CTA */}
                        <a href="https://gstdbot.gstdtoken.com" target="_blank" rel="noopener noreferrer"
                            className="block bg-gradient-to-br from-sky-600/20 to-violet-600/20 border border-sky-500/30 rounded-2xl p-4 hover:border-sky-400/50 transition-all group">
                            <h3 className="text-sm font-black text-white mb-1 flex items-center gap-2">
                                {t('run_your_node', 'Run Your Own Node')} <ExternalLink className="w-3 h-3 text-sky-400 group-hover:translate-x-0.5 transition-transform" />
                            </h3>
                            <p className="text-[10px] text-slate-400 leading-relaxed">
                                {t('node_cta_desc', '77 apps, wallet auth, Let\'s Encrypt SSL, DynDNS, self-diagnostics. Earn GSTD while your device powers the swarm network.')}
                            </p>
                        </a>
                    </div>
                </div>
            </div>

            {/* ─── SPONSOR MODAL ───────────────────────────────────────── */}
            {selectedSignal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md" role="button" tabIndex={0} aria-label="Close modal" onClick={() => !isPurchasing && setSelectedSignal(null)} onKeyDown={(e) => e.key === 'Escape' && !isPurchasing && setSelectedSignal(null)} />
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full relative z-10 shadow-[0_0_60px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in duration-300 max-h-[90vh] overflow-y-auto custom-scrollbar">

                        <div className={"w-12 h-12 rounded-xl border flex items-center justify-center mb-4 mx-auto " + selectedSignal.bgColor + " " + getSeverityStyles(selectedSignal.severity).split(' ')[2]}>
                            {isPurchasing && purchaseStep < 3 ? <Zap className={"w-6 h-6 animate-pulse " + selectedSignal.color} />
                                : isPurchasing && purchaseStep === 3 ? <CheckCircle className={"w-6 h-6 " + selectedSignal.color} />
                                    : <selectedSignal.icon className={"w-6 h-6 " + selectedSignal.color} />}
                        </div>

                        <h3 className="text-lg font-black text-white text-center mb-1">{t('sponsor_signal', 'Sponsor This Signal')}</h3>
                        <p className="text-slate-400 text-center text-xs mb-5 leading-relaxed">{selectedSignal.description}</p>

                        {selectedSignal.impact && (
                            <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 mb-4 flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                <span><strong>{t('why_it_matters', 'Why it matters:')}</strong> {selectedSignal.impact}</span>
                            </div>
                        )}

                        <div className="bg-slate-950/80 rounded-xl p-4 mb-5 border border-slate-800 space-y-2.5">
                            <div className="flex justify-between items-center"><span className="text-xs text-slate-400">{t('signal', 'Signal')}</span><span className="text-xs font-bold text-white text-right">{selectedSignal.title}</span></div>
                            <div className="flex justify-between items-center"><span className="text-xs text-slate-400">{t('data_source', 'Data Source')}</span><span className="text-[10px] font-mono text-sky-400">{selectedSignal.source}</span></div>
                            <div className="flex justify-between items-center"><span className="text-xs text-slate-400">{t('data_volume', 'Data Volume')}</span><span className="text-xs text-slate-300">{selectedSignal.dataVolume}</span></div>
                            <div className="border-t border-slate-800 pt-2.5 space-y-2">
                                <div className="flex justify-between"><span className="text-xs text-slate-400">{t('swarm_workers_85', '→ Swarm Workers (85%)')}</span><span className="text-xs font-bold text-emerald-400">+{selectedSignal.gstdReward} GSTD</span></div>
                                <div className="flex justify-between"><span className="text-xs text-slate-400">{t('gold_reserve_10', '→ Gold Reserve (10%)')}</span><span className="text-xs font-bold text-amber-400">+{selectedSignal.platformFee} GSTD</span></div>
                                <div className="flex justify-between"><span className="text-xs text-slate-400">{t('results_stored_in', '→ Results stored in')}</span><span className="text-[10px] font-bold text-violet-400">{t('collective_memory', 'Collective Memory')}</span></div>
                            </div>
                            <div className="flex justify-between items-center pt-2.5 border-t border-slate-800">
                                <span className="text-sm font-bold text-white">{t('sponsorship', 'Sponsorship')}</span>
                                <span className="text-base font-black text-white flex items-center gap-1.5 bg-slate-800 px-3 py-1 rounded-lg border border-slate-600">
                                    {selectedSignal.starsCost} <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                                </span>
                            </div>
                        </div>

                        {isPurchasing ? (
                            <div className="flex flex-col gap-2.5">
                                <div className="h-10 flex items-center justify-center bg-slate-800/50 rounded-xl border border-slate-700">
                                    <span className="text-sm font-bold text-sky-400 animate-pulse">
                                        {purchaseStep === 1 && t('confirming_stars', 'Confirming Stars...')}
                                        {purchaseStep === 2 && t('minting_deploying', 'Minting GSTD & Deploying Swarm...')}
                                        {purchaseStep === 3 && t('signal_dispatched', 'Signal Dispatched to Swarm!')}
                                    </span>
                                </div>
                                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                    <div className="h-full bg-sky-500 transition-all duration-500 ease-out" style={{ width: ((purchaseStep / 3) * 100) + '%' }} />
                                </div>
                            </div>
                        ) : (
                            <div className="flex gap-3">
                                <button onClick={() => setSelectedSignal(null)} className="flex-1 px-3 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-sm font-bold text-slate-300 transition-colors">{t('cancel', 'Cancel')}</button>
                                <button onClick={handleAnalyzeSignal} className="flex-[2] px-3 py-2.5 rounded-xl text-sm font-bold text-slate-900 bg-sky-400 hover:bg-sky-300 flex items-center justify-center gap-2 transition-all">
                                    <Star className="w-4 h-4" />{t('sponsor_with_stars', 'Sponsor with Stars')}</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(51, 65, 85, 0.5); border-radius: 4px; }
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        `}} />
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
