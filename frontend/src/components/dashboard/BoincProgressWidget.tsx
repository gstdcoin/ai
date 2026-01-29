import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { Activity, Beaker, CheckCircle, Globe } from 'lucide-react';
import { apiGet } from '../../lib/apiClient';

interface BoincStats {
    active_tasks: number;
    completed_24h: number;
    success_rate: number;
    active_projects: number;
    status: string;
    last_update: string;
}

export default function BoincProgressWidget() {
    const { t } = useTranslation('common');
    const [stats, setStats] = useState<BoincStats | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchStats = async () => {
        try {
            const data = await apiGet<BoincStats>('/boinc/stats');
            setStats(data);
        } catch (err) {
            console.error('Failed to fetch BOINC stats:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
        const interval = setInterval(fetchStats, 30000);
        return () => clearInterval(interval);
    }, []);

    if (loading && !stats) {
        return (
            <div className="glass-card p-6 h-[200px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
            </div>
        );
    }

    return (
        <div className="glass-card p-6 relative overflow-hidden group border-cyan-500/20 bg-gradient-to-br from-cyan-900/10 to-blue-900/5 hover:border-cyan-500/40 transition-all duration-300">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Beaker className="w-24 h-24 text-cyan-400" />
            </div>

            <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Beaker className="w-5 h-5 text-cyan-400" />
                            {t('science_bridge') || 'Science Bridge (BOINC)'}
                        </h3>
                        <p className="text-xs text-gray-400 mt-1">
                            {t('boinc_contribution_desc') || 'GSTD Network contributing to global research'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                        </span>
                        <span className="text-[10px] text-cyan-400 font-mono uppercase tracking-widest">Live</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <span className="text-xs text-gray-500 block uppercase tracking-tighter">Active Tasks</span>
                        <div className="text-2xl font-bold text-white flex items-baseline gap-2">
                            {stats?.active_tasks || 0}
                            <Activity className="w-3 h-3 text-cyan-400 animate-pulse" />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <span className="text-xs text-gray-500 block uppercase tracking-tighter">Success Rate</span>
                        <div className="text-2xl font-bold text-green-400">
                            {stats?.success_rate.toFixed(1)}%
                        </div>
                    </div>

                    <div className="space-y-1">
                        <span className="text-xs text-gray-500 block uppercase tracking-tighter">Projects</span>
                        <div className="text-xl font-semibold text-gray-200 flex items-center gap-2">
                            <Globe className="w-4 h-4 text-blue-400" />
                            {stats?.active_projects || 0}
                        </div>
                    </div>

                    <div className="space-y-1">
                        <span className="text-xs text-gray-500 block uppercase tracking-tighter">Completed (24h)</span>
                        <div className="text-xl font-semibold text-gray-200 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            {stats?.completed_24h || 0}
                        </div>
                    </div>
                </div>

                {/* Progress Bar logic for heavy tasks */}
                <div className="mt-6 space-y-2">
                    <div className="flex justify-between text-[10px] text-gray-500 uppercase font-mono">
                        <span>Infrastructure Utilization</span>
                        <span>{((stats?.active_tasks || 0) > 0 ? 15 : 0)}%</span>
                    </div>
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)] transition-all duration-1000"
                            style={{ width: `${(stats?.active_tasks || 0) > 0 ? 15 : 0}%` }}
                        ></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
