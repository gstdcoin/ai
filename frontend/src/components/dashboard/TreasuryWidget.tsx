import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';

const TREASURY_WALLET = 'EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp';
const XAUT_JETTON_ADDRESS = 'EQD0vdSA_NedR9uvbgN9EikRX-suesDxGeFg69XQMavfLqIo'; // Should be from config

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

      // Use TonAPI to get XAUt balance
      const response = await fetch(
        `https://tonapi.io/v2/blockchain/accounts/${TREASURY_WALLET}/jettons`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_TON_API_KEY || ''}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch treasury balance');
      }

      const data = await response.json();
      
      // Find XAUt jetton balance
      const xautJetton = data.balances?.find(
        (jetton: any) => jetton.jetton?.address === XAUT_JETTON_ADDRESS
      );

      if (xautJetton) {
        // Convert from nanotons to XAUt (9 decimals)
        const balanceNano = parseInt(xautJetton.balance || '0', 10);
        const balance = balanceNano / 1e9;
        setXautBalance(balance);
      } else {
        setXautBalance(0);
      }
    } catch (err: any) {
      console.error('Error loading treasury balance:', err);
      setError(err?.message || 'Failed to load treasury balance');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-200 rounded-lg p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <span>🏛️</span>
            {t('platform_treasury') || 'Platform Treasury'}
          </h3>
          <p className="text-xs text-gray-600 mt-1">
            {t('golden_reserve') || 'Golden Reserve (XAUt)'}
          </p>
        </div>
        <button
          onClick={loadTreasuryBalance}
          disabled={loading}
          className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          title={t('refresh') || 'Refresh'}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {loading && !xautBalance ? (
        <div className="flex items-center justify-center h-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-600"></div>
        </div>
      ) : error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : (
        <div>
          <div className="text-3xl font-bold text-yellow-700 mb-2">
            {xautBalance !== null ? xautBalance.toFixed(6) : '0.000000'} XAUt
          </div>
          <div className="text-xs text-gray-600">
            {t('treasury_address') || 'Treasury'}: {TREASURY_WALLET.slice(0, 8)}...{TREASURY_WALLET.slice(-6)}
          </div>
        </div>
      )}
    </div>
  );
}

