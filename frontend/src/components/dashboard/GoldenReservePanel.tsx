import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { Shield, TrendingUp, Coins, Lock, ArrowUpRight, RefreshCw, Info } from 'lucide-react';
import { API_BASE_URL } from '../../lib/config';

interface PoolStatus {
  gstd_balance: number;
  xaut_balance: number;
  is_healthy: boolean;
  reserve_ratio: number;
  total_value_usd: number;
  pool_address: string;
}

interface PublicStats {
  golden_reserve_xaut: number;
  gstd_price_usd: number;
  total_supply: number;
  circulating_supply: number;
  total_burned: number;
  xaut_history?: Array<{ timestamp: string; amount: number }>;
}

const TOTAL_SUPPLY = 1_000_000_000; // 1B GSTD
const GOLD_PRICE_USD = 2750; // Approximate XAUt price

export default function GoldenReservePanel() {
  const { t } = useTranslation('common');
  const [poolStatus, setPoolStatus] = useState<PoolStatus | null>(null);
  const [publicStats, setPublicStats] = useState<PublicStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [poolRes, statsRes] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/api/v1/pool/status`).then(r => r.ok ? r.json() : null),
        fetch(`${API_BASE_URL}/api/v1/stats/public`).then(r => r.ok ? r.json() : null),
      ]);

      if (poolRes.status === 'fulfilled' && poolRes.value) setPoolStatus(poolRes.value);
      if (statsRes.status === 'fulfilled' && statsRes.value) setPublicStats(statsRes.value);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Computed values
  const xautBalance = poolStatus?.xaut_balance || publicStats?.golden_reserve_xaut || 0;
  const gstdBalance = poolStatus?.gstd_balance || 0;
  const reserveValueUSD = xautBalance * GOLD_PRICE_USD;
  const gstdPriceUSD = publicStats?.gstd_price_usd || (gstdBalance > 0 ? reserveValueUSD / gstdBalance : 0.015);
  const marketCapUSD = gstdPriceUSD * TOTAL_SUPPLY;
  const backingRatio = marketCapUSD > 0 ? (reserveValueUSD / marketCapUSD) * 100 : 0;
  const totalBurned = publicStats?.total_burned || 0;
  const deflationPercent = (totalBurned / TOTAL_SUPPLY) * 100;

  // Progress toward 1 XAUt target (milestone)
  const xautTarget = 1.0;
  const progressToTarget = Math.min((xautBalance / xautTarget) * 100, 100);

  // History data for mini sparkline
  const history = publicStats?.xaut_history || [];
  const historyMax = Math.max(...history.map(h => h.amount), xautBalance, 0.000001);

  if (loading && !poolStatus && !publicStats) {
    return (
      <div className="col-span-2 lg:col-span-4 glass-card p-8 animate-pulse">
        <div className="h-6 bg-amber-500/10 rounded w-48 mb-4" />
        <div className="h-20 bg-amber-500/5 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="col-span-2 lg:col-span-4 relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-900/10 via-yellow-900/5 to-orange-900/10 border border-amber-500/20 p-6 lg:p-8">
      {/* Background decorations */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-yellow-600/5 rounded-full blur-[60px] -ml-24 -mb-24 pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-yellow-600/20 border border-amber-500/30 flex items-center justify-center">
            <Shield className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white tracking-tight">
              {t('gold_reserve_title') || 'Golden Reserve Fund'}
            </h3>
            <p className="text-[10px] text-amber-400/60 font-bold uppercase tracking-widest">
              {t('gold_reserve_subtitle') || 'XAUt-Backed Stability • Verified On-Chain'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowDetails(!showDetails)} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all">
            <Info size={14} />
          </button>
          <button onClick={fetchData} disabled={loading} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
        {/* Left: Reserve Balance */}
        <div className="md:col-span-1">
          <div className="p-5 rounded-2xl bg-black/20 border border-amber-500/10">
            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">{t('gold_reserve_balance') || 'Reserve Balance'}</div>
            <div className="text-3xl font-black bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-400 bg-clip-text text-transparent tabular-nums mb-1">
              {xautBalance.toFixed(6)}
            </div>
            <div className="text-sm text-gray-400 font-bold">XAUt (Tether Gold)</div>
            <div className="mt-3 pt-3 border-t border-white/5">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">{t('gold_reserve_usd') || 'USD Value'}</span>
                <span className="text-emerald-400 font-bold">${reserveValueUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">{t('gold_reserve_backing') || 'Backing Ratio'}</span>
                <span className="text-amber-400 font-bold">{backingRatio.toFixed(2)}%</span>
              </div>
            </div>
          </div>

          {/* Progress to milestone */}
          <div className="mt-4 p-4 rounded-2xl bg-black/20 border border-amber-500/10">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest mb-2">
              <span className="text-gray-500">{t('gold_reserve_progress') || 'Progress to 1 XAUt'}</span>
              <span className="text-amber-400">{progressToTarget.toFixed(1)}%</span>
            </div>
            <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-400 rounded-full transition-all duration-1000 ease-out relative"
                style={{ width: `${progressToTarget}%` }}
              >
                <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.3)_50%,transparent_100%)] animate-[shimmer_2s_infinite]" />
              </div>
            </div>
            <div className="flex justify-between text-[9px] text-gray-600 mt-1.5 font-bold">
              <span>0 XAUt</span>
              <span>1.0 XAUt (~${GOLD_PRICE_USD.toLocaleString()})</span>
            </div>
          </div>
        </div>

        {/* Center: Key Metrics */}
        <div className="md:col-span-1 space-y-3">
          {/* GSTD Price */}
          <div className="p-4 rounded-2xl bg-black/20 border border-white/5 flex items-center justify-between group hover:border-emerald-500/20 transition-all">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400"><Coins size={18} /></div>
              <div>
                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">GSTD Price</div>
                <div className="text-lg font-black text-white tabular-nums">${gstdPriceUSD.toFixed(6)}</div>
              </div>
            </div>
            <ArrowUpRight size={14} className="text-emerald-500/40" />
          </div>

          {/* Market Cap */}
          <div className="p-4 rounded-2xl bg-black/20 border border-white/5 flex items-center justify-between group hover:border-violet-500/20 transition-all">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400"><TrendingUp size={18} /></div>
              <div>
                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{t('gold_reserve_mcap') || 'Market Cap'}</div>
                <div className="text-lg font-black text-white tabular-nums">${(marketCapUSD / 1000000).toFixed(2)}M</div>
              </div>
            </div>
          </div>

          {/* Deflation */}
          <div className="p-4 rounded-2xl bg-black/20 border border-white/5 flex items-center justify-between group hover:border-red-500/20 transition-all">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-red-500/10 text-red-400"><Lock size={18} /></div>
              <div>
                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{t('gold_reserve_burned') || 'Total Burned'}</div>
                <div className="text-lg font-black text-white tabular-nums">{totalBurned.toLocaleString()} <span className="text-xs text-gray-500">GSTD</span></div>
              </div>
            </div>
            <span className="text-[10px] text-red-400 font-bold">-{deflationPercent.toFixed(4)}%</span>
          </div>
        </div>

        {/* Right: Mini Chart / Flow */}
        <div className="md:col-span-1">
          <div className="p-5 rounded-2xl bg-black/20 border border-white/5 h-full flex flex-col">
            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-3">{t('gold_reserve_flow') || 'Reserve Growth'}</div>

            {/* Mini sparkline */}
            <div className="flex-1 flex items-end gap-[2px] min-h-[80px] mb-3">
              {history.length > 0 ? history.slice(-20).map((point, i) => {
                const height = historyMax > 0 ? (point.amount / historyMax) * 100 : 10;
                return (
                  <div key={i} className="flex-1 flex items-end">
                    <div
                      className="w-full bg-gradient-to-t from-amber-600/60 to-amber-400/80 rounded-t-sm transition-all duration-300 hover:from-amber-500 hover:to-yellow-400"
                      style={{ height: `${Math.max(height, 5)}%` }}
                      title={`${new Date(point.timestamp).toLocaleDateString()}: ${point.amount.toFixed(6)} XAUt`}
                    />
                  </div>
                );
              }) : (
                // Placeholder bars if no history
                Array.from({ length: 12 }, (_, i) => (
                  <div key={i} className="flex-1 flex items-end">
                    <div className="w-full bg-amber-500/10 rounded-t-sm" style={{ height: `${20 + Math.random() * 60}%` }} />
                  </div>
                ))
              )}
            </div>

            {/* Fund flow explanation */}
            <div className="space-y-2 text-[10px]">
              <div className="flex items-center gap-2 text-gray-400">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>{t('gold_reserve_inflow') || '2% of every transaction → Reserve'}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span>{t('gold_reserve_burn') || '5% of every transaction → Burned'}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span>{t('gold_reserve_buyback') || 'Auto-buyback from platform revenue'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Info Panel (expandable) */}
      {showDetails && (
        <div className="mt-6 p-5 rounded-2xl bg-black/30 border border-white/5 relative z-10 animate-in fade-in slide-in-from-top-2 duration-300">
          <h4 className="text-sm font-black text-white mb-3 uppercase tracking-wider">{t('gold_reserve_how') || 'How the Golden Reserve Works'}</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-400">
            <div>
              <h5 className="font-bold text-amber-400 mb-1">{t('gold_reserve_how_1_title') || 'Transaction Fee'}</h5>
              <p>{t('gold_reserve_how_1') || 'Every task payment on GSTD Platform allocates 2% to the Golden Reserve Fund. This fund buys XAUt (Tether Gold) on STON.fi DEX, creating physical gold backing for the GSTD token.'}</p>
            </div>
            <div>
              <h5 className="font-bold text-red-400 mb-1">{t('gold_reserve_how_2_title') || 'Deflationary Burn'}</h5>
              <p>{t('gold_reserve_how_2') || 'An additional 5% of every transaction is permanently burned, reducing the total supply from 1 billion. This creates constant deflationary pressure, increasing scarcity.'}</p>
            </div>
            <div>
              <h5 className="font-bold text-emerald-400 mb-1">{t('gold_reserve_how_3_title') || 'Auto-Buyback'}</h5>
              <p>{t('gold_reserve_how_3') || 'Platform revenue from API gateway fees and marketplace commissions is used to buy back GSTD from the open market and add to the gold reserve, creating a virtuous cycle.'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Shimmer animation */}
      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
