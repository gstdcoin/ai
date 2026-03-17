import React, { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { Network, Activity, Cpu, BrainCircuit, Globe, ArrowRightLeft, DollarSign, Database, Loader2 } from 'lucide-react';
import { apiGet } from '../../lib/apiClient';

interface SwarmStats {
    activeAgents: number;
    tasksProcessed24h: number;
    totalGstdLocked: number;
    totalYield: number;
    omniChainRoutes: { chain: string; volume: number; tvl: number }[];
}

export const SwarmActivityWidget: React.FC = () => {
    const { t } = useTranslation('common');
    const [stats, setStats] = useState<SwarmStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Honest fallback — show real zeros, not fake millions
    const fallbackStats: SwarmStats = {
        activeAgents: 0,
        tasksProcessed24h: 0,
        totalGstdLocked: 0,
        totalYield: 0,
        omniChainRoutes: [
            { chain: 'TON', volume: 0, tvl: 0 },
        ]
    };

    useEffect(() => {
        const fetchStats = async () => {
            try {
                // Try swarm-stats first, fall back to network/stats
                let response = await apiGet<any>('/network/swarm-stats');
                if (!response || !response.activeAgents) {
                    response = await apiGet<any>('/network/stats');
                }
                if (response) {
                    setStats({
                        activeAgents: response.activeAgents || response.active_workers || response.active_devices_count || 0,
                        tasksProcessed24h: response.tasksProcessed24h || response.tasks_24h || response.tasks_last_24h || 0,
                        totalGstdLocked: response.totalGstdLocked || response.total_gstd_distributed || 0,
                        totalYield: response.totalYield || 0,
                        omniChainRoutes: response.omniChainRoutes || [
                            { chain: 'TON', volume: response.total_tasks || 0, tvl: response.total_gstd_paid || 0 },
                        ]
                    });
                } else {
                    setStats(fallbackStats);
                }
            } catch (e) {
                setStats(fallbackStats);
            } finally {
                setIsLoading(false);
            }
        };
        fetchStats();
        const interval = setInterval(fetchStats, 15000);
        return () => clearInterval(interval);
    }, []);

    if (isLoading) {
        return (
            <div className="bg-[#030014]/50 border border-blue-500/20 rounded-2xl p-6 flex items-center justify-center min-h-[350px]">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            </div>
        );
    }

    return (
        <div className="bg-[#030014]/50 border border-blue-500/20 rounded-2xl p-6 relative overflow-hidden group">
            {/* Background Effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-50 group-hover:opacity-100 transition-opacity" />
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-colors" />

            <div className="flex items-center justify-between mb-6 relative z-10">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                        <BrainCircuit className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-white uppercase tracking-wider">{t('super_grid', 'Super-Intelligent Grid')}</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                            </span>
                            <span className="text-[10px] text-blue-400 uppercase font-bold tracking-widest leading-none">{t('global_routes', 'Global Routes Active')}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6 relative z-10">
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 hover:border-blue-500/30 transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                        <Network className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs text-gray-400 font-bold uppercase truncate">{t('active_nodes', 'Active Nodes')}</span>
                    </div>
                    <div className="text-2xl font-black text-white whitespace-nowrap overflow-hidden text-ellipsis">
                        {stats?.activeAgents.toLocaleString()}
                    </div>
                </div>

                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 hover:border-purple-500/30 transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                        <Cpu className="w-4 h-4 text-purple-400" />
                        <span className="text-xs text-gray-400 font-bold uppercase truncate">{t('total_tasks_24h', 'Total Tasks (24h)')}</span>
                    </div>
                    <div className="text-2xl font-black text-white whitespace-nowrap overflow-hidden text-ellipsis">
                        {(stats?.tasksProcessed24h || 0) > 1000000 ? `${((stats?.tasksProcessed24h || 0) / 1000000).toFixed(1)}M` : stats?.tasksProcessed24h.toLocaleString()}
                    </div>
                </div>
            </div>

            {/* Omni-Chain Swarm Financials */}
            <div className="border border-white/10 bg-black/40 rounded-xl p-4 relative z-10">
                <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Globe className="w-4 h-4" />{t('omnichain_swarm_tvl', 'Omni-Chain Swarm TVL')}</h4>

                <div className="space-y-3">
                    {stats?.omniChainRoutes.map((route, i) => (
                        <div key={i} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${route.chain === 'TON' ? 'bg-blue-500' : route.chain === 'Solana' ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
                                <span className="text-sm font-bold text-gray-300">{route.chain}</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold">{t('volume', 'Volume')}</div>
                                    <div className="text-xs text-white font-mono">{route.volume > 0 ? route.volume.toLocaleString() : '—'}</div>
                                </div>
                                <div className="text-right w-16">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold">{t('tvl', 'TVL')}</div>
                                    <div className="text-xs text-green-400 font-mono">{route.tvl > 0 ? `${route.tvl.toFixed(2)} GSTD` : '—'}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-amber-500" />
                        <span className="text-xs font-bold text-gray-400 uppercase">{t('total_escrowed', 'Total GSTD Escrowed')}</span>
                    </div>
                    <div className="text-sm font-black text-amber-400">
                        {stats?.totalGstdLocked.toLocaleString()} GSTD
                    </div>
                </div>
            </div>
        </div>
    );
};
