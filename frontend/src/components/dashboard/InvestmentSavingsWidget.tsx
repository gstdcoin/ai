import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { ArrowUpRight } from 'lucide-react';
import { useWalletStore } from '../../store/walletStore';
import { apiGet } from '../../lib/apiClient';

interface TaskCompletionData {
    date: string;
    count: number;
    ton: number;
}

export default function InvestmentSavingsWidget() {
    const { t } = useTranslation('common');
    const [savings, setSavings] = useState<number>(0);
    const { gstdBalance } = useWalletStore();

    useEffect(() => {
        // Determine number of hours user has run compute (proxy via GSTD earned or tasks)
        // For now, we estimate based on completed tasks for the day * avg task duration (simulate)
        // Or we just calculate based on their active worker count.

        // Let's use a simpler heuristic for demo: 
        // AWS t3.medium = $0.0416/hr. GSTD = $0.02/hr. Savings = $0.0216/hr per active node.
        // We can fetch active worker count for user or just show global savings potential.

        // Better: Show "Network Savings Today" vs AWS globally to impress active user.
        const fetchGlobalSavings = async () => {
            try {
                const stats = await apiGet<{ tasks_24h: number }>('/network/stats');
                // Assume avg task execution time is 5 minutes (0.083 hrs)
                // AWS Cost: tasks * 0.083 * $0.0416
                // GSTD Cost: tasks * 0.083 * $0.02
                // Savings = difference
                if (stats && stats.tasks_24h) {
                    const hours = stats.tasks_24h * 0.083; // 5 min avg
                    const awsCost = hours * 0.0416;
                    const gstdCost = hours * 0.02;
                    setSavings(awsCost - gstdCost);
                }
            } catch (e) {
                setSavings(0);
            }
        };

        fetchGlobalSavings();
    }, []);

    return (
        <div className="glass-card p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-500/10 to-transparent rounded-full blur-2xl group-hover:opacity-100 opacity-50 transition-opacity" />

            <div className="relative z-10 flex flex-col justify-between h-full">
                <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-1 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        {t('network_savings_24h') || 'Network Savings (24h)'}
                    </h3>
                    <p className="text-xs text-gray-500 mb-3">vs Amazon EC2 (t3.medium)</p>

                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-white tracking-tight">
                            ${savings.toFixed(2)}
                        </span>
                        <span className="text-green-400 text-sm font-medium flex items-center">
                            <ArrowUpRight size={14} /> 52%
                        </span>
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="text-xs text-gray-400 flex justify-between">
                        <span>AWS Cost:</span>
                        <span className="text-gray-300 line-through">${(savings / 0.52).toFixed(2)}</span>
                    </div>
                    <div className="text-xs text-green-400 flex justify-between mt-1 font-medium">
                        <span>GSTD Cost:</span>
                        <span>${(savings / 0.52 * 0.48).toFixed(2)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
