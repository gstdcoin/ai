import { useEffect, useState, useMemo, useRef } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { apiGet } from '@/lib/apiClient';

// Dynamic import for Map to avoid SSR issues
const Map = dynamic(() => import('react-map-gl'), { ssr: false });

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
                <Map
                    initialViewState={{
                        longitude: 0,
                        latitude: 20,
                        zoom: 1.5
                    }}
                    style={{ width: '100%', height: '100%' }}
                    mapStyle="mapbox://styles/mapbox/dark-v11"
                    mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || "pk.eyJ1IjoiZGVtb3VzZXIiLCJhIjoiY2x4eTh5eG15MGR3ZDJxcXEzM2F5dG5wOSJ9.SAMPLE_TOKEN"}
                >
                    {/* Render simple HTML dots for points inside Map optionally or outside if using overlay */}
                </Map>

                {/* Fallback visualization if map doesn't load or token missing (simulated grid) */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20 bg-[url('/grid-pattern.png')] bg-repeat" style={{ display: loading ? 'flex' : 'none' }}>
                    <div className="text-center">
                        <p className="mb-2">Mapbox Token Required for 3D View</p>
                        <div className="w-64 h-64 border border-cyan-500/30 rounded-full animate-ping mx-auto" />
                    </div>
                </div>

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

