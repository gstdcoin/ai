import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';

const TREASURY_WALLET = 'EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp';

export default function TreasuryWidget() {
  const { t } = useTranslation('common');
  const [xautBalance, setXautBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTreasuryBalance();
    // Refresh every 30 seconds
    const interval = setInterval(loadTreasuryBalance, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadTreasuryBalance = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch from our backend API (avoids CORS issues)
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');
      const response = await fetch(`${apiBase}/api/v1/stats/public`);

      if (!response.ok) {
        throw new Error('Failed to fetch treasury balance');
      }

      const data = await response.json();
      
      // Get golden_reserve_xaut from API response
      const balance = data.golden_reserve_xaut || 0;
      setXautBalance(balance);
    } catch (err: any) {
      console.error('Error loading treasury balance:', err);
      // Don't show error message, just set balance to 0 for prestige look
      setXautBalance(0);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card border-gold-900/30 bg-gold-900/10">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2 font-display">
            <span>🏛️</span>
            {t('platform_treasury') || 'Platform Treasury'}
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            {t('golden_reserve') || 'Golden Reserve (XAUt)'}
          </p>
        </div>
        <button
          onClick={loadTreasuryBalance}
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
        <div className="flex items-center justify-center h-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold-900"></div>
        </div>
      ) : (
        <div>
          <div className="text-3xl font-bold text-gold-900 mb-2">
            {xautBalance !== null ? xautBalance.toFixed(6) : '0.000000'} XAUt
          </div>
          <div className="text-xs text-gray-400 font-mono">
            {t('treasury_address') || 'Treasury'}: {TREASURY_WALLET.slice(0, 8)}...{TREASURY_WALLET.slice(-6)}
          </div>
        </div>
      )}
    </div>
  );
}

