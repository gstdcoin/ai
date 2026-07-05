'use client';
import { useTranslation } from 'next-i18next';
import { useMemo } from 'react';

interface NodeEarningsWidgetProps {
  goldBalance: number;
  goldReserveGstd: number;
  goldMultiplier: number;
}

// Props kept for backwards-compat with callers; only gstd earnings (goldReserveGstd) is displayed.
export default function GoldenAccumulationChart({ goldReserveGstd, goldMultiplier }: NodeEarningsWidgetProps) {
  const { t } = useTranslation('common');
  const displayGstd = goldReserveGstd ?? 0;
  // Soft cap for progress bar: treat 500 GSTD as "full bar"
  const progressPct = useMemo(() => Math.min(100, (displayGstd / 500) * 100), [displayGstd]);

  return (
    <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4">
      <div className="text-[10px] uppercase tracking-widest text-emerald-500/80 font-bold mb-2">
        {t('node_earnings', 'Node Earnings')}
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-2xl font-black text-emerald-400 tabular-nums">
          {displayGstd.toFixed(2)} GSTD
        </span>
        <span className="text-xs text-gray-500">×{goldMultiplier.toFixed(2)} mult</span>
      </div>
      <div className="h-2 rounded-full bg-emerald-500/20 overflow-hidden mb-2">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full transition-all duration-700"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-500">
        <span>{t('earned_from_inference', 'Earned from AI inference')}</span>
        <span className="text-emerald-400 font-bold">{progressPct.toFixed(0)}%</span>
      </div>
    </div>
  );
}
