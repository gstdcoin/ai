'use client';

/**
 * Live network ticker shown on all mini-app screens.
 * Every figure comes from the platform registry (/api/v1/network/stats); nothing is simulated.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { API_URL } from '../../lib/config';

const REFRESH_MS = 30_000;

export default function LeviathanTMATicker() {
  const { t } = useTranslation('common');
  const [items, setItems] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/network/stats`);
        if (!res.ok) throw new Error(String(res.status));
        const s = await res.json();
        if (!alive) return;
        setItems([
          `${t('ticker_nodes_online', 'Nodes online')}: ${s.nodes_online ?? 0} / ${s.total_nodes ?? 0}`,
          `${t('ticker_tasks_done', 'Tasks completed')}: ${s.tasks_completed ?? 0}`,
          `${t('ticker_queue', 'Queue')}: ${s.queue_depth ?? 0}`,
          `${t('ticker_paid', 'GSTD paid')}: ${s.total_gstd_paid ?? 0}`,
        ]);
      } catch {
        if (alive) setItems([t('ticker_unavailable', 'Network stats temporarily unavailable')]);
      }
    };
    load();
    const iv = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(iv); };
  }, [t]);

  if (items.length === 0) return null;

  return (
    <div
      className="overflow-hidden border-b border-white/5 bg-black/40 py-1.5"
      style={{ position: 'sticky', top: 0, zIndex: 9998 }}
    >
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-0.5 text-[10px] text-gray-400">
        {items.map((msg) => (
          <span key={msg} className="shrink-0">{msg}</span>
        ))}
      </div>
    </div>
  );
}