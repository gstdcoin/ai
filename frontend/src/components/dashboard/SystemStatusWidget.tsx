import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import { logger } from '../../lib/logger';
import { API_BASE_URL } from '../../lib/config';

interface Stats {
  processing_tasks: number;
  queued_tasks: number;
  completed_tasks: number;
  total_rewards_gstd: number;
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
      const apiBase = API_BASE_URL;
      const response = await fetch(`${apiBase}/api/v1/stats/public`, {
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
    if (!stats) return 'border-white/10';
    const totalActive = stats.processing_tasks + stats.queued_tasks;
    if (totalActive === 0) return 'border-white/10';
    if (totalActive < 10) return 'border-green-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]';
    if (totalActive < 50) return 'border-yellow-500/30 shadow-[0_0_15px_rgba(234,179,8,0.1)]';
    return 'border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.1)]';
  };

  const getStatusText = () => {
    if (!stats) return t('loading') || 'Loading...';
    const totalActive = stats.processing_tasks + stats.queued_tasks;
    if (totalActive === 0) return t('system_idle') || 'Idle';
    if (totalActive < 10) return t('system_normal') || 'Nominal';
    if (totalActive < 50) return t('system_busy') || 'Elevated';
    return t('system_high_load') || 'Critical';
  };

  return (
    <div className={`glass-card p-4 sm:p-6 transition-all duration-500 ${getStatusColor()}`}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1 w-full">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
              {t('system_status') || 'System Status'}
              {!loading && (
                <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold border ${getStatusText() === 'Idle' ? 'bg-gray-500/20 text-gray-400 border-gray-500/30' :
                  getStatusText() === 'Nominal' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                    getStatusText() === 'Elevated' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                      'bg-red-500/20 text-red-400 border-red-500/30'
                  }`}>
                  {getStatusText()}
                </span>
              )}
            </h3>
            {loading && !stats && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cyan-400"></div>
            )}
          </div>

          {stats ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{t('processing') || 'Processing'}</p>
                <p className="text-xl font-bold text-blue-400 font-mono">{stats.processing_tasks}</p>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{t('queued') || 'Queued'}</p>
                <p className="text-xl font-bold text-yellow-400 font-mono">{stats.queued_tasks}</p>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{t('completed') || 'Done'}</p>
                <p className="text-xl font-bold text-green-400 font-mono">{stats.completed_tasks}</p>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{t('active_devices') || 'Nodes'}</p>
                <p className="text-xl font-bold text-purple-400 font-mono">{stats.active_devices_count}</p>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{t('total_compensation') || 'Paid'}</p>
                <p className="text-xl font-bold text-indigo-400 font-mono">
                  {(stats.total_rewards_gstd || 0).toFixed(0)} <span className="text-xs text-gray-500">GSTD</span>
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 animate-pulse">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-white/5 rounded-lg border border-white/5"></div>
              ))}
            </div>
          )}
        </div>
      </div>
      {!loading && (
        <div className="w-full flex justify-end mt-3">
          <p className="text-[10px] text-gray-600 font-mono">
            SYNC: {lastUpdate.toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  );
}

