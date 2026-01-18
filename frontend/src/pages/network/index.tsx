import { useEffect, useState, useMemo, useRef } from 'react';
import Head from 'next/head';
import { apiGet } from '@/lib/apiClient';

// Simple CSS-based world map visualization (no external dependencies)
const WorldMapBackground = () => (
    <svg
        viewBox="0 0 1000 500"
        className="absolute inset-0 w-full h-full opacity-20"
        preserveAspectRatio="xMidYMid slice"
    >
        {/* Simplified world map outlines */}
        <defs>
            <linearGradient id="mapGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#0ea5e9', stopOpacity: 0.3 }} />
                <stop offset="100%" style={{ stopColor: '#8b5cf6', stopOpacity: 0.3 }} />
            </linearGradient>
        </defs>
        {/* Grid lines */}
        {Array.from({ length: 18 }).map((_, i) => (
            <line key={`v-${i}`} x1={i * 56} y1="0" x2={i * 56} y2="500" stroke="#22d3ee" strokeWidth="0.5" opacity="0.2" />
        ))}
        {Array.from({ length: 9 }).map((_, i) => (
            <line key={`h-${i}`} x1="0" y1={i * 56} x2="1000" y2={i * 56} stroke="#22d3ee" strokeWidth="0.5" opacity="0.2" />
        ))}
        {/* Continents simplified outlines */}
        <ellipse cx="200" cy="200" rx="80" ry="60" fill="url(#mapGradient)" /> {/* NA */}
        <ellipse cx="250" cy="320" rx="40" ry="80" fill="url(#mapGradient)" /> {/* SA */}
        <ellipse cx="480" cy="180" rx="60" ry="50" fill="url(#mapGradient)" /> {/* EU */}
        <ellipse cx="520" cy="280" rx="70" ry="80" fill="url(#mapGradient)" /> {/* AF */}
        <ellipse cx="700" cy="200" rx="100" ry="70" fill="url(#mapGradient)" /> {/* AS */}
        <ellipse cx="850" cy="380" rx="50" ry="40" fill="url(#mapGradient)" /> {/* AU */}
    </svg>
);

interface NetworkPoint {
    node_id: string;
    latency: number;
    packet_loss: number;
    connection_type: string;
    lat: number;
    lng: number;
    recorded_at: string;
}

export default function NetworkMapPage() {
    const [points, setPoints] = useState<NetworkPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [secretMode, setSecretMode] = useState(false);
    const lastClickRef = useRef(0);
    const clickCountRef = useRef(0);

    useEffect(() => {
        fetchPoints();
        const interval = setInterval(fetchPoints, 10000); // Live updates
        return () => clearInterval(interval);
    }, []);

    const fetchPoints = async () => {
        try {
            const data = await apiGet<NetworkPoint[]>('/network/map');
            setPoints(data || []);
        } catch (err) {
            console.error("Failed to fetch map data", err);
        } finally {
            setLoading(false);
        }
    };

    // Calculate stats
    const stats = useMemo(() => {
        const activeNodes = new Set(points.map(p => p.node_id)).size;
        const avgLatency = points.length > 0
            ? Math.round(points.reduce((acc, p) => acc + p.latency, 0) / points.length)
            : 0;
        const avgLoss = points.length > 0
            ? (points.reduce((acc, p) => acc + p.packet_loss, 0) / points.length).toFixed(2)
            : "0.00";

        return { activeNodes, avgLatency, avgLoss };
    }, [points]);

    return (
        <div className="min-h-screen bg-[#050510] text-white overflow-hidden relative font-sans selection:bg-cyan-500/30">
            <Head>
                <title>Global Connectivity Map | GSTD Network</title>
                <link href="https://api.mapbox.com/mapbox-gl-js/v3.1.2/mapbox-gl.css" rel="stylesheet" />
            </Head>

            {/* Decorative background elements */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px]" />
            </div>

            {/* Header Overlay */}
            <div className="absolute top-0 left-0 right-0 z-20 p-6 pointer-events-none">
                <div className="max-w-7xl mx-auto flex justify-between items-start">
                    <div className="pointer-events-auto bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl shadow-cyan-900/10">
                        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500 mb-1">
                            GSTD Global Grid
                        </h1>
                        <p className="text-sm text-gray-400 uppercase tracking-widest mb-4 font-mono">
                            Live Network Topology
                        </p>

                        <div className="grid grid-cols-3 gap-6">
                            <div>
                                <div className="text-xs text-gray-500 mb-1">Active Nodes</div>
                                <div className="text-2xl font-mono text-white flex items-center">
                                    <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />
                                    {stats.activeNodes}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 mb-1">Avg Latency</div>
                                <div className="text-2xl font-mono text-cyan-400">{stats.avgLatency}ms</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 mb-1">Signal Health</div>
                                <div className="text-2xl font-mono text-emerald-400">{100 - parseFloat(stats.avgLoss.toString())}%</div>
                            </div>
                        </div>
                    </div>

                    <div className="pointer-events-auto">
                        <a href="/" className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm transition-all backdrop-blur-md">
                            ← Back to Dashboard
                        </a>
                    </div>
                </div>
            </div>

            {/* Map Container */}
            <div className="w-full h-screen z-10 relative">
                <WorldMapBackground />

                {/* Loading indicator */}
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="text-center">
                            <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4" />
                            <p className="text-gray-400">Loading network data...</p>
                        </div>
                    </div>
                )}

                {/* Render simple HTML dots for points if map is not interactive (simplified view) */}
                {points.map((p, i) => (
                    <div
                        key={i}
                        className={`absolute w-2 h-2 rounded-full shadow-[0_0_10px] animate-pulse ${secretMode
                            ? 'bg-purple-600 shadow-purple-500' // Radiation / Signal Mode
                            : 'bg-cyan-500 shadow-cyan-500'     // Performance Mode
                            }`}
                        style={{
                            left: `${(p.lng + 180) / 360 * 100}%`,
                            top: `${(90 - p.lat) / 180 * 100}%`,
                            transform: 'translate(-50%, -50%)',
                            opacity: secretMode ? 0.8 : 0.6
                        }}
                        title={secretMode ? `Signal: ${(p.packet_loss * 100).toFixed(1)}dBm` : `Node: ${p.node_id}`}
                    />
                ))}

            </div>

            {/* Hidden Trigger Area (Bottom Left) */}
            <div
                className="absolute bottom-10 left-0 w-20 h-20 z-50 cursor-default opacity-0"
                onClick={() => {
                    // Click 5 times to toggle secret mode
                    const now = Date.now();
                    if (now - lastClickRef.current < 500) {
                        clickCountRef.current += 1;
                    } else {
                        clickCountRef.current = 1;
                    }
                    lastClickRef.current = now;

                    if (clickCountRef.current >= 5) {
                        setSecretMode(prev => !prev);
                        clickCountRef.current = 0;
                    }
                }}
            />

            {/* Bottom Status Bar */}
            <div className="absolute bottom-0 left-0 right-0 z-20 bg-black/60 backdrop-blur-md border-t border-white/5 p-2">
                <div className="max-w-7xl mx-auto flex justify-between items-center text-xs text-gray-400 font-mono">
                    <div>SYSTEM: OPERATIONAL</div>
                    <div className="flex gap-4">
                        <span>GENESIS_TASK_ID: GENESIS_MAP</span>
                        <span>PROTOCOL: v1.0.2</span>
                        <span className="text-cyan-500">ENCRYPTION: AES-256</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

