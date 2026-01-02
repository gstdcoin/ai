import { useState, useEffect } from 'react';
import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import TreasuryWidget from '../components/dashboard/TreasuryWidget';

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
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
      const response = await fetch(`${apiUrl}/api/v1/stats/public`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* System Status Banner */}
        <div className="mb-6">
          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <div>
                <p className="font-semibold text-green-900">
                  {t('network_status') || 'Network Status'}: {stats?.system_status || 'Operational'}
                </p>
                <p className="text-sm text-green-700">
                  {t('all_systems_operational') || 'All systems operational'}
                </p>
              </div>
            </div>
            <div className="text-sm text-green-600">
              {new Date().toLocaleString()}
            </div>
          </div>
        </div>

        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            {t('platform_statistics') || 'Platform Statistics'}
          </h1>
          <p className="text-lg text-gray-600">
            {t('public_transparency') || 'Real-time transparency of the GSTD Platform'}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : stats ? (
          <div className="space-y-8">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm text-gray-600 mb-2">
                  {t('total_tasks_completed') || 'Total Tasks Completed'}
                </div>
                <div className="text-3xl font-bold text-gray-900">
                  {stats.total_tasks_completed.toLocaleString()}
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm text-gray-600 mb-2">
                  {t('total_workers_paid') || 'Total Workers Paid'}
                </div>
                <div className="text-3xl font-bold text-gray-900">
                  {stats.total_workers_paid.toLocaleString()}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {stats.total_gstd_paid.toFixed(2)} GSTD
                </div>
              </div>

              <div className="bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-200 rounded-lg shadow p-6">
                <div className="text-sm text-gray-600 mb-2">
                  {t('golden_reserve') || 'Golden Reserve'}
                </div>
                <div className="text-3xl font-bold text-yellow-700">
                  {stats.golden_reserve_xaut.toFixed(6)} XAUt
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {t('treasury_backing') || 'Treasury Backing'}
                </div>
              </div>
            </div>

            {/* XAUt Growth Chart */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                {t('xaut_growth') || 'Golden Reserve Growth'}
              </h2>
              {stats.xaut_history && stats.xaut_history.length > 0 ? (
                <div className="h-64">
                  <XAUtChart data={stats.xaut_history} />
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-500">
                  {t('no_data_yet') || 'No data available yet'}
                </div>
              )}
            </div>

            {/* Last Swap Feed */}
            {stats.last_swaps && stats.last_swaps.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  {t('last_swaps') || 'Last Golden Reserve Contributions'}
                </h2>
                <div className="space-y-3">
                  {stats.last_swaps.map((swap: any, index: number) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-mono text-gray-600">
                              {t('task') || 'Task'}: {swap.task_id?.slice(0, 8)}...
                            </span>
                            <a
                              href={`https://tonviewer.com/${swap.tx_hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary-600 hover:underline"
                            >
                              {t('view_tx') || 'View TX'}
                            </a>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-600">{t('gstd_fee') || 'GSTD Fee'}:</span>
                              <span className="font-semibold ml-2">{swap.gstd_amount?.toFixed(6)} GSTD</span>
                            </div>
                            <div>
                              <span className="text-gray-600">{t('xaut_bought') || 'XAUt Bought'}:</span>
                              <span className="font-semibold ml-2 text-yellow-700">{swap.xaut_amount?.toFixed(6)} XAUt</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500">
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
          <div className="text-center text-gray-500">
            {t('failed_to_load_stats') || 'Failed to load statistics'}
          </div>
        )}
      </div>
    </div>
  );
}

// Simple XAUt Growth Chart Component
function XAUtChart({ data }: { data: Array<{ timestamp: string; amount: number }> }) {
  const maxAmount = Math.max(...data.map(d => d.amount), 1);
  const minAmount = Math.min(...data.map(d => d.amount), 0);

  return (
    <div className="relative h-full">
      <svg className="w-full h-full" viewBox="0 0 800 200" preserveAspectRatio="none">
        <defs>
          <linearGradient id="xautGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFD700" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#FFD700" stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(y => (
          <line
            key={y}
            x1="0"
            y1={y * 2}
            x2="800"
            y2={y * 2}
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        ))}

        {/* Area under curve */}
        <path
          d={`M 0,200 ${data.map((d, i) => {
            const x = (i / (data.length - 1)) * 800;
            const y = 200 - ((d.amount - minAmount) / (maxAmount - minAmount || 1)) * 200;
            return `L ${x},${y}`;
          }).join(' ')} L 800,200 Z`}
          fill="url(#xautGradient)"
        />

        {/* Line */}
        <polyline
          points={data.map((d, i) => {
            const x = (i / (data.length - 1)) * 800;
            const y = 200 - ((d.amount - minAmount) / (maxAmount - minAmount || 1)) * 200;
            return `${x},${y}`;
          }).join(' ')}
          fill="none"
          stroke="#FFD700"
          strokeWidth="3"
        />

        {/* Points */}
        {data.map((d, i) => {
          const x = (i / (data.length - 1)) * 800;
          const y = 200 - ((d.amount - minAmount) / (maxAmount - minAmount || 1)) * 200;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="4"
              fill="#FFD700"
              stroke="#fff"
              strokeWidth="2"
            />
          );
        })}
      </svg>

      {/* Labels */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-gray-500 px-2">
        <span>{new Date(data[0]?.timestamp).toLocaleDateString()}</span>
        <span>{new Date(data[data.length - 1]?.timestamp).toLocaleDateString()}</span>
      </div>
    </div>
  );
}

