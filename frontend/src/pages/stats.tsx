import { useState, useEffect, memo } from 'react';
import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import TreasuryWidget from '../components/dashboard/TreasuryWidget';
import XAUtChart from '../components/stats/XAUtChart';
import { TrendingUp, Users, CheckCircle, Coins } from 'lucide-react';
import { logger } from '../lib/logger';

export const getStaticProps: GetStaticProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale || 'en', ['common'])),
    },
  };
};

interface GlobalStats {
  total_tasks_completed: number;
  total_workers_paid: number;
  total_gstd_paid: number;
  golden_reserve_xaut: number;
  xaut_history: Array<{ timestamp: string; amount: number }>;
  system_status?: string;
  last_swaps?: Array<{
    task_id: string;
    gstd_amount: number;
    xaut_amount: number;
    tx_hash: string;
    timestamp: string;
  }>;
}

export default function StatsPage() {
  const { t } = useTranslation('common');
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
    // Refresh every 30 seconds
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');
      const response = await fetch(`${apiBase}/api/v1/stats/public`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      const { logger } = require('../lib/logger');
      logger.error('Error loading stats', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-sea-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* System Status Banner */}
        <div className="mb-6">
          <div className="glass-card border-green-500/30 bg-green-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
              <div>
                <p className="font-semibold text-white">
                  {t('network_status') || 'Network Status'}: {stats?.system_status || 'Operational'}
                </p>
                <p className="text-sm text-gray-300">
                  {t('all_systems_operational') || 'All systems operational'}
                </p>
              </div>
            </div>
            <div className="text-sm text-gray-400">
              {new Date().toLocaleString()}
            </div>
          </div>
        </div>

        <div className="text-center mb-8 lg:mb-12">
          <h1 className="text-3xl lg:text-4xl font-bold text-white mb-4 font-display">
            {t('platform_statistics') || 'Platform Statistics'}
          </h1>
          <p className="text-lg text-gray-300">
            {t('public_transparency') || 'Real-time transparency of the GSTD Platform'}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold-900"></div>
          </div>
        ) : stats ? (
          <div className="space-y-6 lg:space-y-8">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
              <div className="glass-card">
                <div className="flex items-center gap-3 mb-2">
                  <CheckCircle className="text-sea-400" size={20} />
                  <div className="text-sm text-gray-400 uppercase tracking-wider">
                    {t('total_tasks_completed') || 'Total Tasks Completed'}
                  </div>
                </div>
                <div className="text-3xl font-bold text-white">
                  {stats.total_tasks_completed.toLocaleString()}
                </div>
              </div>

              <div className="glass-card">
                <div className="flex items-center gap-3 mb-2">
                  <Users className="text-sea-400" size={20} />
                  <div className="text-sm text-gray-400 uppercase tracking-wider">
                    {t('total_workers_paid') || 'Total Workers Paid'}
                  </div>
                </div>
                <div className="text-3xl font-bold text-white">
                  {stats.total_workers_paid.toLocaleString()}
                </div>
                <div className="text-sm text-gray-400 mt-1">
                  {stats.total_gstd_paid.toFixed(2)} GSTD
                </div>
              </div>

              <div className="glass-card border-gold-900/30 bg-gold-900/10">
                <div className="flex items-center gap-3 mb-2">
                  <Coins className="text-gold-900" size={20} />
                  <div className="text-sm text-gray-400 uppercase tracking-wider">
                    {t('golden_reserve') || 'Golden Reserve'}
                  </div>
                </div>
                <div className="text-3xl font-bold text-gold-900">
                  {stats.golden_reserve_xaut.toFixed(6)} XAUt
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {t('treasury_backing') || 'Treasury Backing'}
                </div>
              </div>
            </div>

            {/* XAUt Growth Chart */}
            <div className="glass-card">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="text-gold-900" size={24} />
                <h2 className="text-xl font-bold text-white font-display">
                  {t('xaut_growth') || 'Golden Reserve Growth'}
                </h2>
              </div>
              {stats.xaut_history && stats.xaut_history.length > 0 ? (
                <XAUtChart data={stats.xaut_history} />
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400">
                  {t('no_data_yet') || 'No data available yet'}
                </div>
              )}
            </div>

            {/* Last Swap Feed */}
            {stats.last_swaps && stats.last_swaps.length > 0 && (
              <div className="glass-card">
                <h2 className="text-xl font-bold text-white mb-4 font-display">
                  {t('last_swaps') || 'Last Golden Reserve Contributions'}
                </h2>
                <div className="space-y-3">
                  {stats.last_swaps.map((swap: any, index: number) => (
                    <div key={index} className="glass-dark rounded-lg p-4 hover:bg-white/5 transition-colors">
                      <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="text-sm font-mono text-gray-300">
                              {t('task') || 'Task'}: {swap.task_id?.slice(0, 8)}...
                            </span>
                            <a
                              href={`https://tonviewer.com/${swap.tx_hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-gold-900 hover:underline"
                            >
                              {t('view_tx') || 'View TX'}
                            </a>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div>
                              <span className="text-gray-400">{t('gstd_fee') || 'GSTD Fee'}:</span>
                              <span className="font-semibold ml-2 text-white">{swap.gstd_amount?.toFixed(6)} GSTD</span>
                            </div>
                            <div>
                              <span className="text-gray-400">{t('xaut_bought') || 'XAUt Bought'}:</span>
                              <span className="font-semibold ml-2 text-gold-900">{swap.xaut_amount?.toFixed(6)} XAUt</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-gray-400">
                          {new Date(swap.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Treasury Widget */}
            <TreasuryWidget />
          </div>
        ) : (
          <div className="text-center text-gray-400 glass-card">
            {t('failed_to_load_stats') || 'Failed to load statistics'}
          </div>
        )}
      </div>
    </div>
  );
}

