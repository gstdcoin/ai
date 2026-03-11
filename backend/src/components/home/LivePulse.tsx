'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import { API_BASE_URL } from '../../lib/config';

interface NetworkStats {
    active_workers: number;
    total_gstd_paid: number;
    tasks_24h: number;
    total_tasks: number;
    gold_reserve: number;
    gstd_price_usd: number;
}

interface PulseEvent {
    id: string;
    text: string;
    color: string;
    timestamp: number;
}

/**
 * LivePulse — Streaming terminal showing real network activity.
 * Events are generated ONLY when real data changes between polls.
 * No fake data — if nothing changes, the terminal stays quiet.
 */
export default function LivePulse({ className = '' }: { className?: string }) {
    const { t } = useTranslation('common');
    const [events, setEvents] = useState<PulseEvent[]>([]);
    const prevStatsRef = useRef<NetworkStats | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const eventIdRef = useRef(0);

    const addEvent = (text: string, color: string) => {
        const id = `evt-${++eventIdRef.current}`;
        setEvents(prev => {
            const next = [...prev, { id, text, color, timestamp: Date.now() }];
            // Keep max 30 events
            return next.slice(-30);
        });
    };

    // Poll real network stats and emit events ONLY on actual changes
    useEffect(() => {
        let mounted = true;

        const poll = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/v1/network/stats`);
                if (!res.ok) return;
                const stats: NetworkStats = await res.json();
                if (!mounted) return;

                const prev = prevStatsRef.current;

                if (prev) {
                    // Workers changed
                    const workerDelta = (stats.active_workers ?? 0) - (prev.active_workers ?? 0);
                    if (workerDelta > 0) {
                        addEvent(`+${workerDelta} node${workerDelta > 1 ? 's' : ''} joined the swarm → ${stats.active_workers} active`, 'text-emerald-400');
                    } else if (workerDelta < 0) {
                        addEvent(`${workerDelta} node${Math.abs(workerDelta) > 1 ? 's' : ''} disconnected → ${stats.active_workers} active`, 'text-amber-400');
                    }

                    // New tasks completed
                    const taskDelta = (stats.total_tasks ?? 0) - (prev.total_tasks ?? 0);
                    if (taskDelta > 0) {
                        addEvent(`${taskDelta} task${taskDelta > 1 ? 's' : ''} completed → ${stats.total_tasks?.toLocaleString()} total`, 'text-cyan-400');
                    }

                    // GSTD paid out
                    const gstdDelta = (stats.total_gstd_paid ?? 0) - (prev.total_gstd_paid ?? 0);
                    if (gstdDelta > 0) {
                        addEvent(`${gstdDelta.toFixed(2)} GSTD distributed to workers`, 'text-violet-400');
                    }

                    // Gold reserve changed
                    const goldDelta = (stats.gold_reserve ?? 0) - (prev.gold_reserve ?? 0);
                    if (goldDelta > 0) {
                        addEvent(`+${goldDelta.toFixed(6)} oz XAUt added to reserve → ${stats.gold_reserve?.toFixed(4)} oz`, 'text-amber-400');
                    }

                    // Price movement
                    const priceDelta = (stats.gstd_price_usd ?? 0) - (prev.gstd_price_usd ?? 0);
                    if (Math.abs(priceDelta) > 0.000001 && prev.gstd_price_usd > 0) {
                        const pctChange = ((priceDelta / prev.gstd_price_usd) * 100).toFixed(2);
                        const arrow = priceDelta > 0 ? '↑' : '↓';
                        const color = priceDelta > 0 ? 'text-emerald-400' : 'text-red-400';
                        addEvent(`GSTD ${arrow} $${stats.gstd_price_usd?.toFixed(6)} (${priceDelta > 0 ? '+' : ''}${pctChange}%)`, color);
                    }
                } else {
                    // First load — show initial state
                    addEvent(`Sentinel online · ${stats.active_workers ?? 0} nodes · ${stats.total_tasks?.toLocaleString() ?? 0} tasks`, 'text-cyan-400');
                }

                prevStatsRef.current = { ...stats };
            } catch {
                // Silent — no fake events on error
            }
        };

        poll();
        const interval = setInterval(poll, 15000); // Poll every 15 seconds
        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, []);

    // Auto-scroll on new events
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [events]);

    return (
        <div className={`relative overflow-hidden rounded-2xl border border-white/[0.06] bg-black/60 backdrop-blur-xl ${className}`}>
            {/* Header bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-[11px] font-bold text-white/60 uppercase tracking-[0.2em]">{t('network_pulse', 'Network Pulse')}</span>
                </div>
                <span className="text-[10px] text-white/30 font-mono">{t('sentinellive', 'SENTINEL::LIVE')}</span>
            </div>

            {/* Event stream */}
            <div
                ref={scrollRef}
                className="p-4 h-[200px] overflow-y-auto custom-scrollbar font-mono text-xs space-y-1.5"
            >
                {events.length === 0 ? (
                    <div className="text-gray-600 text-center py-8">
                        <div className="animate-pulse">{t('awaiting_network_activity', 'Awaiting network activity...')}</div>
                    </div>
                ) : (
                    events.map((evt, i) => (
                        <div
                            key={evt.id}
                            className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300"
                            style={{ animationDelay: `${i * 30}ms` }}
                        >
                            <span className="text-white/20 shrink-0 tabular-nums">
                                {new Date(evt.timestamp).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                            <span className={`${evt.color} leading-relaxed`}>
                                {evt.text}
                            </span>
                        </div>
                    ))
                )}
            </div>

            {/* Scanline overlay */}
            <div className="absolute inset-0 pointer-events-none scanline opacity-30" />
        </div>
    );
}
