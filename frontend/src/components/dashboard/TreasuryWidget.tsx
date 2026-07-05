import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { logger } from '../../lib/logger';
import { API_BASE_URL } from '../../lib/config';

const TREASURY_WALLET = 'EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp';

export default function TreasuryWidget() {
  const { t } = useTranslation('common');
  const [treasuryGstd, setTreasuryGstd] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTreasuryBalance();
    const interval = setInterval(loadTreasuryBalance, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadTreasuryBalance = async () => {
    try {
      setLoading(true);
      setError(null);

      const apiBase = API_BASE_URL;
      const response = await fetch(`${apiBase}/api/v1/fund/status`);

      if (!response.ok) {
        logger.warn(`Treasury API returned ${response.status}: ${response.statusText}`);
        return;
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        logger.warn('Treasury API returned non-JSON response, skipping');
        return;
      }

      const data = await response.json();

      const balance = data?.protocol_treasury_gstd ?? data?.treasury_balance ?? 0;
      setTreasuryGstd(balance);
    } catch (err: any) {
      logger.error('Error loading treasury balance', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card p-6 border-gold-900/30 bg-gradient-to-br from-gold-900/10 to-amber-900/5 hover:border-gold-900/50 transition-all duration-300">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2 font-display">
            <span className="text-2xl">🏛️</span>
            {t('platform_treasury', 'Platform Treasury') || 'Platform Treasury'}
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            {t('treasury_fee_desc', '10% of all inference fees') || '10% of all inference fees'}
          </p>
        </div>
        <button
          onClick={loadTreasuryBalance}
          disabled={loading}
          className="glass-button text-gold-900 hover:bg-gold-900/20 disabled:opacity-50 min-h-[40px] min-w-[40px] rounded-full"
          title={t('refresh', 'Refresh') || 'Refresh'}
          aria-label={t('refresh', 'Refresh') || 'Refresh'}
        >
          <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {loading && xautBalance === null ? (
        <div className="flex items-center justify-center h-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold-900"></div>
        </div>
      ) : error ? (
        <div className="text-center py-4">
          <p className="text-red-400 text-sm mb-2">{error}</p>
          <button onClick={loadTreasuryBalance} className="text-xs text-gold-900 hover:underline">
            {t('retry', 'Retry') || 'Retry'}
          </button>
        </div>
      ) : (
        <div>
          <div className="text-3xl font-bold text-gold-900 mb-2 flex items-baseline gap-2">
            <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
              {treasuryGstd !== null ? treasuryGstd.toFixed(2) : '0.00'}
            </span>
            <span className="text-lg text-gray-400">GSTD</span>
          </div>
          <div className="text-xs text-gray-500 font-mono bg-black/20 px-3 py-2 rounded-lg">
            {t('treasury_address', 'Treasury') || 'Treasury'}: {TREASURY_WALLET.slice(0, 8)}...{TREASURY_WALLET.slice(-6)}
          </div>
        </div>
      )}
    </div>
  );
}

