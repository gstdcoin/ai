import React, { useEffect, useRef, useState, useMemo } from 'react';
import Head from 'next/head';
import {
    Globe2, Sprout, HeartPulse, Droplets, BookOpen, Sun,
    Activity, ShieldCheck, Code, Zap, Database, CheckCircle,
    Target, Dna, ArrowRight, TrendingUp, Cpu, Star, Lock, BrainCircuit, Share2, Radio, AlertTriangle, MapPin, Network,
    Satellite, Microscope, Wind, Waves, Shield, Search, Filter, BarChart3, Users, Clock, ChevronRight, ExternalLink,
    GraduationCap, Hammer, Leaf, Wheat, Baby, Scale, Fingerprint, Flame, Building2, PersonStanding, Brain
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
const ACTIVE_SIGNALS: GlobalSignal[] = [
    // ─── CLIMATE & ENVIRONMENT ───────────────────────────────────────
    {
        id: 'nasa_eosdis', title: 'NASA Climate Anomaly Extraction',
        description: 'Process raw satellite imagery & atmospheric data to detect deforestation and extreme surface temperature anomalies before they become irreversible.',
        source: 'NASA EOSDIS', severity: 'critical', location: 'Equatorial Band',
        dataVolume: '45.8 TB/week', icon: Sun, color: 'text-amber-400', bgColor: 'bg-amber-500/10',
        starsCost: 3500, gstdReward: 280, platformFee: 70, category: 'Climate',
        progress: 61, contributors: 89, impact: 'Early warning for 2.3B people in equatorial zones'
    },
    {
        id: 'wildfire_sentinel', title: 'Wildfire Spread Prediction Grid',
        description: 'Cross-reference Sentinel-2 thermal bands and MODIS hotspot data with wind models to predict wildfire spread within 6-hour windows.',
        source: 'ESA Sentinel-2 & FIRMS', severity: 'critical', location: 'California / Australia / Siberia',
        dataVolume: '22.7 TB/week', icon: Flame, color: 'text-orange-300', bgColor: 'bg-orange-400/10',
        starsCost: 3000, gstdReward: 240, platformFee: 60, category: 'Climate',
        progress: 45, contributors: 112, impact: 'Prevent $50B+ annual wildfire damage'
    },
    {
        id: 'copernicus_marine', title: 'Ocean Heatwave & Coral Bleaching Model',
        description: 'Process deep oceanic temperature, drift, and salinity arrays to predict marine heatwaves and coral reef die-off events months in advance.',
        source: 'Copernicus Marine Service', severity: 'high', location: 'Pacific & Indian Oceans',
        dataVolume: '8.1 TB/mo', icon: Droplets, color: 'text-teal-400', bgColor: 'bg-teal-500/10',
        starsCost: 1500, gstdReward: 120, platformFee: 30, category: 'Climate',
        progress: 88, contributors: 64, impact: 'Protect 500M people dependent on coral reef ecosystems'
    },
    {
        id: 'air_quality_mesh', title: 'Urban Air Quality Mesh Intelligence',
        description: 'Aggregate and normalize 200,000+ low-cost PM2.5/PM10 sensors across 12,000 cities to build real-time AQI maps with health risk heatmaps.',
        source: 'OpenAQ & PurpleAir APIs', severity: 'high', location: '12,000+ Cities',
        dataVolume: '3.8 TB/day', icon: Wind, color: 'text-sky-300', bgColor: 'bg-sky-400/10',
        starsCost: 1200, gstdReward: 96, platformFee: 24, category: 'Climate',
        progress: 76, contributors: 310, impact: 'Air pollution kills 7M people/year (WHO)'
    },
    {
        id: 'carbon_sink', title: 'Global Carbon Sink Mapping',
        description: 'Combine LIDAR forest canopy data with soil carbon sensors and satellite imagery to map the planet\'s carbon capture capacity in real time.',
        source: 'Global Forest Watch & FLUXNET', severity: 'medium', location: 'Amazon / Congo / Boreal',
        dataVolume: '15 TB/mo', icon: Leaf, color: 'text-green-400', bgColor: 'bg-green-500/10',
        starsCost: 2500, gstdReward: 200, platformFee: 50, category: 'Climate',
        progress: 33, contributors: 78, impact: 'Critical for Paris Agreement carbon tracking'
    },

    // ─── HEALTH & MEDICINE ───────────────────────────────────────────
    {
        id: 'who_pubmed', title: 'Pandemic Early Warning System',
        description: 'Semantic analysis of 40M+ medical papers, hospital discharge records, and wastewater surveillance to predict disease outbreak vectors 30+ days ahead.',
        source: 'WHO GHO & PubMed Central', severity: 'critical', location: 'Global',
        dataVolume: '2.4 TB/text', icon: HeartPulse, color: 'text-purple-400', bgColor: 'bg-purple-500/10',
        starsCost: 5000, gstdReward: 400, platformFee: 100, category: 'Health',
        progress: 18, contributors: 214, impact: 'Next pandemic prevention — COVID cost $16T globally'
    },
    {
        id: 'alphafold_protein', title: 'Orphan Disease Drug Discovery',
        description: 'Predict 3D protein structures for 7,000+ rare uncurable genetic diseases using distributed folding. Each solution could unlock a new therapy.',
        source: 'UniProt & NCBI GenBank', severity: 'critical', location: 'Global / Decentralized',
        dataVolume: '120 TB/mo', icon: Dna, color: 'text-emerald-300', bgColor: 'bg-emerald-400/10',
        starsCost: 8000, gstdReward: 640, platformFee: 160, category: 'Health',
        progress: 7, contributors: 341, impact: '350M people suffer from rare diseases worldwide'
    },
    {
        id: 'antibiotic_resistance', title: 'Superbug Mutation Tracker',
        description: 'Sequence-align bacterial genomes from hospital wastewater worldwide to map antibiotic-resistant superbug mutations before they spread.',
        source: 'NCBI SRA & CARD Database', severity: 'critical', location: 'Global Hospital Networks',
        dataVolume: '35 TB/batch', icon: Microscope, color: 'text-lime-400', bgColor: 'bg-lime-500/10',
        starsCost: 6500, gstdReward: 520, platformFee: 130, category: 'Health',
        progress: 22, contributors: 189, impact: 'AMR could kill 10M people/year by 2050 (WHO)'
    },
    {
        id: 'mental_health_nlp', title: 'Global Mental Health Signal Detection',
        description: 'Analyze anonymized social media language patterns, crisis hotline metadata, and public health surveys to map depression/anxiety hotspots and predict suicide risk zones.',
        source: 'Crisis Text Line Data & WHO MH Atlas', severity: 'high', location: 'Global',
        dataVolume: '4.2 TB/mo', icon: Brain, color: 'text-pink-400', bgColor: 'bg-pink-500/10',
        starsCost: 2000, gstdReward: 160, platformFee: 40, category: 'Health',
        progress: 15, contributors: 156, impact: '1 in 4 people affected by mental disorders globally'
    },

    // ─── HUMANITARIAN & SAFETY ────────────────────────────────────────
    {
        id: 'gdelt_crisis', title: 'Humanitarian Crisis Early Warning',
        description: 'Analyze massive global event logs (300M+ news articles/year) to identify emerging humanitarian aid gaps, famine signals, and displacement vectors 2-4 weeks early.',
        source: 'GDELT Project (Global DB)', severity: 'critical', location: 'Global / MENA / Sub-Saharan Africa',
        dataVolume: '14.2 TB/day', icon: Globe2, color: 'text-rose-400', bgColor: 'bg-rose-500/10',
        starsCost: 2000, gstdReward: 160, platformFee: 40, category: 'Humanitarian',
        progress: 34, contributors: 127, impact: '100M people in need of humanitarian assistance (OCHA)'
    },
    {
        id: 'darknet_tracker', title: 'Human Trafficking Vector Analysis',
        description: 'NLP and image hash analysis across Dark Web scrapes to identify illicit supply chains and assist global law enforcement operations anonymously.',
        source: 'OSINT Protocol Drops', severity: 'critical', location: 'Shadow Web / Global',
        dataVolume: '3.1 TB/batch', icon: ShieldCheck, color: 'text-fuchsia-400', bgColor: 'bg-fuchsia-500/10',
        starsCost: 6000, gstdReward: 480, platformFee: 120, category: 'Humanitarian',
        progress: 42, contributors: 78, impact: '50M people in modern slavery (ILO)'
    },
    {
        id: 'osm_disaster', title: 'Disaster Zone Rapid Mapping',
        description: 'Identify damaged infrastructure, blocked roads, and safe zones from satellite imagery in post-disaster areas to optimize rescue routing within hours.',
        source: 'Humanitarian OpenStreetMap', severity: 'high', location: 'Active Disaster Zones',
        dataVolume: '1.2 TB/area', icon: MapPin, color: 'text-red-400', bgColor: 'bg-red-500/10',
        starsCost: 1000, gstdReward: 80, platformFee: 20, category: 'Humanitarian',
        progress: 95, contributors: 48, impact: '339 natural disasters affected 185M people in 2023'
    },
    {
        id: 'refugee_flow', title: 'Refugee Flow Prediction Model',
        description: 'Combine conflict zone satellite data, border crossing reports, and news NLP to predict refugee flows 2-6 weeks ahead, enabling pre-positioned aid.',
        source: 'UNHCR Data & ACAPS', severity: 'high', location: 'Conflict Zones / Borders',
        dataVolume: '2.5 TB/mo', icon: PersonStanding, color: 'text-violet-400', bgColor: 'bg-violet-500/10',
        starsCost: 2500, gstdReward: 200, platformFee: 50, category: 'Humanitarian',
        progress: 28, contributors: 95, impact: '110M forcibly displaced people worldwide (UNHCR)'
    },

    // ─── FOOD & WATER SECURITY ────────────────────────────────────────
    {
        id: 'famine_prediction', title: 'Global Famine Prediction Engine',
        description: 'Correlate crop yield satellite data, commodity prices, rainfall anomalies, and conflict indicators to predict food crises 60-90 days before they peak.',
        source: 'FEWS NET & FAO GIEWS', severity: 'critical', location: 'Horn of Africa / South Asia',
        dataVolume: '6.8 TB/mo', icon: Wheat, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10',
        starsCost: 4000, gstdReward: 320, platformFee: 80, category: 'Food & Water',
        progress: 41, contributors: 132, impact: '783M people face chronic hunger (FAO)'
    },
    {
        id: 'water_stress', title: 'Freshwater Stress Monitoring',
        description: 'Process GRACE satellite gravity data, groundwater well sensors, and snowpack measurements to map aquifer depletion and predict water shortages.',
        source: 'NASA GRACE-FO & WRI Aqueduct', severity: 'high', location: 'Middle East / India / Central Asia',
        dataVolume: '4.5 TB/mo', icon: Droplets, color: 'text-blue-300', bgColor: 'bg-blue-400/10',
        starsCost: 3000, gstdReward: 240, platformFee: 60, category: 'Food & Water',
        progress: 37, contributors: 88, impact: '2.3B people live in water-stressed countries'
    },

    // ─── GEOPHYSICS & NATURAL DISASTERS ──────────────────────────────
    {
        id: 'seismic_array', title: 'Earthquake Precursor Pattern Mining',
        description: 'Analyze real-time low-frequency tectonic data from 30,000+ seismographs to find micro-patterns (foreshocks, radon anomalies) preceding major earthquakes.',
        source: 'IRIS & Global Seismographic Network', severity: 'high', location: 'Pacific Ring of Fire',
        dataVolume: '18.5 TB/day', icon: Activity, color: 'text-orange-400', bgColor: 'bg-orange-500/10',
        starsCost: 4000, gstdReward: 320, platformFee: 80, category: 'Geophysics',
        progress: 52, contributors: 156, impact: 'Earthquakes killed 60,000+ people in 2023 alone'
    },
    {
        id: 'tsunami_model', title: 'Tsunami Propagation Modeling',
        description: 'Run high-resolution ocean floor bathymetry simulations to predict tsunami wave heights and arrival times for every coastal city within 15 minutes of a seismic event.',
        source: 'NOAA DART Buoy Network', severity: 'critical', location: 'All Coastal Zones',
        dataVolume: '7.3 TB/sim', icon: Waves, color: 'text-cyan-400', bgColor: 'bg-cyan-500/10',
        starsCost: 5000, gstdReward: 400, platformFee: 100, category: 'Geophysics',
        progress: 19, contributors: 67, impact: '680M people live in low-lying coastal zones'
    },

    // ─── CYBERSECURITY & INFORMATION ──────────────────────────────────
    {
        id: 'deepfake_firewall', title: 'Deepfake & Disinformation Shield',
        description: 'Run adversarial models to detect synthetic media (video/audio/text) designed to manipulate elections, markets, and public health decisions in real time.',
        source: 'Global Social Firehose', severity: 'high', location: 'North America / EU / APAC',
        dataVolume: '50.1 TB/week', icon: BrainCircuit, color: 'text-cyan-300', bgColor: 'bg-cyan-400/10',
        starsCost: 2500, gstdReward: 200, platformFee: 50, category: 'Cyber Security',
        progress: 71, contributors: 203, impact: 'Protect democratic processes for 4B+ voters'
    },
    {
        id: 'critical_infra', title: 'Critical Infrastructure Threat Intelligence',
        description: 'Monitor and correlate global SCADA/ICS vulnerability disclosures, dark web chatter, and network anomalies to protect power grids, water systems, and hospitals.',
        source: 'CISA ICS-CERT & NVD', severity: 'critical', location: 'Global Infrastructure',
        dataVolume: '2.1 TB/day', icon: Shield, color: 'text-red-300', bgColor: 'bg-red-400/10',
        starsCost: 4000, gstdReward: 320, platformFee: 80, category: 'Cyber Security',
        progress: 38, contributors: 91, impact: 'A single grid attack can black out 100M+ people'
    },

    // ─── SCIENCE & ENERGY ────────────────────────────────────────────
    {
        id: 'cern_physics', title: 'CERN Particle Physics Discovery',
        description: 'Process high-energy collision layer data to assist in foundational physics discoveries and material science breakthroughs for fusion and clean energy.',
        source: 'CERN Open Data Portal', severity: 'medium', location: 'Geneva / Virtual',
        dataVolume: '120 TB/batch', icon: Network, color: 'text-blue-400', bgColor: 'bg-blue-500/10',
        starsCost: 8000, gstdReward: 640, platformFee: 160, category: 'Science & Energy',
        progress: 13, contributors: 92, impact: 'Understanding the universe to unlock clean energy'
    },
    {
        id: 'fusion_sim', title: 'Fusion Plasma Stability Simulation',
        description: 'Simulate tokamak plasma confinement scenarios using magnetohydrodynamic models to accelerate the path to commercial fusion power.',
        source: 'ITER & PPPL Open Data', severity: 'medium', location: 'Global Research Labs',
        dataVolume: '28 TB/sim', icon: Zap, color: 'text-yellow-300', bgColor: 'bg-yellow-400/10',
        starsCost: 7000, gstdReward: 560, platformFee: 140, category: 'Science & Energy',
        progress: 8, contributors: 45, impact: 'Unlimited clean energy for all of humanity'
    },
    {
        id: 'space_debris', title: 'Space Debris Collision Avoidance',
        description: 'Track 40,000+ orbital debris objects and predict collision probabilities for active satellites and the ISS using distributed orbit propagation.',
        source: 'US Space Command TLE Data', severity: 'high', location: 'Low Earth Orbit',
        dataVolume: '5.3 TB/day', icon: Satellite, color: 'text-indigo-400', bgColor: 'bg-indigo-500/10',
        starsCost: 4500, gstdReward: 360, platformFee: 90, category: 'Science & Energy',
        progress: 29, contributors: 67, impact: 'Protect $1T+ space infrastructure'
    },

    // ─── EDUCATION & POVERTY ─────────────────────────────────────────
    {
        id: 'education_gap', title: 'Global Education Gap Analysis',
        description: 'Process UNESCO enrollment data, satellite imagery of school infrastructure, and mobility data to identify where 250M children are denied education.',
        source: 'UNESCO UIS & World Bank EdStats', severity: 'high', location: 'Sub-Saharan Africa / South Asia',
        dataVolume: '1.8 TB/quarter', icon: GraduationCap, color: 'text-indigo-300', bgColor: 'bg-indigo-400/10',
        starsCost: 1500, gstdReward: 120, platformFee: 30, category: 'Society',
        progress: 44, contributors: 167, impact: '250M children out of school worldwide'
    },
    {
        id: 'poverty_mapping', title: 'Poverty Mapping from Space',
        description: 'Use nighttime light satellite imagery, building footprints, and cell tower density to map poverty at 1km² resolution — enabling targeted aid delivery.',
        source: 'VIIRS Nightlight & WorldPop', severity: 'high', location: 'Global South',
        dataVolume: '9.2 TB/mo', icon: Building2, color: 'text-amber-300', bgColor: 'bg-amber-400/10',
        starsCost: 2000, gstdReward: 160, platformFee: 40, category: 'Society',
        progress: 56, contributors: 134, impact: '700M people live in extreme poverty'
    },
    {
        id: 'child_mortality', title: 'Child Mortality Risk Prediction',
        description: 'Combine vaccination records, nutrition surveys, and weather data to predict where under-5 mortality will spike, enabling preventive intervention.',
        source: 'UNICEF MICS & DHS Program', severity: 'critical', location: 'Low-Income Countries',
        dataVolume: '2.1 TB/batch', icon: Baby, color: 'text-pink-300', bgColor: 'bg-pink-400/10',
        starsCost: 3000, gstdReward: 240, platformFee: 60, category: 'Society',
        progress: 31, contributors: 198, impact: '5M children die before age 5 every year'
    },

    // ─── ECONOMY & GOVERNANCE ────────────────────────────────────────
    {
        id: 'financial_contagion', title: 'Systemic Financial Contagion Model',
        description: 'Simulate cascading bank failures across 200+ interconnected institutions using real-time CDS spreads and interbank exposure data.',
        source: 'BIS & ECB Open Data', severity: 'high', location: 'Global Financial System',
        dataVolume: '1.5 TB/cycle', icon: TrendingUp, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10',
        starsCost: 5000, gstdReward: 400, platformFee: 100, category: 'Economy',
        progress: 55, contributors: 73, impact: 'Prevent next financial crisis (2008 cost $22T)'
    },
    {
        id: 'corruption_trace', title: 'Public Spending Anomaly Detection',
        description: 'Analyze government procurement data, corporate registries, and financial flows to detect corruption patterns and illicit wealth transfers.',
        source: 'OCDS & OpenCorporates & ICIJ', severity: 'medium', location: 'Global',
        dataVolume: '5.6 TB/mo', icon: Scale, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10',
        starsCost: 3500, gstdReward: 280, platformFee: 70, category: 'Economy',
        progress: 20, contributors: 56, impact: 'Corruption costs $2.6T/year globally (World Bank)'
    },

    // ─── BIODIVERSITY & OCEANS ───────────────────────────────────────
    {
        id: 'biodiversity_loss', title: 'Species Extinction Risk Modeling',
        description: 'Process audio (bioacoustics), camera trap images, and eDNA sequencing from 15,000+ monitoring stations to track biodiversity loss in real time.',
        source: 'GBIF & IUCN Red List Data', severity: 'critical', location: 'Hotspot Ecosystems',
        dataVolume: '11.4 TB/mo', icon: Sprout, color: 'text-green-300', bgColor: 'bg-green-400/10',
        starsCost: 3000, gstdReward: 240, platformFee: 60, category: 'Biodiversity',
        progress: 26, contributors: 145, impact: '1M species face extinction (IPBES)'
    },
    {
        id: 'ocean_plastic', title: 'Ocean Plastic Drift Prediction',
        description: 'Model microplastic dispersion using ocean current data from Argo floats and satellite altimetry to predict accumulation zones and plan cleanup routes.',
        source: 'Argo Float Network & NOAA', severity: 'medium', location: 'Pacific Gyre / Indian Ocean',
        dataVolume: '6.2 TB/mo', icon: Waves, color: 'text-cyan-400', bgColor: 'bg-cyan-500/10',
        starsCost: 2000, gstdReward: 160, platformFee: 40, category: 'Biodiversity',
        progress: 63, contributors: 95, impact: '11M tons of plastic enter oceans yearly'
    },
];

const CATEGORIES = ['All', ...Array.from(new Set(ACTIVE_SIGNALS.map(s => s.category)))];

const CATEGORY_COLORS: Record<string, string> = {
    'Climate': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    'Health': 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    'Humanitarian': 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    'Food & Water': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    'Geophysics': 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    'Cyber Security': 'text-red-400 bg-red-500/10 border-red-500/20',
    'Science & Energy': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    'Society': 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    'Economy': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    'Biodiversity': 'text-green-400 bg-green-500/10 border-green-500/20',
};

export default function HumanityMonitor() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
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
            } catch (e) { }
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
        const particles: any[] = [];
        for (let i = 0; i < 50; i++) {
            particles.push({
                x: Math.random() * canvas.width, y: Math.random() * canvas.height,
                radius: 0, maxRadius: Math.random() * 100 + 30, speed: Math.random() * 0.35 + 0.1,
                color: ['rgba(14,165,233,', 'rgba(16,185,129,', 'rgba(244,63,94,', 'rgba(168,85,247,', 'rgba(245,158,11,'][Math.floor(Math.random() ** 2 * 5)]
            });
        }
        const animate = (time: number) => {
            if (time - ptime > 30) {
                ctx.fillStyle = 'rgba(2, 6, 23, 0.1)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ptime = time;
            }
            particles.forEach((p) => {
                p.radius += p.speed;
                if (p.radius > p.maxRadius) { p.radius = 0; p.x = Math.random() * canvas.width; p.y = Math.random() * canvas.height; }
                const alpha = (1 - (p.radius / p.maxRadius)) * 0.2;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.strokeStyle = p.color + alpha + ')'; ctx.lineWidth = 0.8; ctx.stroke();
            });
            animationFrameId = requestAnimationFrame(animate);
        };
        animationFrameId = requestAnimationFrame(animate);
        return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(animationFrameId); };
    }, []);

    const handleAnalyzeSignal = async () => {
        if (!selectedSignal) return;
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
                if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.openInvoice) {
                    (window as any).Telegram.WebApp.openInvoice(resp.invoice_url, (status: string) => {
                        if (status === 'paid') {
                            setPurchaseStep(3);
                            setTimeout(() => {
                                toast.success("Signal Dispatched! " + selectedSignal.gstdReward + " GSTD locked for Swarm resolution.");
                                setIsPurchasing(false); setPurchaseStep(0); setSelectedSignal(null);
                                setLiveLogs(prev => [{
                                    id: Math.random().toString(), type: 'SIGNAL_SPONSOR', chain: 'SWARM',
                                    message: `[Sponsored] ${selectedSignal.title} → Swarm processing initiated`, timestamp: new Date().toISOString()
                                }, ...prev].slice(0, 20));
                            }, 2000);
                        } else { toast.error('Payment ' + status); setIsPurchasing(false); setPurchaseStep(0); }
                    });
                } else {
                    window.open(resp.invoice_url, '_blank');
                    setPurchaseStep(3);
                    setTimeout(() => { toast.success("Signal Dispatched!"); setIsPurchasing(false); setPurchaseStep(0); setSelectedSignal(null); }, 2000);
                }
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
        <div className="bg-slate-950 text-white min-h-screen relative overflow-hidden font-sans antialiased selection:bg-sky-500/30">
            <Head>
                <title>Humanity's Supercomputer — GSTD Global Signal Monitor</title>
                <meta name="description" content={`${ACTIVE_SIGNALS.length} planetary-scale signals covering climate, health, security, food, science, and society. Sponsor Swarm analysis to solve humanity's hardest problems.`} />
            </Head>

            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-0" />

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
                                    HUMANITY'S SUPERCOMPUTER
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-bold text-emerald-400 tracking-widest uppercase flex items-center gap-1.5 relative">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping absolute left-2" />
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 relative" />
                                        <span className="ml-1">{ACTIVE_SIGNALS.length} Signals</span>
                                    </span>
                                </h1>
                                <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl leading-relaxed">
                                    Every signal is a real problem facing humanity. Sponsor analysis with Telegram Stars → Swarm solves it → Results train the Global Brain forever.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full md:w-auto">
                            {[
                                { label: 'Health', value: (stats.health * 100).toFixed(0) + '%', color: stats.health > 0.8 ? 'text-emerald-400' : 'text-amber-400', icon: Activity },
                                { label: 'Signals', value: `${criticalCount} critical`, color: 'text-rose-400', icon: AlertTriangle },
                                { label: 'Contributors', value: totalContributors.toLocaleString(), color: 'text-violet-400', icon: Users },
                                { label: 'Reward Pool', value: totalRewardPool.toLocaleString() + ' GSTD', color: 'text-emerald-400', icon: Database },
                            ].map((s, i) => (
                                <div key={i} className="px-3 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl backdrop-blur-xl flex items-center gap-2.5">
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
                            <input type="text" placeholder="Search signals, sources, topics..." value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-slate-900/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500/50 backdrop-blur-xl" />
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                            {CATEGORIES.map(cat => (
                                <button key={cat} onClick={() => setActiveCategory(cat)}
                                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${activeCategory === cat
                                        ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                                        : 'bg-slate-800/50 text-slate-400 border border-slate-700/30 hover:bg-slate-700/50'}`}>
                                    {cat === 'All' ? `All (${ACTIVE_SIGNALS.length})` : cat}
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
                                                <span className={"text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border " + getSeverityStyles(signal.severity)}>{signal.severity}</span>
                                                <span className={"text-[8px] font-bold px-1.5 py-0.5 rounded border " + (CATEGORY_COLORS[signal.category] || 'text-slate-400 bg-slate-800 border-slate-700')}>{signal.category}</span>
                                            </div>
                                            <h2 className="text-sm font-bold text-slate-100 leading-tight group-hover:text-white transition-colors">{signal.title}</h2>
                                        </div>
                                        <div className={`p-1.5 rounded-lg ${signal.bgColor} flex-shrink-0 ml-2`}>
                                            <signal.icon className={`w-4 h-4 ${signal.color}`} />
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 text-[9px] text-slate-500 mb-2 relative z-10">
                                        <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{signal.location}</span>
                                        <span className="flex items-center gap-0.5"><Database className="w-2.5 h-2.5" />{signal.dataVolume}</span>
                                    </div>

                                    <p className="text-[11px] text-slate-400 leading-relaxed mb-2 relative z-10 line-clamp-2">{signal.description}</p>

                                    {signal.impact && (
                                        <div className="text-[10px] text-amber-400/80 bg-amber-500/5 border border-amber-500/10 rounded-lg px-2 py-1 mb-3 relative z-10 flex items-start gap-1">
                                            <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                            <span>{signal.impact}</span>
                                        </div>
                                    )}

                                    {/* Progress */}
                                    <div className="mb-3 relative z-10">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[9px] font-bold text-slate-500 uppercase">Progress</span>
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
                                <p className="text-sm font-bold">No signals found</p>
                                <p className="text-xs mt-1">Try a different category or search term</p>
                            </div>
                        )}
                    </div>

                    {/* ─── RIGHT PANEL ─────────────────────────────────────── */}
                    <div className="w-full lg:w-1/4 flex flex-col gap-4">
                        {/* Network Overview */}
                        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-4">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-violet-400 mb-3 flex items-center gap-2">
                                <BarChart3 className="w-3.5 h-3.5" /> Planetary Overview
                            </h3>
                            <div className="space-y-2.5">
                                {[
                                    { l: 'Total Signals', v: String(ACTIVE_SIGNALS.length), c: 'text-white' },
                                    { l: 'Critical Priority', v: String(criticalCount), c: 'text-rose-400' },
                                    { l: 'Categories', v: String(CATEGORIES.length - 1), c: 'text-sky-400' },
                                    { l: 'Total Contributors', v: totalContributors.toLocaleString(), c: 'text-violet-400' },
                                    { l: 'Reward Pool', v: totalRewardPool.toLocaleString() + ' GSTD', c: 'text-emerald-400' },
                                ].map((r, i) => (
                                    <div key={i} className="flex justify-between items-center">
                                        <span className="text-[10px] text-slate-400">{r.l}</span>
                                        <span className={`text-xs font-bold ${r.c}`}>{r.v}</span>
                                    </div>
                                ))}
                                <div className="pt-2 border-t border-slate-800">
                                    <div className="flex justify-between items-center mb-1.5">
                                        <span className="text-[10px] text-slate-400">Avg. Progress</span>
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
                                <Target className="w-3.5 h-3.5" /> Problems by Domain
                            </h3>
                            <div className="space-y-2">
                                {CATEGORIES.filter(c => c !== 'All').map(cat => {
                                    const count = ACTIVE_SIGNALS.filter(s => s.category === cat).length;
                                    const pct = Math.round((count / ACTIVE_SIGNALS.length) * 100);
                                    return (
                                        <button key={cat} onClick={() => setActiveCategory(cat)}
                                            className="w-full flex items-center justify-between text-left hover:bg-slate-800/50 rounded-lg px-2 py-1 transition-colors">
                                            <span className="text-[10px] font-bold text-slate-300">{cat}</span>
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
                                <Activity className="w-3.5 h-3.5" /> Live Network Feed
                            </h3>
                            <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 custom-scrollbar">
                                {liveLogs.length === 0 ? (
                                    <div className="text-slate-500 text-xs text-center py-8 flex flex-col items-center gap-2">
                                        <Radio className="w-5 h-5 animate-pulse opacity-50" />
                                        Awaiting transmissions...
                                    </div>
                                ) : (
                                    liveLogs.map((log, i) => (
                                        <div key={i} className="pb-2 border-b border-slate-800/80 last:border-0">
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
                        <a href="https://t.me/GSTDBot" target="_blank" rel="noopener noreferrer"
                            className="block bg-gradient-to-br from-sky-600/20 to-violet-600/20 border border-sky-500/30 rounded-2xl p-4 hover:border-sky-400/50 transition-all group">
                            <h3 className="text-sm font-black text-white mb-1 flex items-center gap-2">
                                Become a Neuron <ExternalLink className="w-3 h-3 text-sky-400 group-hover:translate-x-0.5 transition-transform" />
                            </h3>
                            <p className="text-[10px] text-slate-400 leading-relaxed">
                                Your device becomes a brain cell of the planetary supercomputer. Earn GSTD while solving humanity's problems.
                            </p>
                        </a>
                    </div>
                </div>
            </div>

            {/* ─── SPONSOR MODAL ───────────────────────────────────────── */}
            {selectedSignal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md" onClick={() => !isPurchasing && setSelectedSignal(null)} />
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full relative z-10 shadow-[0_0_60px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in duration-300 max-h-[90vh] overflow-y-auto custom-scrollbar">

                        <div className={"w-12 h-12 rounded-xl border flex items-center justify-center mb-4 mx-auto " + selectedSignal.bgColor + " " + getSeverityStyles(selectedSignal.severity).split(' ')[2]}>
                            {isPurchasing && purchaseStep < 3 ? <Zap className={"w-6 h-6 animate-pulse " + selectedSignal.color} />
                                : isPurchasing && purchaseStep === 3 ? <CheckCircle className={"w-6 h-6 " + selectedSignal.color} />
                                    : <selectedSignal.icon className={"w-6 h-6 " + selectedSignal.color} />}
                        </div>

                        <h3 className="text-lg font-black text-white text-center mb-1">Sponsor This Signal</h3>
                        <p className="text-slate-400 text-center text-xs mb-5 leading-relaxed">{selectedSignal.description}</p>

                        {selectedSignal.impact && (
                            <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 mb-4 flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                <span><strong>Why it matters:</strong> {selectedSignal.impact}</span>
                            </div>
                        )}

                        <div className="bg-slate-950/80 rounded-xl p-4 mb-5 border border-slate-800 space-y-2.5">
                            <div className="flex justify-between items-center"><span className="text-xs text-slate-400">Signal</span><span className="text-xs font-bold text-white text-right">{selectedSignal.title}</span></div>
                            <div className="flex justify-between items-center"><span className="text-xs text-slate-400">Data Source</span><span className="text-[10px] font-mono text-sky-400">{selectedSignal.source}</span></div>
                            <div className="flex justify-between items-center"><span className="text-xs text-slate-400">Data Volume</span><span className="text-xs text-slate-300">{selectedSignal.dataVolume}</span></div>
                            <div className="border-t border-slate-800 pt-2.5 space-y-2">
                                <div className="flex justify-between"><span className="text-xs text-slate-400">→ Swarm Workers (85%)</span><span className="text-xs font-bold text-emerald-400">+{selectedSignal.gstdReward} GSTD</span></div>
                                <div className="flex justify-between"><span className="text-xs text-slate-400">→ Gold Reserve (10%)</span><span className="text-xs font-bold text-amber-400">+{selectedSignal.platformFee} GSTD</span></div>
                                <div className="flex justify-between"><span className="text-xs text-slate-400">→ Results stored in</span><span className="text-[10px] font-bold text-violet-400">Collective Memory</span></div>
                            </div>
                            <div className="flex justify-between items-center pt-2.5 border-t border-slate-800">
                                <span className="text-sm font-bold text-white">Sponsorship</span>
                                <span className="text-base font-black text-white flex items-center gap-1.5 bg-slate-800 px-3 py-1 rounded-lg border border-slate-600">
                                    {selectedSignal.starsCost} <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                                </span>
                            </div>
                        </div>

                        {isPurchasing ? (
                            <div className="flex flex-col gap-2.5">
                                <div className="h-10 flex items-center justify-center bg-slate-800/50 rounded-xl border border-slate-700">
                                    <span className="text-sm font-bold text-sky-400 animate-pulse">
                                        {purchaseStep === 1 && "Confirming Stars..."}
                                        {purchaseStep === 2 && "Minting GSTD & Deploying Swarm..."}
                                        {purchaseStep === 3 && "Signal Dispatched to Swarm!"}
                                    </span>
                                </div>
                                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                    <div className="h-full bg-sky-500 transition-all duration-500 ease-out" style={{ width: ((purchaseStep / 3) * 100) + '%' }} />
                                </div>
                            </div>
                        ) : (
                            <div className="flex gap-3">
                                <button onClick={() => setSelectedSignal(null)} className="flex-1 px-3 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-sm font-bold text-slate-300 transition-colors">Cancel</button>
                                <button onClick={handleAnalyzeSignal} className="flex-[2] px-3 py-2.5 rounded-xl text-sm font-bold text-slate-900 bg-sky-400 hover:bg-sky-300 flex items-center justify-center gap-2 transition-all">
                                    <Star className="w-4 h-4" /> Sponsor with Stars
                                </button>
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
