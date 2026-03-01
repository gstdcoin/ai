'use client';

import { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';
import { apiGet } from '../../lib/apiClient';
import { useWalletStore } from '../../store/walletStore';

interface SwarmMultiplierData {
  swarm_multiplier: number;
  uptime_hours: number;
  uptime_days: number;
  message: string;
}

export default function SwarmMultiplierWidget() {
  const { address } = useWalletStore();
  const [data, setData] = useState<SwarmMultiplierData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    apiGet<SwarmMultiplierData>('/cosmic/swarm-multiplier', { wallet: address })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [address]);

  if (!address || loading) return null;

  const mult = data?.swarm_multiplier ?? 1.0;
  const days = data?.uptime_days ?? 0;

  return (
    <div className="glass-card p-6 border-amber-500/20 bg-gradient-to-br from-amber-500/[0.05] to-transparent">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400">
            <Zap size={20} />
          </div>
          <div>
            <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest block mb-0.5">{t('swarm_multiplier', 'Swarm Multiplier')}</span>
            <span className="text-xl font-black text-white tabular-nums">
              {mult.toFixed(2)}x
            </span>
          </div>
        </div>
        {days > 0 && (
          <span className="text-[10px] text-amber-400 font-bold">
            {days}d uptime
          </span>
        )}
      </div>
      <p className="mt-2 text-[10px] text-gray-500">
        Longer node uptime = higher golden accumulation
      </p>
    </div>
  );
}
