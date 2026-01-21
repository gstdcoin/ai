import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area
} from 'recharts';
import { SkeletonLoader } from '../common/SkeletonLoader';
import { logger } from '../../lib/logger';
import { apiGet } from '../../lib/apiClient';
import { API_BASE_URL } from '../../lib/config';
import { toast } from '../../lib/toast';
import { RefreshCw } from 'lucide-react';
import InvestmentSavingsWidget from './InvestmentSavingsWidget';

interface Stats {
  processing_tasks: number;
  queued_tasks: number;
  completed_tasks: number;
  total_rewards_ton: number;
  active_devices_count: number;
}

interface PoolStatus {
  pool_address: string;
  gstd_balance: number;
  xaut_balance: number;
  total_value_usd: number;
  last_updated: string;
  is_healthy: boolean;
  reserve_ratio: number;
}

interface TaskCompletionData {
  date: string;
  count: number;
  ton: number;
}

export default function StatsPanel() {
  const { t } = useTranslation('common');
  const [stats, setStats] = useState<Stats | null>(null);
  const [poolStatus, setPoolStatus] = useState<PoolStatus | null>(null);
  const [completionData, setCompletionData] = useState<TaskCompletionData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
    loadPoolStatus();
    loadCompletionData();
    const interval = setInterval(() => {
      loadStats();
      loadPoolStatus();
      loadCompletionData();
    }, 15000); // Update every 15 seconds (increased from 10)
    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      const data = await apiGet<Stats>('/stats');

      // Handle empty or invalid response
      if (!data || typeof data !== 'object') {
        setStats(null);
        return;
      }

      setStats(data);
    } catch (error: any) {
      logger.error('Error loading stats', error);
      const errorMessage = error?.message || 'Failed to load statistics';
      toast.error(
        t('error') || 'Error',
        errorMessage
      );
      // Don't set stats to null on error in setInterval - keep previous data
    } finally {
      setLoading(false);
    }
  };

  const loadPoolStatus = async () => {
    try {
      const data = await apiGet<PoolStatus>('/pool/status');

      if (data && typeof data === 'object') {
        setPoolStatus(data);
      }
    } catch (error: any) {
      logger.error('Error loading pool status', error);
      // Don't show toast for pool status errors as it's not critical
    }
  };

  const loadCompletionData = async () => {
    try {
      const data = await apiGet<{ data: TaskCompletionData[] }>('/stats/tasks/completion', { period: 'day' });

      if (data && data.data && Array.isArray(data.data)) {
        setCompletionData(data.data);
      }
    } catch (error: any) {
      logger.error('Error loading task completion data', error);
      // Don't show toast for completion data errors as it's not critical
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await Promise.all([
      loadStats(),
      loadPoolStatus(),
      loadCompletionData()
    ]);
    toast.success(
      t('refreshed') || 'Refreshed',
      t('stats_refreshed') || 'Statistics updated successfully'
    );
  };

  if (loading && !stats) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass-card rounded-xl p-4 sm:p-6 animate-pulse">
              <div className="h-4 bg-white/10 rounded w-3/4 mb-2"></div>
              <div className="h-8 bg-white/10 rounded w-1/2"></div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
          <div className="glass-card p-4 sm:p-6 rounded-xl animate-pulse h-64"></div>
          <div className="glass-card p-4 sm:p-6 rounded-xl animate-pulse h-64"></div>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: t('stats_processing'),
      value: stats?.processing_tasks || 0,
      color: 'text-blue-400',
      borderColor: 'border-blue-500/30',
      bgColor: 'bg-blue-500/10',
      tooltip: undefined
    },
    {
      label: t('stats_queued'),
      value: stats?.queued_tasks || 0,
      color: 'text-yellow-400',
      borderColor: 'border-yellow-500/30',
      bgColor: 'bg-yellow-500/10',
      tooltip: undefined
    },
    {
      label: t('stats_completed'),
      value: stats?.completed_tasks || 0,
      color: 'text-green-400',
      borderColor: 'border-green-500/30',
      bgColor: 'bg-green-500/10',
      tooltip: undefined
    },
    {
      label: t('network_temperature'),
      value: stats ? ((stats.processing_tasks / Math.max(stats.active_devices_count, 1)).toFixed(2)) : '-',
      color: 'text-orange-400',
      borderColor: 'border-orange-500/30',
      bgColor: 'bg-orange-500/10',
      tooltip: t('network_temperature_tooltip') || 'Среднее значение entropy_score по всем операциям. Высокая температура = низкая надёжность сети.'
    },
    {
      label: t('computational_pressure'),
      value: stats ? ((stats.queued_tasks + stats.processing_tasks) / Math.max(stats.completed_tasks, 1)).toFixed(2) : '-',
      color: 'text-red-400',
      borderColor: 'border-red-500/30',
      bgColor: 'bg-red-500/10',
      tooltip: t('computational_pressure_tooltip') || 'Количество ожидающих задач / Количество активных узлов. Высокое давление = перегрузка сети.'
    },
    {
      label: t('total_compensation'),
      value: `${(stats?.total_rewards_ton || 0).toFixed(2)} TON`,
      color: 'text-indigo-400',
      borderColor: 'border-indigo-500/30',
      bgColor: 'bg-indigo-500/10',
      tooltip: undefined
    },
    {
      label: t('pool_gstd_balance') || 'Pool GSTD',
      value: poolStatus ? `${poolStatus.gstd_balance.toFixed(2)} GSTD` : '-',
      color: 'text-purple-400',
      borderColor: 'border-purple-500/30',
      bgColor: 'bg-purple-500/10',
      tooltip: t('pool_balance_tooltip') || 'GSTD balance in the liquidity pool'
    },
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Заголовок с кнопкой обновления */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white font-display">{t('statistics') || 'Statistics'}</h2>
          <p className="text-sm text-gray-400 mt-1">
            {t('stats_description') || 'Network statistics and performance metrics'}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="glass-button-gold min-h-[44px] flex items-center gap-2"
          title={t('refresh_stats') || 'Refresh statistics'}
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          <span>{t('refresh') || 'Refresh'}</span>
        </button>
      </div>

      {/* Метрики */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 gap-3 sm:gap-4">
        {statCards.map((card, i) => (
          <div
            key={i}
            className={`glass-card ${card.borderColor} ${card.bgColor} rounded-xl p-4 sm:p-6 border ${card.tooltip ? 'cursor-help' : ''}`}
            title={card.tooltip}
          >
            <p className="text-xs sm:text-sm font-medium text-gray-400 mb-1">{card.label}</p>
            <p className={`text-lg sm:text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Investment Savings Widget */}
      <div className="mb-8">
        <InvestmentSavingsWidget />
      </div>

      {/* Графики выполненных задач */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
        <div className="glass-card p-4 sm:p-6 rounded-xl">
          <h3 className="text-base sm:text-lg font-semibold text-white mb-4 sm:mb-6">{t('tasks_activity') || 'Выполненные задачи'}</h3>
          <div className="h-48 sm:h-64">
            {completionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={completionData.map(item => ({
                  name: new Date(item.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
                  tasks: item.count,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: '#fff'
                    }}
                  />
                  <Area type="monotone" dataKey="tasks" stroke="#fbbf24" fill="#fbbf24" fillOpacity={0.2} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                {t('no_data_yet') || 'Нет данных'}
              </div>
            )}
          </div>
        </div>

        <div className="glass-card p-4 sm:p-6 rounded-xl">
          <h3 className="text-base sm:text-lg font-semibold text-white mb-4 sm:mb-6">{t('compensation_distribution') || 'Распределение наград'}</h3>
          <div className="h-48 sm:h-64">
            {completionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={completionData.map(item => ({
                  name: new Date(item.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
                  ton: item.ton,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: any) => `${value.toFixed(6)} TON`}
                    contentStyle={{
                      backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: '#fff'
                    }}
                  />
                  <Bar dataKey="ton" fill="#fbbf24" radius={[4, 4, 0, 0]} barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                {t('no_data_yet') || 'Нет данных'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
