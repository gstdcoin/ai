import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import { logger } from '../../lib/logger';

interface Stats {
  processing_tasks: number;
  queued_tasks: number;
  completed_tasks: number;
  total_rewards_ton: number;
  active_devices_count: number;
}

interface SystemStatusWidgetProps {
  onStatsUpdate?: (stats: Stats | null) => void;
}

export default function SystemStatusWidget({ onStatsUpdate }: SystemStatusWidgetProps) {
  const { t } = useTranslation('common');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    loadStats();
    const interval = setInterval(() => {
      loadStats();
      setLastUpdate(new Date());
    }, 15000); // Update every 15 seconds (increased from 10)
    return () => clearInterval(interval);
  }, []);

  // Use ref to avoid re-creating callback on every render
  const onStatsUpdateRef = useRef(onStatsUpdate);
  useEffect(() => {
    onStatsUpdateRef.current = onStatsUpdate;
  }, [onStatsUpdate]);

  useEffect(() => {
    if (onStatsUpdateRef.current && stats) {
      onStatsUpdateRef.current(stats);
    }
  }, [stats]); // Only depend on stats, not onStatsUpdate

  const loadStats = async () => {
    try {
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');
      const response = await fetch(`${apiBase}/api/v1/stats`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-cache',
      });
      
      if (!response.ok) {
        // Skip this update cycle if server returns error, don't crash
        logger.warn(`Stats API returned ${response.status}: ${response.statusText}`);
        return;
      }
      
      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        logger.warn('Stats API returned non-JSON response, skipping');
        return;
      }
      
      const data = await response.json();
      
      // Handle empty or invalid response
      if (!data || typeof data !== 'object') {
        // Keep previous stats on invalid response
        return;
      }
      
      setStats(data);
      setLoading(false);
    } catch (error) {
      // Silently skip this update cycle on error, don't crash the component
      logger.error('Error loading stats', error);
      // Don't reset stats on error in setInterval - keep previous data
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = () => {
    if (!stats) return 'bg-gray-100';
    const totalActive = stats.processing_tasks + stats.queued_tasks;
    if (totalActive === 0) return 'bg-gray-100';
    if (totalActive < 10) return 'bg-green-100';
    if (totalActive < 50) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  const getStatusText = () => {
    if (!stats) return t('loading') || 'Loading...';
    const totalActive = stats.processing_tasks + stats.queued_tasks;
    if (totalActive === 0) return t('system_idle') || 'System Idle';
    if (totalActive < 10) return t('system_normal') || 'Normal';
    if (totalActive < 50) return t('system_busy') || 'Busy';
    return t('system_high_load') || 'High Load';
  };

  return (
    <div className={`${getStatusColor()} rounded-xl p-4 sm:p-6 border border-gray-200 shadow-sm`}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900">
              {t('system_status') || 'System Status'}
            </h3>
            {!loading && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/80 text-gray-700">
                {getStatusText()}
              </span>
            )}
          </div>
          {stats ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 mt-4">
              <div>
                <p className="text-xs text-gray-600 mb-1">{t('processing') || 'Processing'}</p>
                <p className="text-lg sm:text-xl font-bold text-blue-600">{stats.processing_tasks}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">{t('queued') || 'Queued'}</p>
                <p className="text-lg sm:text-xl font-bold text-yellow-600">{stats.queued_tasks}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">{t('completed') || 'Completed'}</p>
                <p className="text-lg sm:text-xl font-bold text-green-600">{stats.completed_tasks}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">{t('active_devices') || 'Devices'}</p>
                <p className="text-lg sm:text-xl font-bold text-purple-600">{stats.active_devices_count}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">{t('total_compensation') || 'Total Paid'}</p>
                <p className="text-lg sm:text-xl font-bold text-indigo-600">
                  {stats.total_rewards_ton.toFixed(2)} TON
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 mt-4 animate-pulse">
              {[...Array(5)].map((_, i) => (
                <div key={i}>
                  <div className="h-3 bg-gray-200 rounded w-16 mb-2"></div>
                  <div className="h-6 bg-gray-200 rounded w-12"></div>
                </div>
              ))}
            </div>
          )}
        </div>
        {loading && !stats && (
          <div className="flex items-center gap-2 text-gray-500">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-600"></div>
            <span className="text-sm">{t('loading') || 'Loading...'}</span>
          </div>
        )}
      </div>
      {!loading && (
        <p className="text-xs text-gray-500 mt-3 sm:mt-4 text-right">
          {t('last_updated') || 'Last updated'}: {lastUpdate.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

