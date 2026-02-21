import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import { Users, TrendingUp, ShieldCheck } from 'lucide-react';
import { apiGet } from '../../lib/apiClient';

export const GlobalNodeGrowthWidget: React.FC = () => {
    const { t } = useTranslation('common');
    const [stats, setStats] = useState<any>(null);
    const [growth, setGrowth] = useState(0);
    const prevWorkersRef = useRef<number>(0);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const data = await apiGet<any>('/network/stats');
                const curr = data?.active_workers ?? 0;
                setStats(data);
                const prev = prevWorkersRef.current;
                if (prev > 0 && curr > prev) {
                    setGrowth(((curr - prev) / prev) * 100);
                } else {
                    setGrowth(0);
                }
                prevWorkersRef.current = curr;
            } catch (err) {
                console.error(err);
            }
        };

        fetchStats();
        const interval = setInterval(fetchStats, 10000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="glass-card p-6 bg-gradient-to-br from-blue-600/[0.05] to-transparent border-blue-500/20 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl -mr-12 -mt-12 group-hover:bg-blue-500/10 transition-colors" />

            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-400" />
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Agent Recruitment</span>
                </div>
                {growth > 0 && (
                    <div className="flex items-center gap-1 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                        <TrendingUp className="w-3 h-3" />
                        +{growth.toFixed(1)}%
                    </div>
                )}
            </div>

            <div className="space-y-4">
                <div>
                    <div className="flex justify-between items-end mb-2">
                        <div className="text-3xl font-black text-white tabular-nums">
                            {stats?.active_workers ?? '—'}
                            <span className="text-xs text-gray-600 font-bold ml-2 uppercase">Verified Nodes</span>
                        </div>
                    </div>
                    {/* Progress to target (10,000 agents) */}
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                        <div
                            className="h-full bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-400 transition-all duration-1000 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                            style={{ width: `${Math.min(((stats?.active_workers ?? 0) / 10000) * 100, 100)}%` }}
                        />
                    </div>
                    <div className="flex justify-between mt-2 text-[9px] font-black text-gray-600 uppercase tracking-widest">
                        <span>Genesis Protocol</span>
                        <span>Goal: 10,000 Agents</span>
                    </div>
                </div>

                <div className="pt-2 flex items-center gap-2">
                    <ShieldCheck className="w-3 h-3 text-emerald-500" />
                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Protocol Omega Synchronized</span>
                </div>
            </div>
        </div>
    );
};
