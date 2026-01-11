import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area
} from 'recharts';
import { SkeletonLoader } from '../common/SkeletonLoader';
import { logger } from '../../lib/logger';

interface Stats {
  processing_tasks: number;
  queued_tasks: number;
  completed_tasks: number;
  total_rewards_ton: number;
  active_devices_count: number;
}

export default function StatsPanel() {
  const { t } = useTranslation('common');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');
      const response = await fetch(`${apiBase}/api/v1/stats`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Handle empty or invalid response
      if (!data || typeof data !== 'object') {
        setStats(null);
        return;
      }
      
      setStats(data);
    } catch (error) {
      logger.error('Error loading stats', error);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !stats) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-xl p-4 sm:p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
          <div className="bg-gray-100 p-4 sm:p-6 rounded-xl animate-pulse h-64"></div>
          <div className="bg-gray-100 p-4 sm:p-6 rounded-xl animate-pulse h-64"></div>
        </div>
      </div>
    );
  }

  const statCards = [
    { 
      label: t('stats_processing'), 
      value: stats?.processing_tasks || 0, 
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      tooltip: undefined
    },
    { 
      label: t('stats_queued'), 
      value: stats?.queued_tasks || 0, 
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
      tooltip: undefined
    },
    { 
      label: t('stats_completed'), 
      value: stats?.completed_tasks || 0, 
      color: 'text-green-600',
      bg: 'bg-green-50',
      tooltip: undefined
    },
    { 
      label: t('network_temperature'), 
      value: '-', 
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      tooltip: 'Среднее значение entropy_score по всем операциям. Высокая температура = низкая надёжность сети.'
    },
    { 
      label: t('computational_pressure'), 
      value: '-', 
      color: 'text-red-600',
      bg: 'bg-red-50',
      tooltip: 'Количество ожидающих задач / Количество активных узлов. Высокое давление = перегрузка сети.'
    },
    { 
      label: t('total_compensation'), 
      value: `${(stats?.total_rewards_ton || 0).toFixed(2)} TON`, 
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      tooltip: undefined
    },
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Метрики */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {statCards.map((card, i) => (
          <div 
            key={i} 
            className={`${card.bg} rounded-xl p-4 sm:p-6 shadow-sm border border-white/50 ${card.tooltip ? 'cursor-help' : ''}`}
            title={card.tooltip}
          >
            <p className="text-xs sm:text-sm font-medium text-gray-500 mb-1">{card.label}</p>
            <p className={`text-lg sm:text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Графики (Mock data for visualization) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-base sm:text-lg font-semibold mb-4 sm:mb-6">{t('tasks_activity')}</h3>
          <div className="h-48 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={[
                { name: '00:00', tasks: 400 },
                { name: '04:00', tasks: 300 },
                { name: '08:00', tasks: 900 },
                { name: '12:00', tasks: 1200 },
                { name: '16:00', tasks: 1500 },
                { name: '20:00', tasks: 1100 },
                { name: '23:59', tasks: 800 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} />
                <Tooltip />
                <Area type="monotone" dataKey="tasks" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.1} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-base sm:text-lg font-semibold mb-4 sm:mb-6">{t('compensation_distribution')}</h3>
          <div className="h-48 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: 'Mon', ton: 45 },
                { name: 'Tue', ton: 52 },
                { name: 'Wed', ton: 38 },
                { name: 'Thu', ton: 65 },
                { name: 'Fri', ton: 48 },
                { name: 'Sat', ton: 35 },
                { name: 'Sun', ton: 28 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} />
                <Tooltip />
                <Bar dataKey="ton" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
