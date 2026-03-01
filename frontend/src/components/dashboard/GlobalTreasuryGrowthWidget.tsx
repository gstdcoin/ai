'use client';

import { useState, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { API_BASE_URL } from '../../lib/config';

interface PublicStats {
  global_treasury_growth_today_oz?: number;
}

export default function GlobalTreasuryGrowthWidget() {
  const [oz, setOz] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/stats/public`);
        if (!res.ok) return;
        const data: PublicStats = await res.json();
        const val = data?.global_treasury_growth_today_oz;
        setOz(typeof val === 'number' ? val : 0);
      } catch {
        setOz(0);
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="glass-card p-6 border-amber-500/20 bg-gradient-to-br from-amber-500/[0.05] to-transparent">
      <div className="flex items-center gap-4">
        <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400">
          <Globe size={20} />
        </div>
        <div>
          <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest block mb-0.5">{t('global_treasury_growth', 'Global Treasury Growth')}</span>
          <span className="text-xl font-black text-white tabular-nums">
            {oz !== null ? oz.toFixed(4) : '—'} oz today
          </span>
        </div>
      </div>
    </div>
  );
}
