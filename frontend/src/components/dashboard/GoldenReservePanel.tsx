import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { Landmark, RefreshCw, TrendingUp, Users, Zap } from 'lucide-react';
import { API_BASE_URL } from '../../lib/config';

interface TreasuryStatus {
  treasury_gstd: number;
  total_gstd_paid: number;
  distributions_count: number;
  last_distribution: string | null;
  node_bonus_pool_gstd: number;
  next_distribution_in: number;
  distribution_ratios?: {
    liquidity_pool_pct: number;
    treasury_pct: number;
    node_bonus_pct: number;
  };
}

export default function GoldenReservePanel() {
  const { t } = useTranslation('common');
  const [treasury, setTreasury] = useState<TreasuryStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/treasury/status`);
      if (res.ok) setTreasury(await res.json());
    } catch (_e) { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading && !treasury) {
    return (
      <div className="col-span-2 lg:col-span-4 glass-card p-8 animate-pulse">
        <div className="h-6 bg-violet-500/10 rounded w-48 mb-4" />
        <div className="h-20 bg-violet-500/5 rounded-2xl" />
      </div>
    );
  }

  const treasuryGstd = treasury?.treasury_gstd ?? 0;
  const totalPaid = treasury?.total_gstd_paid ?? 0;
  const bonusPool = treasury?.node_bonus_pool_gstd ?? 0;
  const distributions = treasury?.distributions_count ?? 0;

  return (
    <div className="col-span-2 lg:col-span-4 relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-900/10 via-cyan-900/5 to-emerald-900/10 border border-violet-500/20 p-6 lg:p-8">
      {/* Background decorations */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-cyan-600/5 rounded-full blur-[60px] -ml-24 -mb-24 pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-cyan-600/20 border border-violet-500/30 flex items-center justify-center">
            <Landmark className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white tracking-tight">
              {t('ecosystem_treasury_title', 'Ecosystem Treasury')}
            </h3>
            <p className="text-[10px] text-violet-400/60 font-bold uppercase tracking-widest">
              {t('ecosystem_treasury_subtitle', '10% of fees → buybacks • AI compute utility')}
            </p>
          </div>
        </div>
        <button onClick={fetchData} disabled={loading} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">

        {/* Left: Treasury Balance */}
        <div className="md:col-span-1 space-y-4">
          <div className="p-5 rounded-2xl bg-black/20 border border-violet-500/10">
            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">
              {t('treasury_balance', 'Treasury Balance')}
            </div>
            <div className="text-3xl font-black bg-gradient-to-r from-violet-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent tabular-nums mb-1">
              {treasuryGstd.toFixed(2)}
            </div>
            <div className="text-sm text-gray-400 font-bold">GSTD</div>
            <div className="mt-3 pt-3 border-t border-white/5">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">{t('total_paid_out', 'Total Paid Out')}</span>
                <span className="text-cyan-400 font-bold">{totalPaid.toFixed(2)} GSTD</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">{t('distributions', 'Distributions')}</span>
                <span className="text-violet-400 font-bold">{distributions}</span>
              </div>
            </div>
          </div>

          {/* Node Bonus Pool */}
          <div className="p-4 rounded-2xl bg-black/20 border border-emerald-500/10">
            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">
              {t('node_bonus_pool', 'Node Bonus Pool')}
            </div>
            <div className="text-xl font-black text-emerald-400 tabular-nums">{bonusPool.toFixed(2)} <span className="text-sm text-gray-500">GSTD</span></div>
          </div>
        </div>

        {/* Center: Fee Split */}
        <div className="md:col-span-1 space-y-3">
          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-3">
            {t('fee_distribution', 'Fee Distribution')}
          </div>

          {/* 90% Node Operators */}
          <div className="p-4 rounded-2xl bg-black/20 border border-white/5 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0"><Users size={18} /></div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                {t('node_operators', 'Node Operators')}
              </div>
              <div className="text-lg font-black text-emerald-400">90%</div>
            </div>
          </div>

          {/* 10% Ecosystem Treasury */}
          <div className="p-4 rounded-2xl bg-black/20 border border-violet-500/20 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400 shrink-0"><Landmark size={18} /></div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                {t('ecosystem_treasury', 'Ecosystem Treasury')}
              </div>
              <div className="text-lg font-black text-violet-400">10%</div>
            </div>
          </div>
        </div>

        {/* Right: Treasury Use of Funds */}
        <div className="md:col-span-1">
          <div className="p-5 rounded-2xl bg-black/20 border border-white/5 h-full flex flex-col">
            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-4">
              {t('treasury_use_of_funds', 'Treasury Use of Funds')}
            </div>

            <div className="space-y-3 flex-1">
              {/* 60% Buybacks */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400 flex items-center gap-1.5">
                    <TrendingUp size={12} className="text-cyan-400" />
                    {t('gstd_buybacks', 'GSTD Buybacks')}
                  </span>
                  <span className="text-cyan-400 font-bold">60%</span>
                </div>
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500/60 rounded-full" style={{ width: '60%' }} />
                </div>
              </div>

              {/* 30% Development */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400 flex items-center gap-1.5">
                    <Zap size={12} className="text-violet-400" />
                    {t('protocol_development', 'Protocol Development')}
                  </span>
                  <span className="text-violet-400 font-bold">30%</span>
                </div>
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500/60 rounded-full" style={{ width: '30%' }} />
                </div>
              </div>

              {/* 10% Grants */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400 flex items-center gap-1.5">
                    <Users size={12} className="text-emerald-400" />
                    {t('ecosystem_grants', 'Ecosystem Grants')}
                  </span>
                  <span className="text-emerald-400 font-bold">10%</span>
                </div>
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: '10%' }} />
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/5 text-[9px] text-gray-600 leading-relaxed">
              {t('treasury_note', 'GSTD is a utility token for AI compute. Treasury funds support network growth and GSTD buybacks on Ston.fi.')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
