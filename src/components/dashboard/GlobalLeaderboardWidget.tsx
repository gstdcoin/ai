'use client';

import { useEffect, useState } from 'react';
import { Trophy, Globe, Hash } from 'lucide-react';
import { API_BASE_URL } from '../../lib/config';

interface LeaderboardEntry {
  h3_index: string;
  node_count: number;
  total_trust: number;
  country: string;
}

export function GlobalLeaderboardWidget() {
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/leaderboard/h3`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.leaderboard) setData(j.leaderboard);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
        <div className="flex items-center gap-2 text-gray-400 mb-3">
          <Trophy size={18} />
          <span className="text-sm font-medium">Global Leaderboard (H3)</span>
        </div>
        <div className="animate-pulse h-24 bg-white/5 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
      <div className="flex items-center gap-2 text-cyan-400 mb-3">
        <Trophy size={18} />
        <span className="text-sm font-medium">Global Leaderboard (H3)</span>
      </div>
      <p className="text-[10px] text-gray-500 mb-2">Which region is smartest / most powerful</p>
      <div className="space-y-1.5 max-h-40 overflow-y-auto">
        {data.slice(0, 10).map((e, i) => (
          <div
            key={e.h3_index + i}
            className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-white/[0.02] hover:bg-white/5"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-gray-500 w-5">#{i + 1}</span>
              <Hash size={12} className="text-gray-600" />
              <span className="text-xs font-mono text-gray-400 truncate max-w-[80px]">{e.h3_index || '?'}</span>
              {e.country && (
                <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
                  <Globe size={10} /> {e.country}
                </span>
              )}
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-cyan-400">{e.node_count}</span>
              <span className="text-[10px] text-gray-500 ml-1">nodes</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
