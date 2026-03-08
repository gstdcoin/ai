'use client';
import { useTranslation } from 'next-i18next';

/**
 * Total Domination — Golden Accumulation Visualization
 * Progress to 1 XAUt, gold reserve growth
 */
import { useMemo } from 'react';

interface GoldenAccumulationChartProps {
  goldBalance: number;
  goldReserveGstd: number;
  goldMultiplier: number;
}

const GOLD_PRICE_USD = 2750;

export default function GoldenAccumulationChart({ goldBalance, goldReserveGstd, goldMultiplier }: GoldenAccumulationChartProps) {
  const { t } = useTranslation('common');
  const targetXAUt = 1;
  const progressPct = useMemo(() => Math.min(100, (goldBalance / targetXAUt) * 100), [goldBalance]);
  const goldUSD = goldBalance * GOLD_PRICE_USD;

  return (
    <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4">
      <div className="text-[10px] uppercase tracking-widest text-amber-500/80 font-bold mb-2">{t('golden_accumulation', 'Golden Accumulation')}</div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-2xl font-black text-amber-400 tabular-nums">
          {goldBalance.toFixed(4)} XAUt
        </span>
        <span className="text-xs text-gray-500">≈ ${goldUSD.toLocaleString()}</span>
      </div>
      <div className="h-2 rounded-full bg-amber-500/20 overflow-hidden mb-2">
        <div
          className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-700"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-500">
        <span>{t('gold_reserve_progress', 'Progress to 1 XAUt')}</span>
        <span className="text-amber-400 font-bold">{goldMultiplier.toFixed(2)}x mult</span>
      </div>
    </div>
  );
}
