import { useEffect, useState, useRef, useCallback } from 'react';
import { workerService, ComputeMetrics, PowerProfile } from '../../services/WorkerService';
import { useTranslation } from 'next-i18next';
import { Activity, Zap, Battery, BatteryCharging, Cpu, TrendingUp, Shield, Flame } from 'lucide-react';

/**
 * ComputeNodePanel — The Cyber-Dashboard for TWA Compute Node
 * Shows real-time TFLOPS, GSTD earnings, battery status, and power controls.
 *
 * Features:
 * - Live TFLOPS graph (canvas-based, 60fps)
 * - Battery-aware status indicator
 * - Power profile switcher (Eco/Balance/Max)
 * - "Ignite Node" button with Wake Lock
 * - Session stats: uptime, ops, GSTD earned
 */
export function ComputeNodePanel() {
    const { t } = useTranslation('common');
    const [isRunning, setIsRunning] = useState(false);
    const [isIgniting, setIsIgniting] = useState(false);
    const [metrics, setMetrics] = useState<ComputeMetrics>(workerService.metrics);
    const [powerProfile, setPowerProfile] = useState<PowerProfile>(workerService.powerProfile);
    const [lastStats, setLastStats] = useState<any>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animFrameRef = useRef<number>(0);

    // Subscribe to worker state
    useEffect(() => {
        const unsub = workerService.subscribe((state) => {
            setIsRunning(state === 'running');
            setIsIgniting(state === 'igniting');
        });
        return unsub;
    }, []);

    // Subscribe to metrics
    useEffect(() => {
        const unsub = workerService.subscribeMetrics((m) => {
            setMetrics({ ...m });
        });
        return unsub;
    }, []);

    // Subscribe to per-task stats
    useEffect(() => {
        const unsub = workerService.subscribeStats((data) => {
            setLastStats(data);
        });
        return unsub;
    }, []);

    // ═══ TFLOPS Chart ═══
    const drawChart = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const w = rect.width;
        const h = rect.height;
        const history = metrics.tflopsHistory || [];

        // Background
        ctx.clearRect(0, 0, w, h);

        if (history.length < 2) {
            // No data yet — show placeholder
            ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
            ctx.font = '12px Inter, system-ui';
            ctx.textAlign = 'center';
            ctx.fillText(isRunning ? 'Computing...' : 'Ignite to start', w / 2, h / 2);
            return;
        }

        // Find max TFLOPS for scaling
        const maxTflops = Math.max(...history.map(h => h.tflops), 0.001);
        const points: [number, number][] = [];
        const stepX = w / (Math.max(history.length - 1, 1));

        history.forEach((entry, i) => {
            const x = i * stepX;
            const y = h - (entry.tflops / maxTflops) * (h - 10) - 5;
            points.push([x, y]);
        });

        // Gradient fill
        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.3)');
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');

        ctx.beginPath();
        ctx.moveTo(points[0][0], h);
        points.forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.lineTo(points[points.length - 1][0], h);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // Line
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
            const xc = (points[i - 1][0] + points[i][0]) / 2;
            const yc = (points[i - 1][1] + points[i][1]) / 2;
            ctx.quadraticCurveTo(points[i - 1][0], points[i - 1][1], xc, yc);
        }
        ctx.lineTo(points[points.length - 1][0], points[points.length - 1][1]);
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Current value dot
        const last = points[points.length - 1];
        ctx.beginPath();
        ctx.arc(last[0], last[1], 4, 0, Math.PI * 2);
        ctx.fillStyle = '#818cf8';
        ctx.fill();
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Labels
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '10px Inter, system-ui';
        ctx.textAlign = 'left';
        ctx.fillText(`${maxTflops.toFixed(4)} TFLOPS`, 4, 12);
        ctx.textAlign = 'right';
        ctx.fillText('now', w - 4, h - 4);
    }, [metrics.tflopsHistory, isRunning]);

    // Redraw chart on metrics change
    useEffect(() => {
        drawChart();
    }, [drawChart]);

    const handleToggle = () => {
        if (isRunning) {
            workerService.pause();
        } else {
            workerService.ignite();
        }
    };

    const handleProfileChange = (profile: PowerProfile) => {
        setPowerProfile(profile);
        workerService.setPowerProfile(profile);
    };

    const formatUptime = (ms: number) => {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        if (h > 0) return `${h}h ${m % 60}m`;
        if (m > 0) return `${m}m ${s % 60}s`;
        return `${s}s`;
    };

    const batteryColor = metrics.batteryLevel > 50 ? '#22c55e' :
        metrics.batteryLevel > 20 ? '#f59e0b' : '#ef4444';

    const profileLabels: Record<string, string> = {
        'eco': '🌿 Eco',
        'balance': '⚡ Balance',
        'max': '🔥 Max',
        'critical': '🔋 Battery Save',
    };

    return (
        <div className="space-y-4">
            {/* ═══ STATUS HERO ═══ */}
            <div style={{
                background: isRunning
                    ? 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))'
                    : 'rgba(8,8,26,0.8)',
                border: `1px solid ${isRunning ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 20,
                padding: '24px',
                position: 'relative',
                overflow: 'hidden',
            }}>
                {/* Animated background pulse when running */}
                {isRunning && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        background: 'radial-gradient(circle at 50% 50%, rgba(99,102,241,0.08), transparent 70%)',
                        animation: 'pulse 3s ease-in-out infinite',
                    }} />
                )}

                <div style={{ position: 'relative', zIndex: 1 }}>
                    {/* Top row: status + battery */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className={`p-3 rounded-xl ${isRunning ? 'bg-indigo-500/20' : 'bg-white/[0.04]'}`}>
                                {isIgniting ? (
                                    <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                ) : isRunning ? (
                                    <Cpu size={24} className="text-indigo-400" />
                                ) : (
                                    <Flame size={24} className="text-gray-600" />
                                )}
                            </div>
                            <div>
                                <div className={`text-lg font-bold ${isRunning ? 'text-indigo-400' : 'text-gray-400'}`}>
                                    {isIgniting ? 'Igniting...' : isRunning ? 'Computing' : 'Neural Node Idle'}
                                </div>
                                <div className="text-[11px] text-gray-600">
                                    {isRunning
                                        ? `${profileLabels[metrics.effectiveProfile] || '⚡ Active'} · ${formatUptime(metrics.sessionUptime)}`
                                        : 'Tap below to start earning GSTD'
                                    }
                                </div>
                            </div>
                        </div>

                        {/* Battery indicator */}
                        <div className="flex items-center gap-2">
                            {metrics.isCharging ? (
                                <BatteryCharging size={18} style={{ color: batteryColor }} />
                            ) : (
                                <Battery size={18} style={{ color: batteryColor }} />
                            )}
                            <span className="text-sm font-bold tabular-nums" style={{ color: batteryColor }}>
                                {metrics.batteryLevel}%
                            </span>
                        </div>
                    </div>

                    {/* TFLOPS + GSTD big numbers */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="text-center">
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">TFLOPS</div>
                            <div className="text-2xl font-black text-white tabular-nums">
                                {metrics.tflops > 0 ? metrics.tflops.toFixed(4) : '0'}
                            </div>
                        </div>
                        <div className="text-center">
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">GSTD Earned</div>
                            <div className="text-2xl font-black text-emerald-400 tabular-nums">
                                {metrics.totalGSTD.toFixed(5)}
                            </div>
                        </div>
                        <div className="text-center">
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Tasks</div>
                            <div className="text-2xl font-black text-white tabular-nums">
                                {metrics.totalOps}
                            </div>
                        </div>
                    </div>

                    {/* TFLOPS Chart */}
                    <div style={{
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: 12,
                        padding: '8px',
                        marginBottom: '16px',
                    }}>
                        <canvas
                            ref={canvasRef}
                            style={{ width: '100%', height: '80px', display: 'block' }}
                        />
                    </div>

                    {/* Ignite / Stop Button */}
                    <button
                        onClick={handleToggle}
                        disabled={isIgniting}
                        style={{
                            width: '100%',
                            padding: '14px',
                            borderRadius: 14,
                            border: 'none',
                            background: isRunning
                                ? 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.1))'
                                : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            color: isRunning ? '#f87171' : 'white',
                            fontSize: '16px',
                            fontWeight: 800,
                            cursor: isIgniting ? 'wait' : 'pointer',
                            transition: 'all 0.2s',
                            letterSpacing: '0.5px',
                        }}
                        className="active:scale-[0.98]"
                    >
                        {isIgniting ? '⚡ Igniting Neural Node...' : isRunning ? '⏸ Stop Computing' : '🔥 Ignite Node'}
                    </button>
                </div>
            </div>

            {/* ═══ POWER PROFILE SELECTOR ═══ */}
            <div style={{
                background: 'rgba(8,8,26,0.8)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 16,
                padding: '16px',
            }}>
                <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">
                    Power Profile
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {(['eco', 'balance', 'max'] as PowerProfile[]).map((p) => (
                        <button
                            key={p}
                            onClick={() => handleProfileChange(p)}
                            style={{
                                padding: '10px 8px',
                                borderRadius: 12,
                                border: `1px solid ${powerProfile === p ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)'}`,
                                background: powerProfile === p ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                            className="active:scale-[0.97]"
                        >
                            <div className="text-center">
                                <div className="text-lg mb-1">
                                    {p === 'eco' ? '🌿' : p === 'balance' ? '⚡' : '🔥'}
                                </div>
                                <div className={`text-xs font-bold ${powerProfile === p ? 'text-indigo-400' : 'text-gray-500'}`}>
                                    {p === 'eco' ? 'Eco' : p === 'balance' ? 'Balance' : 'Max'}
                                </div>
                                <div className="text-[9px] text-gray-600 mt-0.5">
                                    {p === 'eco' ? '~30% CPU' : p === 'balance' ? '~60% CPU' : '~100% CPU'}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
                {metrics.effectiveProfile === 'critical' && (
                    <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                        <div className="flex items-center gap-2 text-xs text-red-400">
                            <Battery size={14} />
                            <span className="font-bold">Battery Critical ({metrics.batteryLevel}%)</span>
                        </div>
                        <div className="text-[10px] text-red-400/70 mt-1">
                            CPU throttled to 10%. Plug in charger for full performance.
                        </div>
                    </div>
                )}
            </div>

            {/* ═══ LIVE STATS ═══ */}
            {isRunning && lastStats && (
                <div style={{
                    background: 'rgba(8,8,26,0.8)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 16,
                    padding: '16px',
                }}>
                    <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">
                        Last Task
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2">
                            <Activity size={14} className="text-sky-400" />
                            <div>
                                <div className="text-[10px] text-gray-600">Latency</div>
                                <div className="text-sm font-bold text-white tabular-nums">
                                    {lastStats.latency?.toFixed(0) || 0}ms
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <TrendingUp size={14} className="text-emerald-400" />
                            <div>
                                <div className="text-[10px] text-gray-600">Reward</div>
                                <div className="text-sm font-bold text-emerald-400 tabular-nums">
                                    +{(lastStats.reward || 0).toFixed(5)} GSTD
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Cpu size={14} className="text-indigo-400" />
                            <div>
                                <div className="text-[10px] text-gray-600">TFLOPS</div>
                                <div className="text-sm font-bold text-white tabular-nums">
                                    {(lastStats.tflops || 0).toFixed(4)}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Shield size={14} className="text-violet-400" />
                            <div>
                                <div className="text-[10px] text-gray-600">Profile</div>
                                <div className="text-sm font-bold text-white">
                                    {profileLabels[lastStats.profile] || lastStats.profile}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 0.5; }
                    50% { opacity: 1; }
                }
            `}</style>
        </div>
    );
}
