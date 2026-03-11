'use client';

/**
 * Total Domination — Live Hashrate Visualization
 * Animated bar / pulse showing compute power
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';

interface LiveHashrateChartProps {
  hashrate: number;
  tasksPerHour: number;
  activeWorkers: number;
}

export default function LiveHashrateChart({ hashrate, tasksPerHour, activeWorkers }: LiveHashrateChartProps) {
  const { t } = useTranslation('common');
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => {
      setPulse((p) => (p + 1) % 20);
    }, 200);
    return () => clearInterval(iv);
  }, []);

  const fillPct = Math.min(100, (tasksPerHour / Math.max(1, activeWorkers * 10)) * 100);

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{t('live_hashrate', 'Live Hashrate')}</span>
        <span className="text-sm font-bold text-violet-400 tabular-nums">
          {hashrate.toLocaleString()} tasks
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full transition-all duration-500"
          style={{
            width: `${fillPct}%`,
            boxShadow: pulse > 10 ? '0 0 12px rgba(139, 92, 246, 0.6)' : 'none',
          }}
        />
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-gray-500">
        <span>{tasksPerHour}/h</span>
        <span>{activeWorkers} workers</span>
      </div>
    </div>
  );
}
