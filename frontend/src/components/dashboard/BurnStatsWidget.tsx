import React, { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../../lib/apiClient';
import { Flame, TrendingDown, Info, Activity } from 'lucide-react';

interface BurnStats {
    total_burned: number;
    burn_rate: number;
    burn_address: string;
    last_burn_at: string;
    total_supply_original: number;
}

export default function BurnStatsWidget() {
    const [stats, setStats] = useState<BurnStats | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchStats = useCallback(async () => {
        try {
            const response = await apiGet<BurnStats>('/burn/stats');
            setStats(response);
        } catch (error) {
            console.error('Failed to fetch burn stats:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
        const interval = setInterval(fetchStats, 60000);
        return () => clearInterval(interval);
    }, [fetchStats]);

    if (loading && !stats) return <div className="h-40 glass-card animate-pulse" />;

    return (
        <div className="glass-card p-6 border-red-500/10 bg-gradient-to-br from-red-600/[0.03] to-transparent relative overflow-hidden group">
            {/* Animated Background Flame Element */}
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-red-600/10 rounded-full blur-[60px] group-hover:bg-red-600/20 transition-all duration-700" />

            <div className="relative z-10 flex flex-col h-full justify-between">
                <div>
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-2">
                            <Flame className="w-5 h-5 text-orange-500 animate-[pulse_2s_infinite]" />
                            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Deflationary Burn</h3>
                        </div>
                        <div className="px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-[8px] font-black uppercase tracking-widest">
                            {((stats?.burn_rate || 0.05) * 100).toFixed(0)}% Fee Burn
                        </div>
                    </div>

                    <div className="flex items-baseline gap-2 mb-2">
                        <div className="text-4xl font-black text-white tabular-nums">
                            {stats?.total_burned.toFixed(2) || '0.00'}
                        </div>
                        <span className="text-xs font-bold text-gray-500 uppercase">GSTD Burned</span>
                    </div>

                    <div className="flex items-center gap-2 mb-6">
                        <TrendingDown className="w-3 h-3 text-red-400" />
                        <span className="text-[10px] font-bold text-red-400 uppercase tracking-tighter">Supply successfully reduced</span>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <div className="space-y-1">
                            <div className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Black Hole Address</div>
                            <div className="text-[10px] font-mono text-gray-400 truncate max-w-[120px]">
                                {stats?.burn_address || 'EQAAAA...M9c'}
                            </div>
                        </div>
                        <div className="text-right space-y-1">
                            <div className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Last Pulse</div>
                            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
                                {stats?.last_burn_at ? new Date(stats.last_burn_at).toLocaleTimeString() : 'N/A'}
                            </div>
                        </div>
                    </div>

                    {/* Burn Progress Bar (visual only) */}
                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-orange-600 to-red-600 animate-pulse" style={{ width: '45%' }} />
                    </div>
                </div>
            </div>
        </div>
    );
}
