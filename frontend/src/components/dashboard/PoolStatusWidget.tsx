import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { logger } from '../../lib/logger';

interface PoolStatus {
  is_healthy: boolean;
  gstd_balance: number;
  xaut_balance: number;
  pool_address: string;
}

export default function PoolStatusWidget() {
  const { t } = useTranslation('common');
  const [poolStatus, setPoolStatus] = useState<PoolStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPoolStatus();
    const interval = setInterval(loadPoolStatus, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadPoolStatus = async () => {
    try {
      setLoading(true);
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');
      const response = await fetch(`${apiBase}/api/v1/pool/status`);

      if (!response.ok) {
        // Skip this update cycle if server returns error, don't crash
        logger.warn(`Pool status API returned ${response.status}: ${response.statusText}`);
        return;
      }

      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        logger.warn('Pool status API returned non-JSON response, skipping');
        return;
      }

      const data = await response.json();
      
      // Handle empty or invalid response
      if (!data || typeof data !== 'object') {
        // Keep previous status on invalid response
        return;
      }
      
      setPoolStatus(data);
    } catch (err: any) {
      // Silently skip this update cycle on error, don't crash the component
      logger.error('Error loading pool status', err);
      // Keep previous status on error
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card border-blue-500/30 bg-blue-500/10">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2 font-display">
            <span>💎</span>
            {t('pool_status') || 'GSTD/XAUt Pool Status'}
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            {t('pool_backing') || 'Token Backing Pool'}
          </p>
        </div>
        <button
          onClick={loadPoolStatus}
          disabled={loading}
          className="glass-button text-white disabled:opacity-50 min-h-[32px] min-w-[32px]"
          title={t('refresh') || 'Refresh'}
          aria-label={t('refresh') || 'Refresh'}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-4 bg-blue-500/20 rounded w-3/4"></div>
          <div className="h-4 bg-blue-500/20 rounded w-1/2"></div>
          <div className="h-4 bg-blue-500/20 rounded w-2/3"></div>
          <div className="h-3 bg-blue-500/20 rounded w-full mt-2"></div>
        </div>
      ) : poolStatus ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">{t('pool_health') || 'Pool Health'}:</span>
            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
              poolStatus.is_healthy 
                ? 'bg-green-500/20 text-green-400' 
                : 'bg-red-500/20 text-red-400'
            }`}>
              {poolStatus.is_healthy ? (t('healthy') || 'Healthy') : (t('unhealthy') || 'Unhealthy')}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">{t('gstd_balance')}:</span>
            <span className="text-sm font-bold text-gold-900">
              {poolStatus.gstd_balance.toFixed(2)} GSTD
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">{t('xaut_balance') || 'XAUt Balance'}:</span>
            <span className="text-sm font-bold text-blue-400">
              {poolStatus.xaut_balance.toFixed(6)} XAUt
            </span>
          </div>
          <div className="text-xs text-gray-500 font-mono pt-2 border-t border-white/10">
            {t('pool_address') || 'Pool'}: {poolStatus.pool_address?.slice(0, 8)}...{poolStatus.pool_address?.slice(-6)}
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-400">
          {t('no_data_yet') || 'No data available yet'}
        </div>
      )}
    </div>
  );
}

