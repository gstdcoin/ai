import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { Shield, Activity, Zap, Server } from 'lucide-react';
import { apiGet } from '../../lib/apiClient';

interface AutonomyStats {
    status: string;
    self_healed_tasks: number;
    maintenance_active: boolean;
    last_cycle: string;
    briefing_enabled: boolean;
}

export default function SystemHealth() {
    const { t } = useTranslation('common');
    const [stats, setStats] = useState<AutonomyStats | null>(null);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const data = await apiGet<AutonomyStats>('/network/autonomy');
                if (data && typeof data === 'object') {
                    setStats(data);
                }
            } catch (e) {
                console.error("Failed to fetch autonomy stats", e);
            }
        };

        fetchStats();
        const interval = setInterval(fetchStats, 60000);
        return () => clearInterval(interval);
    }, []);

    if (!stats) return null;

    return (
        <div className="glass-card rounded-xl p-6 border border-emerald-500/20 bg-emerald-500/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
                <Shield size={64} className="text-emerald-400" />
            </div>

            <div className="relative z-10">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <h3 className="text-lg font-bold text-white">
                        {t('system_autonomy') || 'Autonomous System Health'}
                    </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="flex flex-col">
                        <span className="text-xs text-gray-400 uppercase tracking-widest mb-1">{t('op_status') || 'Operational Status'}</span>
                        <span className="text-xl font-bold text-emerald-400 flex items-center gap-2">
                            <Activity size={18} />
                            {stats.status.toUpperCase()}
                        </span>
                    </div>

                    <div className="flex flex-col">
                        <span className="text-xs text-gray-400 uppercase tracking-widest mb-1">{t('self_healing') || 'Self-Healed Tasks'}</span>
                        <span className="text-xl font-bold text-white flex items-center gap-2">
                            <Zap size={18} className="text-yellow-400" />
                            {stats.self_healed_tasks}
                        </span>
                    </div>

                    <div className="flex flex-col">
                        <span className="text-xs text-gray-400 uppercase tracking-widest mb-1">{t('maintenance_mode') || 'Active Maintenance'}</span>
                        <span className={`text-xl font-bold ${stats.maintenance_active ? 'text-blue-400' : 'text-gray-400'} flex items-center gap-2`}>
                            <Server size={18} />
                            {stats.maintenance_active ? 'ACTIVE' : 'IDLE'}
                        </span>
                    </div>

                    <div className="flex flex-col">
                        <span className="text-xs text-gray-400 uppercase tracking-widest mb-1">{t('next_cycle') || 'Last Cycle'}</span>
                        <span className="text-sm font-mono text-gray-300">
                            {new Date(stats.last_cycle).toLocaleTimeString()}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
