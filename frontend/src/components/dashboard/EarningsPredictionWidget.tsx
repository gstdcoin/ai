'use client';

import { useState, useEffect } from 'react';
import { TrendingUp } from 'lucide-react';
import { apiGet } from '../../lib/apiClient';
import { useWalletStore } from '../../store/walletStore';

interface EarningsPrediction {
  wallet: string;
  predicted_30d_gstd: number;
  gold_multiplier: number;
  message: string;
}

export default function EarningsPredictionWidget() {
  const { address } = useWalletStore();
  const [data, setData] = useState<EarningsPrediction | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    apiGet<EarningsPrediction>('/cosmic/earnings-prediction', { wallet: address })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [address]);

  if (!address || loading) return null;

  return (
    <div className="glass-card p-6 border-amber-500/20 bg-gradient-to-br from-amber-500/[0.05] to-transparent">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400">
            <TrendingUp size={20} />
          </div>
          <div>
            <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest block mb-0.5">
              30-Day Forecast
            </span>
            <span className="text-xl font-black text-white tabular-nums">
              {data?.predicted_30d_gstd?.toFixed(2) ?? '—'} GSTD
            </span>
          </div>
        </div>
        {data?.gold_multiplier != null && (
          <span className="text-[10px] text-amber-400 font-bold">
            {data.gold_multiplier.toFixed(2)}x Gold
          </span>
        )}
      </div>
      <p className="mt-2 text-[10px] text-gray-500">
        Based on uptime & Gold Reserve growth
      </p>
    </div>
  );
}
