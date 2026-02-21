import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { Shield, TrendingUp, DollarSign, ArrowUpRight, RefreshCw, Info, Plus, ExternalLink } from 'lucide-react';
import { API_BASE_URL, ADMIN_WALLET_ADDRESS } from '../../lib/config';
import { useWalletStore } from '../../store/walletStore';

interface PoolStatus {
  gstd_balance: number;
  xaut_balance: number;
  is_healthy: boolean;
  reserve_ratio: number;
  total_value_usd: number;
  total_liquidity_usd?: number;
  pool_address: string;
  platform_lp_share?: number;
  platform_lp_share_percent?: number;
  dynamic_gold_backing?: {
    total_liquidity_usd: number;
    platform_share: number;
    platform_share_pct: number;
  };
}

interface PublicStats {
  golden_reserve_xaut: number;
  gstd_price_usd: number;
  total_supply: number;
  circulating_supply: number;
  total_burned: number;
  total_xaut_bought?: number; // Admin Treasury View
  xaut_history?: Array<{ timestamp: string; amount: number }>;
  last_audit_date?: string;
  audit_verified?: boolean;
}

const TOTAL_SUPPLY = 1_000_000_000; // 1B GSTD
const GOLD_PRICE_USD = 2750; // Approximate XAUt price

const STONFI_POOL_URL = 'https://app.ston.fi/pools/EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp';

function normalizeAddress(addr: string) {
  if (!addr) return '';
  const s = addr.replace(/-/g, '').toLowerCase();
  // TON: EQ vs UQ same wallet — compare raw part (skip 2-char prefix)
  if (s.length > 4 && (s.startsWith('eq') || s.startsWith('uq'))) {
    return s.slice(2);
  }
  return s;
}

export default function GoldenReservePanel() {
  const { t } = useTranslation('common');
  const { address } = useWalletStore();
  const [poolStatus, setPoolStatus] = useState<PoolStatus | null>(null);
  const [publicStats, setPublicStats] = useState<PublicStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [showAddLiquidity, setShowAddLiquidity] = useState(false);
  const [addLiquidityLoading, setAddLiquidityLoading] = useState(false);
  const [addLiquidityResult, setAddLiquidityResult] = useState<{ payload: Record<string, unknown>; amount_gstd: number; amount_xaut: number } | null>(null);
  const [addLiquidityError, setAddLiquidityError] = useState<string | null>(null);

  const isAdmin = address && ADMIN_WALLET_ADDRESS && normalizeAddress(address) === normalizeAddress(ADMIN_WALLET_ADDRESS);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [poolRes, statsRes] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/api/v1/pool/status`).then(r => r.ok ? r.json() : null),
        fetch(`${API_BASE_URL}/api/v1/network/stats`).then(r => r.ok ? r.json() : null), // Changed to network/stats to get audit data
      ]);

      if (poolRes.status === 'fulfilled' && poolRes.value) setPoolStatus(poolRes.value);
      if (statsRes.status === 'fulfilled' && statsRes.value) setPublicStats(statsRes.value);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  // Computed values (must be before useEffect that uses platformShare)
  const platformShare = poolStatus?.platform_lp_share ?? poolStatus?.dynamic_gold_backing?.platform_share ?? 0;

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, platformShare > 0 ? 15000 : 30000);
    return () => clearInterval(interval);
  }, [fetchData, platformShare]);

  const handlePrepareLiquidity = useCallback(async (amountGstd: number, amountXaut: number) => {
    if (!address) return;
    setAddLiquidityLoading(true);
    setAddLiquidityError(null);
    setAddLiquidityResult(null);
    try {
      const sessionToken = typeof window !== 'undefined' ? localStorage.getItem('session_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/v1/admin/commission/prepare-liquidity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Address': address,
          ...(sessionToken ? { 'X-Session-Token': sessionToken } : {}),
        },
        body: JSON.stringify({ amount_gstd: amountGstd, amount_xaut: amountXaut }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setAddLiquidityResult(data);
    } catch (e) {
      setAddLiquidityError(e instanceof Error ? e.message : 'Failed to prepare liquidity');
    } finally {
      setAddLiquidityLoading(false);
    }
  }, [address]);

  // Computed values
  const xautBalance = poolStatus?.xaut_balance || publicStats?.golden_reserve_xaut || 0;
  const gstdBalance = poolStatus?.gstd_balance || 0;
  const totalLiquidityUSD = poolStatus?.total_liquidity_usd ?? poolStatus?.total_value_usd ?? 0;
  const platformSharePct = poolStatus?.platform_lp_share_percent ?? poolStatus?.dynamic_gold_backing?.platform_share_pct ?? 0;
  const reserveValueUSD = xautBalance * GOLD_PRICE_USD;
  const gstdPriceUSD = publicStats?.gstd_price_usd || (gstdBalance > 0 ? reserveValueUSD / gstdBalance : 0.015);
  const marketCapUSD = gstdPriceUSD * TOTAL_SUPPLY;
  const backingRatio = marketCapUSD > 0 ? (reserveValueUSD / marketCapUSD) * 100 : 0;
  // Audit Status
  const isVerified = publicStats?.audit_verified === true;
  const auditDate = publicStats?.last_audit_date;

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
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-white tracking-tight">
                {t('gold_reserve_title') || 'Golden Reserve Fund'}
              </h3>
              {isVerified && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wide">
                    Verified {auditDate ? `(${auditDate})` : ''}
                  </span>
                </div>
              )}
            </div>
            <p className="text-[10px] text-amber-400/60 font-bold uppercase tracking-widest">
              {t('gold_reserve_subtitle') || 'XAUt-Backed Stability • Verified On-Chain'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button onClick={() => { setShowAddLiquidity(true); setAddLiquidityResult(null); setAddLiquidityError(null); }} className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-bold flex items-center gap-1.5 transition-all">
              <Plus size={14} />
              {t('add_liquidity') || 'Add Liquidity'}
            </button>
          )}
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

          {/* Dynamic Gold Backing — всегда показываем, при platformShare>0 обновляем чаще */}
          <div className={`mt-4 p-4 rounded-2xl bg-black/20 border ${platformShare > 0 ? 'border-emerald-500/30' : 'border-amber-500/10'}`}>
            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">
              {t('dynamic_gold_backing') || 'Dynamic Gold Backing'}
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">{t('pool_total_liquidity') || 'Total Pool Liquidity'}</span>
                <span className="text-amber-400 font-bold">
                  {totalLiquidityUSD > 0 ? `$${totalLiquidityUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('platform_share') || 'Our Share'}</span>
                <span className={`font-bold ${platformShare > 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                  {platformShare > 0 ? `${platformShare.toFixed(6)} LP${platformSharePct > 0 ? ` (${platformSharePct.toFixed(2)}%)` : ''}` : '—'}
                </span>
              </div>
              {platformShare > 0 && <div className="text-[10px] text-emerald-400/80 mt-1">● Live</div>}
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
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400"><DollarSign size={18} /></div>
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

          {/* Admin Treasury: Total XAUt Bought */}
          {isAdmin && (publicStats?.total_xaut_bought ?? 0) >= 0 && (
            <div className="p-4 rounded-2xl bg-black/20 border border-amber-500/20 flex items-center justify-between group hover:border-amber-500/30 transition-all">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400"><Shield size={18} /></div>
                <div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Total XAUt Bought</div>
                  <div className="text-lg font-black text-white tabular-nums">{(publicStats?.total_xaut_bought ?? 0).toFixed(6)} <span className="text-xs text-gray-500">XAUt</span></div>
                </div>
              </div>
            </div>
          )}
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
                <span>{t('gold_reserve_inflow') || '7% of every transaction → Reserve'}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span>{t('gold_reserve_buyback') || 'Auto-buyback from platform revenue'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Liquidity Modal (Admin only) */}
      {showAddLiquidity && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddLiquidity(false)}>
          <div className="bg-gray-900 border border-amber-500/30 rounded-2xl p-6 max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <h4 className="text-lg font-black text-white mb-4">{t('add_liquidity') || 'Add Liquidity'}</h4>
            {!addLiquidityResult ? (
              <>
                <p className="text-sm text-gray-400 mb-4">{t('add_liquidity_desc') || 'Prepare transaction to add GSTD/XAUt to Ston.fi pool. You will sign via TonConnect.'}</p>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">GSTD</label>
                    <input type="number" id="add-gstd" defaultValue={10} min={1} step={0.1} className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">XAUt</label>
                    <input type="number" id="add-xaut" defaultValue={0} min={0} step={0.001} className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-sm" />
                  </div>
                </div>
                {addLiquidityError && <p className="text-red-400 text-sm mb-3">{addLiquidityError}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setShowAddLiquidity(false)} className="flex-1 px-4 py-2 rounded-lg bg-white/10 text-gray-300 text-sm font-medium">{t('cancel') || 'Cancel'}</button>
                  <button onClick={() => { const g = parseFloat((document.getElementById('add-gstd') as HTMLInputElement)?.value || '10'); const x = parseFloat((document.getElementById('add-xaut') as HTMLInputElement)?.value || '0'); if ((g >= 0.1 || x >= 0.0001) && (g > 0 || x > 0)) handlePrepareLiquidity(g, x); }} disabled={addLiquidityLoading} className="flex-1 px-4 py-2 rounded-lg bg-amber-500/30 text-amber-400 text-sm font-bold disabled:opacity-50">
                    {addLiquidityLoading ? '...' : (t('prepare') || 'Prepare')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-emerald-400 mb-3">✅ {t('payload_ready') || 'Payload ready'}</p>
                <p className="text-xs text-gray-500 mb-3">{t('add_liquidity_next') || 'Open Ston.fi and add liquidity manually, or use the payload with your wallet:'}</p>
                <a href={STONFI_POOL_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 w-full justify-center px-4 py-3 rounded-xl bg-amber-500/20 text-amber-400 font-bold mb-3 hover:bg-amber-500/30 transition-colors">
                  <ExternalLink size={16} />
                  {t('open_stonfi') || 'Open Ston.fi Pool'}
                </a>
                <p className="text-[10px] text-gray-500 mb-2">{addLiquidityResult.amount_gstd} GSTD + {addLiquidityResult.amount_xaut} XAUt</p>
                <button onClick={() => setShowAddLiquidity(false)} className="w-full px-4 py-2 rounded-lg bg-white/10 text-gray-300 text-sm">{t('close') || 'Close'}</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Detailed Info Panel (expandable) */}
      {showDetails && (
        <div className="mt-6 p-5 rounded-2xl bg-black/30 border border-white/5 relative z-10 animate-in fade-in slide-in-from-top-2 duration-300">
          <h4 className="text-sm font-black text-white mb-3 uppercase tracking-wider">{t('gold_reserve_how') || 'How the Golden Reserve Works'}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-400">
            <div>
              <h5 className="font-bold text-amber-400 mb-1">{t('gold_reserve_how_1_title') || 'Transaction Fee'}</h5>
              <p>{t('gold_reserve_how_1') || 'Every task payment on GSTD Platform allocates 7% to the Golden Reserve Fund. This fund buys XAUt (Tether Gold) on STON.fi DEX, creating physical gold backing for the GSTD token.'}</p>
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
