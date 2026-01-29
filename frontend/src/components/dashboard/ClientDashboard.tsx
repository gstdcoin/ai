import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import { apiGet, apiPost } from '../../lib/apiClient';
import {
    Package,
    Clock,
    CheckCircle,
    XCircle,
    DollarSign,
    TrendingUp,
    RefreshCw,
    Loader2,
    Eye,
    Trash2,
    AlertTriangle,
    Calendar,
    Users,
    TrendingDown,
    Zap,
    Info,
    ArrowUpRight
} from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { toast } from '../../lib/toast';
import { Tooltip } from '../ui/Tooltip';
import { NetworkMap } from './NetworkMap';
import { ActivityFeed } from './ActivityFeed';

interface EscrowRecord {
    id: number;
    task_id: string;
    creator_wallet: string;
    budget_gstd: number;
    platform_fee_gstd: number;
    total_locked_gstd: number;
    difficulty: string;
    task_type: string;
    geography: string;
    status: string;
    locked_at: string;
    workers_paid: number;
    total_paid_gstd: number;
}

interface ClientStats {
    total_tasks_created: number;
    active_tasks: number;
    completed_tasks: number;
    failed_tasks: number;
    total_spent_gstd: number;
    total_locked_gstd: number;
    avg_completion_time_min: number;
}

interface ClientTask {
    task_id: string;
    task_type: string;
    operation: string;
    status: string;
    budget_gstd: number;
    workers_completed: number;
    max_workers: number;
    created_at: string;
    completed_at: string | null;
}

export const ClientDashboard: React.FC = () => {
    const { t } = useTranslation('common');
    const { address } = useWalletStore();
    const [stats, setStats] = useState<ClientStats | null>(null);
    const [tasks, setTasks] = useState<ClientTask[]>([]);
    const [escrows, setEscrows] = useState<EscrowRecord[]>([]);
    const [spendHistory, setSpendHistory] = useState<any[]>([]);
    const [publicNodes, setPublicNodes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTab, setSelectedTab] = useState<'overview' | 'tasks' | 'escrow' | 'economics'>('overview');

    const fetchData = useCallback(async () => {
        if (!address) return;

        try {
            const [statsData, tasksData, escrowData, historyData] = await Promise.all([
                apiGet<ClientStats>(`/client/stats?wallet=${address}`).catch(() => null),
                apiGet<{ tasks: ClientTask[] }>(`/marketplace/my-tasks?wallet=${address}`).catch(() => ({ tasks: [] })),
                apiGet<{ escrows: EscrowRecord[] }>(`/client/escrows?wallet=${address}`).catch(() => ({ escrows: [] })),
                apiGet<any[]>(`/client/history/spend?wallet=${address}`).catch(() => []),
                apiGet<{ nodes: any[] }>(`/nodes/public`).catch(() => ({ nodes: [] }))
            ]);

            if (statsData) setStats(statsData);
            setTasks(tasksData.tasks || []);
            setEscrows(escrowData.escrows || []);
            setSpendHistory(historyData || []);
            setPublicNodes(nodesData.nodes || []);
        } catch (error) {
            console.error('Failed to fetch client data:', error);
        } finally {
            setLoading(false);
        }
    }, [address]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000); // Refresh every minute
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleCancelTask = async (taskId: string) => {
        if (!confirm(t('client.confirmCancel'))) return;

        try {
            await apiPost(`/marketplace/tasks/${taskId}/cancel`, { wallet: address });
            toast.success(t('client.taskCancelled'));
            fetchData();
        } catch (error) {
            toast.error(t('client.cancelFailed'));
        }
    };

    const handleRequestRefund = async (taskId: string) => {
        if (!confirm(t('client.confirmRefund'))) return;

        try {
            await apiPost(`/marketplace/tasks/${taskId}/refund`, { wallet: address });
            toast.success(t('client.refundRequested'));
            fetchData();
        } catch (error) {
            toast.error(t('client.refundFailed'));
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'text-green-400 bg-green-500/20';
            case 'active':
            case 'queued':
            case 'assigned': return 'text-blue-400 bg-blue-500/20';
            case 'pending': return 'text-yellow-400 bg-yellow-500/20';
            case 'failed': return 'text-red-400 bg-red-500/20';
            default: return 'text-gray-400 bg-gray-500/20';
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-10 h-10 animate-spin text-blue-400" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white">{t('client.dashboard')}</h2>
                    <p className="text-gray-400 mt-1">{t('client.manageYourTasks')}</p>
                </div>
                <button
                    onClick={fetchData}
                    className="flex items-center space-x-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-xl text-white transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    <span>{t('common.refresh')}</span>
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Tooltip content={t('client.tooltips.totalTasks')}>
                    <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 rounded-2xl p-5 border border-blue-500/30 h-full">
                        <div className="flex items-center space-x-3 mb-3">
                            <Package className="w-5 h-5 text-blue-400" />
                            <span className="text-sm text-gray-400">{t('client.totalTasks')}</span>
                        </div>
                        <p className="text-3xl font-bold text-white">{stats?.total_tasks_created || 0}</p>
                    </div>
                </Tooltip>

                <Tooltip content={t('client.tooltips.completed')}>
                    <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 rounded-2xl p-5 border border-green-500/30 h-full">
                        <div className="flex items-center space-x-3 mb-3">
                            <CheckCircle className="w-5 h-5 text-green-400" />
                            <span className="text-sm text-gray-400">{t('client.completed')}</span>
                        </div>
                        <p className="text-3xl font-bold text-white">{stats?.completed_tasks || 0}</p>
                    </div>
                </Tooltip>

                <Tooltip content={t('client.tooltips.totalSpent')}>
                    <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 rounded-2xl p-5 border border-purple-500/30 h-full">
                        <div className="flex items-center space-x-3 mb-3">
                            <DollarSign className="w-5 h-5 text-purple-400" />
                            <span className="text-sm text-gray-400">{t('client.totalSpent')}</span>
                        </div>
                        <p className="text-3xl font-bold text-white">{stats?.total_spent_gstd?.toFixed(2) || '0.00'}</p>
                        <p className="text-xs text-gray-500">GSTD</p>
                    </div>
                </Tooltip>

                <Tooltip content={t('client.tooltips.lockedEscrow')}>
                    <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/20 rounded-2xl p-5 border border-orange-500/30 h-full">
                        <div className="flex items-center space-x-3 mb-3">
                            <Clock className="w-5 h-5 text-orange-400" />
                            <span className="text-sm text-gray-400">{t('client.lockedEscrow')}</span>
                        </div>
                        <p className="text-3xl font-bold text-white">{stats?.total_locked_gstd?.toFixed(2) || '0.00'}</p>
                        <p className="text-xs text-gray-500">GSTD</p>
                    </div>
                </Tooltip>
            </div>

            {/* Tabs */}
            <div className="flex space-x-2 border-b border-gray-700 pb-2">
                {(['overview', 'tasks', 'escrow', 'economics'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setSelectedTab(tab)}
                        className={`px-4 py-2 rounded-lg transition-all duration-200 flex items-center space-x-2 ${selectedTab === tab
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800'
                            }`}
                    >
                        {tab === 'economics' && <Zap className="w-4 h-4" />}
                        <span>{t(`client.tabs.${tab}`)}</span>
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {selectedTab === 'overview' && (
                <div className="space-y-6">
                    {/* Live Network Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2">
                            <NetworkMap nodes={publicNodes} />
                        </div>
                        <div className="lg:col-span-1">
                            <ActivityFeed />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Active Tasks */}
                        <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-700/50">
                            <h3 className="text-lg font-semibold text-white mb-4">{t('client.activeTasks')}</h3>

                            {tasks.filter(t => ['queued', 'assigned', 'pending'].includes(t.status)).length === 0 ? (
                                <div className="text-center py-8">
                                    <Package className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                                    <p className="text-gray-400">{t('client.noActiveTasks')}</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {tasks
                                        .filter(t => ['queued', 'assigned', 'pending'].includes(t.status))
                                        .slice(0, 5)
                                        .map((task) => (
                                            <div
                                                key={task.task_id}
                                                className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl"
                                            >
                                                <div className="flex items-center space-x-4">
                                                    <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                                                        <Package className="w-5 h-5 text-blue-400" />
                                                    </div>
                                                    <div>
                                                        <p className="text-white font-medium">{task.operation || task.task_type}</p>
                                                        <p className="text-sm text-gray-400">
                                                            {task.workers_completed}/{task.max_workers} workers
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center space-x-4">
                                                    <span className={`px-3 py-1 rounded-full text-xs ${getStatusColor(task.status)}`}>
                                                        {task.status}
                                                    </span>
                                                    <span className="text-white font-medium">
                                                        {task.budget_gstd?.toFixed(4)} GSTD
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>

                        {/* Recent Completed */}
                        <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-700/50">
                            <h3 className="text-lg font-semibold text-white mb-4">{t('client.recentCompleted')}</h3>

                            {tasks.filter(t => t.status === 'completed').length === 0 ? (
                                <div className="text-center py-8">
                                    <CheckCircle className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                                    <p className="text-gray-400">{t('client.noCompletedTasks')}</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {tasks
                                        .filter(t => t.status === 'completed')
                                        .slice(0, 5)
                                        .map((task) => (
                                            <div
                                                key={task.task_id}
                                                className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl"
                                            >
                                                <div className="flex items-center space-x-4">
                                                    <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                                                        <CheckCircle className="w-5 h-5 text-green-400" />
                                                    </div>
                                                    <div>
                                                        <p className="text-white font-medium">{task.operation || task.task_type}</p>
                                                        <p className="text-sm text-gray-400">
                                                            {task.completed_at ? formatDate(task.completed_at) : ''}
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className="text-green-400 font-medium">
                                                    {task.budget_gstd?.toFixed(4)} GSTD
                                                </span>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    </div>
            )}

                    {selectedTab === 'tasks' && (
                        <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-700/50">
                            <h3 className="text-lg font-semibold text-white mb-4">{t('client.allTasks')}</h3>

                            {tasks.length === 0 ? (
                                <div className="text-center py-12">
                                    <Package className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                                    <p className="text-gray-400 text-lg">{t('client.noTasksYet')}</p>
                                    <p className="text-gray-500 mt-2">{t('client.createFirstTask')}</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                                                <th className="pb-3 font-medium">{t('client.taskId')}</th>
                                                <th className="pb-3 font-medium">{t('client.type')}</th>
                                                <th className="pb-3 font-medium">{t('client.status')}</th>
                                                <th className="pb-3 font-medium">{t('client.budget')}</th>
                                                <th className="pb-3 font-medium">{t('client.progress')}</th>
                                                <th className="pb-3 font-medium">{t('client.created')}</th>
                                                <th className="pb-3 font-medium">{t('client.actions')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-white">
                                            {tasks.map((task) => (
                                                <tr key={task.task_id} className="border-b border-gray-800 hover:bg-gray-800/50">
                                                    <td className="py-4">
                                                        <span className="font-mono text-sm text-gray-300">
                                                            {task.task_id.slice(0, 8)}...
                                                        </span>
                                                    </td>
                                                    <td className="py-4">{task.task_type}</td>
                                                    <td className="py-4">
                                                        <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(task.status)}`}>
                                                            {task.status}
                                                        </span>
                                                    </td>
                                                    <td className="py-4">{task.budget_gstd?.toFixed(4)} GSTD</td>
                                                    <td className="py-4">
                                                        <div className="flex items-center space-x-2">
                                                            <div className="w-20 h-2 bg-gray-700 rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full bg-blue-500 transition-all"
                                                                    style={{
                                                                        width: `${(task.workers_completed / task.max_workers) * 100}%`
                                                                    }}
                                                                />
                                                            </div>
                                                            <span className="text-sm text-gray-400">
                                                                {task.workers_completed}/{task.max_workers}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 text-sm text-gray-400">
                                                        {formatDate(task.created_at)}
                                                    </td>
                                                    <td className="py-4">
                                                        <div className="flex items-center space-x-2">
                                                            <button
                                                                className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 transition-colors"
                                                                title={t('client.viewDetails')}
                                                            >
                                                                <Eye className="w-4 h-4 text-gray-400" />
                                                            </button>
                                                            {['pending', 'queued'].includes(task.status) && (
                                                                <button
                                                                    onClick={() => handleCancelTask(task.task_id)}
                                                                    className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors"
                                                                    title={t('client.cancel')}
                                                                >
                                                                    <Trash2 className="w-4 h-4 text-red-400" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {selectedTab === 'escrow' && (
                        <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-700/50">
                            <h3 className="text-lg font-semibold text-white mb-4">{t('client.escrowManagement')}</h3>

                            {escrows.length === 0 ? (
                                <div className="text-center py-12">
                                    <DollarSign className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                                    <p className="text-gray-400 text-lg">{t('client.noEscrows')}</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {escrows.map((escrow) => (
                                        <div
                                            key={escrow.id}
                                            className="p-5 bg-gray-800/50 rounded-xl border border-gray-700/50"
                                        >
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <div className="flex items-center space-x-3">
                                                        <span className="font-mono text-sm text-gray-300">
                                                            {escrow.task_id.slice(0, 12)}...
                                                        </span>
                                                        <span className={`px-2 py-0.5 rounded-full text-xs ${escrow.status === 'locked'
                                                            ? 'bg-orange-500/20 text-orange-400'
                                                            : escrow.status === 'released'
                                                                ? 'bg-green-500/20 text-green-400'
                                                                : 'bg-gray-500/20 text-gray-400'
                                                            }`}>
                                                            {escrow.status}
                                                        </span>
                                                    </div>
                                                    <p className="text-gray-400 mt-2 text-sm">
                                                        {escrow.task_type} • {escrow.difficulty} difficulty
                                                    </p>
                                                </div>

                                                <div className="text-right">
                                                    <p className="text-2xl font-bold text-white">
                                                        {escrow.total_locked_gstd.toFixed(4)}
                                                    </p>
                                                    <p className="text-xs text-gray-500">GSTD Locked</p>
                                                </div>
                                            </div>

                                            <div className="mt-4 pt-4 border-t border-gray-700 flex items-center justify-between">
                                                <div className="flex items-center space-x-6 text-sm text-gray-400">
                                                    <div className="flex items-center space-x-2">
                                                        <Calendar className="w-4 h-4" />
                                                        <span>{formatDate(escrow.locked_at)}</span>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <Users className="w-4 h-4" />
                                                        <span>{escrow.workers_paid} workers paid</span>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <DollarSign className="w-4 h-4" />
                                                        <span>{escrow.total_paid_gstd.toFixed(4)} GSTD paid</span>
                                                    </div>
                                                </div>

                                                {escrow.status === 'locked' && (
                                                    <button
                                                        onClick={() => handleRequestRefund(escrow.task_id)}
                                                        className="flex items-center space-x-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                                                    >
                                                        <AlertTriangle className="w-4 h-4" />
                                                        <span>{t('client.requestRefund')}</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Economics Tab Content */}
                    {selectedTab === 'economics' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Summary Card */}
                                <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-700/50 flex flex-col justify-between">
                                    <div>
                                        <h3 className="text-xl font-bold text-white mb-2">{t('client.economicEfficiency')}</h3>
                                        <p className="text-gray-400 text-sm mb-6">{t('client.manageYourTasks')}</p>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl relative overflow-hidden group">
                                            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                                <TrendingDown className="w-16 h-16 text-green-400" />
                                            </div>
                                            <p className="text-sm text-green-400 mb-1 flex items-center">
                                                {t('client.projectedSavings')}
                                                <Info className="w-3 h-3 ml-1 cursor-help" title={t('client.savingsTooltip')} />
                                            </p>
                                            <div className="flex items-baseline space-x-2">
                                                <span className="text-4xl font-bold text-white">
                                                    {((stats?.total_spent_gstd || 0) * 2.8).toFixed(2)}
                                                </span>
                                                <span className="text-xl text-gray-400 font-medium">GSTD</span>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-2">
                                                ≈ $ {((stats?.total_spent_gstd || 0) * 2.8 * 6.5).toFixed(0)} saved vs centralized cloud
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
                                                <p className="text-xs text-gray-500 mb-1">{t('client.totalSpent')}</p>
                                                <p className="text-xl font-bold text-white">{(stats?.total_spent_gstd || 0).toFixed(2)} GSTD</p>
                                            </div>
                                            <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
                                                <p className="text-xs text-gray-500 mb-1">ROI Efficiency</p>
                                                <p className="text-xl font-bold text-blue-400">+280%</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Spend History Chart */}
                                <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-700/50">
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="text-lg font-semibold text-white">{t('client.spendTrend')}</h3>
                                        <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-400 rounded-lg">Last 30 Days</span>
                                    </div>
                                    <div className="h-[250px] w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={spendHistory}>
                                                <defs>
                                                    <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                                <XAxis
                                                    dataKey="date"
                                                    stroke="#9ca3af"
                                                    fontSize={12}
                                                    tickFormatter={(val) => val.split('-').slice(1).join('/')}
                                                />
                                                <YAxis stroke="#9ca3af" fontSize={12} />
                                                <RechartsTooltip
                                                    contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                                                    itemStyle={{ color: '#3b82f6' }}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="amount"
                                                    stroke="#3b82f6"
                                                    strokeWidth={2}
                                                    fillOpacity={1}
                                                    fill="url(#colorSpend)"
                                                    name="GSTD Spent"
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            {/* Cost Comparison Table/Comparison */}
                            <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-700/50">
                                <h3 className="text-lg font-semibold text-white mb-6 font-display">{t('client.cloudCostComparison')}</h3>
                                <div className="space-y-4">
                                    {[
                                        { name: 'Nvidia H100 Instance', cloud: 12.5, gstd: 3.2, unit: '/hr' },
                                        { name: 'Generic GPU Worker', cloud: 4.8, gstd: 1.1, unit: '/hr' },
                                        { name: 'Batch CPU Processing', cloud: 0.95, gstd: 0.15, unit: '/1M req' }
                                    ].map((item, idx) => (
                                        <div key={idx} className="flex items-center space-x-4">
                                            <div className="w-1/3">
                                                <p className="text-white font-medium">{item.name}</p>
                                            </div>
                                            <div className="flex-1 flex items-center space-x-2">
                                                <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden flex">
                                                    <div
                                                        className="bg-red-500/40 h-full border-r border-red-500/20"
                                                        style={{ width: '100%' }}
                                                    />
                                                    <div
                                                        className="bg-blue-500 h-full -ml-[100%]"
                                                        style={{ width: `${(item.gstd / item.cloud) * 100}%` }}
                                                    />
                                                </div>
                                                <span className="text-sm font-mono text-blue-400 w-16 text-right">
                                                    -{((1 - item.gstd / item.cloud) * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                            <div className="w-1/4 text-right">
                                                <p className="text-sm text-gray-400">
                                                    <span className="line-through mr-2">${item.cloud}</span>
                                                    <span className="text-white font-bold">${item.gstd} {item.unit}</span>
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            );
};

            export default ClientDashboard;
