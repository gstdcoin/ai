import { useState, useEffect, useCallback, memo } from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import { apiGet, apiPost } from '../../lib/apiClient';
import { toast } from '../../lib/toast';
import {
  Landmark,
  TrendingUp,
  ShieldCheck,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  RotateCcw,
  Activity,
  Loader2,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// LENDING PANEL — Gold-Backed Credit Lines UI
//
// Features:
//   1. Vault overview (collateral, debt, health factor)
//   2. Deposit / Withdraw GSTD collateral
//   3. Borrow / Repay stablecoin loans
//   4. Transaction history
//   5. Global lending stats
//   6. AI risk advisor display
//   7. Liquidation price warning
// ═══════════════════════════════════════════════════════════════

interface VaultData {
  id: number;
  wallet_address: string;
  collateral_gstd: number;
  collateral_usd: number;
  debt_usdt: number;
  collateral_ratio: number;
  health_factor: number;
  borrow_apr: number;
  accrued_interest: number;
  status: string;
  liquidation_threshold: number;
  auto_repay: boolean;
  ai_risk_score: number | null;
  ai_last_advice: string | null;
  borrowable_usdt: number;
  withdrawable_gstd: number;
  liquidation_price: number;
}

interface LendingTx {
  id: number;
  tx_type: string;
  amount_gstd: number;
  amount_usdt: number;
  gstd_price_usd: number;
  collateral_ratio_after: number;
  created_at: string;
}

interface LendingStatsData {
  total_value_locked_usd: number;
  total_borrowed_usdt: number;
  active_vaults: number;
  average_apr: number;
  safety_fund_gstd: number;
  gstd_price_usd: number;
}

interface OracleStatusData {
  healthy: boolean;
  last_push_time: string;
  last_gstd_price: number;
  last_gold_price: number;
  push_count: number;
}

type ActionMode = 'deposit' | 'withdraw' | 'borrow' | 'repay' | null;

function LendingPanel() {
  const { t } = useTranslation('common');
  const { address, gstdBalance } = useWalletStore();

  const [vault, setVault] = useState<VaultData | null>(null);
  const [stats, setStats] = useState<LendingStatsData | null>(null);
  const [oracleStatus, setOracleStatus] = useState<OracleStatusData | null>(null);
  const [txHistory, setTxHistory] = useState<LendingTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [inputAmount, setInputAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Load vault data
  const loadVault = useCallback(async () => {
    if (!address) return;
    try {
      const [v, s, tx, os] = await Promise.all([
        apiGet<VaultData>('/lending/vault'),
        apiGet<LendingStatsData>('/lending/stats'),
        apiGet<LendingTx[]>('/lending/transactions?limit=10'),
        apiGet<OracleStatusData>('/lending/oracle-status'),
      ]);
      setVault(v);
      setStats(s);
      setTxHistory(tx || []);
      setOracleStatus(os);
    } catch {
      // Tables may not exist yet
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    loadVault();
    const interval = setInterval(loadVault, 30000);
    return () => clearInterval(interval);
  }, [loadVault]);

  // Execute action
  const handleAction = useCallback(async () => {
    if (!actionMode || !inputAmount || processing) return;
    const amount = parseFloat(inputAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Invalid amount', '');
      return;
    }

    setProcessing(true);
    try {
      const endpoint = `/lending/${actionMode}`;
      await apiPost(endpoint, { amount });
      toast.success(
        actionMode === 'deposit' ? 'Collateral Deposited!'
          : actionMode === 'borrow' ? 'Loan Issued!'
          : actionMode === 'repay' ? 'Loan Repaid!'
          : 'Collateral Withdrawn!',
        ''
      );
      setActionMode(null);
      setInputAmount('');
      await loadVault();
    } catch (err: any) {
      toast.error('Action Failed', err?.message || 'Please try again');
    } finally {
      setProcessing(false);
    }
  }, [actionMode, inputAmount, processing, loadVault]);

  // Health factor color
  const hfColor = (hf: number) => {
    if (hf >= 2) return '#10b981'; // green
    if (hf >= 1.5) return '#f59e0b'; // amber
    if (hf >= 1) return '#f97316'; // orange
    return '#ef4444'; // red
  };

  const hfLabel = (hf: number) => {
    if (hf >= 2) return 'Safe';
    if (hf >= 1.5) return 'Moderate';
    if (hf >= 1) return 'At Risk';
    return 'DANGER';
  };

  if (!address) {
    return (
      <div style={{ background: 'rgba(8,8,26,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 32, textAlign: 'center' }}>
        <Landmark size={32} className="text-amber-400 mx-auto mb-3" />
        <div className="text-white font-semibold mb-1">Connect Wallet</div>
        <div className="text-gray-500 text-sm">Connect your wallet to access gold-backed lending</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="text-violet-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10">
            <Landmark size={20} className="text-amber-400" />
          </div>
          <div>
            <div className="text-lg font-bold text-white">Gold-Backed Lending</div>
            <div className="text-[11px] text-gray-500">Borrow against your GSTD collateral</div>
          </div>
        </div>
        {oracleStatus && (
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1.5 mb-0.5">
              <div className={`w-2 h-2 rounded-full ${oracleStatus.healthy ? 'bg-emerald-500' : 'bg-orange-500'}`} />
              <div className={`text-[11px] font-bold ${oracleStatus.healthy ? 'text-emerald-500' : 'text-orange-500'} uppercase tracking-wider`}>
                Oracle {oracleStatus.healthy ? 'Live' : 'Degraded'}
              </div>
            </div>
            <div className="text-[10px] text-gray-500">
              Gold: <span className="text-amber-400">${oracleStatus.last_gold_price.toFixed(2)}</span> /oz
            </div>
          </div>
        )}
      </div>

      {/* ═══ GLOBAL STATS ═══ */}
      {stats && (
        <div style={{
          background: 'rgba(8,8,26,0.8)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14,
          padding: '16px 20px',
        }}>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-[10px] text-gray-600 mb-1">TVL</div>
              <div className="text-sm font-bold text-white">${stats.total_value_locked_usd.toFixed(0)}</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-600 mb-1">Borrowed</div>
              <div className="text-sm font-bold text-sky-400">${stats.total_borrowed_usdt.toFixed(0)}</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-600 mb-1">Active Vaults</div>
              <div className="text-sm font-bold text-emerald-400">{stats.active_vaults}</div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ VAULT OVERVIEW ═══ */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(245,158,11,0.06), rgba(139,92,246,0.04))',
        border: '1px solid rgba(245,158,11,0.12)',
        borderRadius: 18,
        padding: '24px',
      }}>
        <div className="grid grid-cols-2 gap-4 mb-5">
          {/* Collateral */}
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1">
              <ShieldCheck size={12} className="text-amber-400" /> Collateral
            </div>
            <div className="text-2xl font-black text-white tabular-nums">
              {vault?.collateral_gstd?.toFixed(2) || '0.00'}
              <span className="text-xs text-gray-500 ml-1">GSTD</span>
            </div>
            <div className="text-[11px] text-amber-400/60">${vault?.collateral_usd?.toFixed(2) || '0.00'}</div>
          </div>

          {/* Debt */}
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1">
              <Banknote size={12} className="text-sky-400" /> Debt
            </div>
            <div className="text-2xl font-black text-white tabular-nums">
              {vault?.debt_usdt?.toFixed(2) || '0.00'}
              <span className="text-xs text-gray-500 ml-1">USDt</span>
            </div>
            <div className="text-[11px] text-gray-400">APR: {((vault?.borrow_apr || 0) * 100).toFixed(1)}%</div>
          </div>
        </div>

        {/* Health Factor Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <Activity size={11} /> Health Factor
            </div>
            <div className="text-sm font-bold tabular-nums" style={{ color: hfColor(vault?.health_factor || 999) }}>
              {(vault?.health_factor || 0) >= 100 ? '∞ Safe' : `${(vault?.health_factor || 0).toFixed(2)} — ${hfLabel(vault?.health_factor || 999)}`}
            </div>
          </div>
          <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.max(5, ((vault?.health_factor || 0) / 3) * 100))}%`,
                background: `linear-gradient(90deg, ${hfColor(vault?.health_factor || 999)}, ${hfColor(vault?.health_factor || 999)}80)`,
              }}
            />
          </div>
          {vault && vault.liquidation_price > 0 && (
            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-orange-400/80">
              <AlertTriangle size={10} />
              Liquidation at ${vault.liquidation_price.toFixed(6)}/GSTD
            </div>
          )}
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-2.5 rounded-lg bg-white/[0.03]">
            <div className="text-[9px] text-gray-600 mb-0.5">CR</div>
            <div className="text-sm font-bold text-white">{((vault?.collateral_ratio || 0) * 100).toFixed(0)}%</div>
          </div>
          <div className="p-2.5 rounded-lg bg-white/[0.03]">
            <div className="text-[9px] text-gray-600 mb-0.5">Borrowable</div>
            <div className="text-sm font-bold text-emerald-400">${(vault?.borrowable_usdt || 0).toFixed(2)}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-white/[0.03]">
            <div className="text-[9px] text-gray-600 mb-0.5">Interest</div>
            <div className="text-sm font-bold text-amber-400">${(vault?.accrued_interest || 0).toFixed(4)}</div>
          </div>
        </div>
      </div>

      {/* ═══ AI ADVISOR ═══ */}
      {vault?.ai_last_advice && (
        <div style={{
          background: 'rgba(139,92,246,0.04)',
          border: '1px solid rgba(139,92,246,0.10)',
          borderRadius: 12,
          padding: '12px 16px',
        }} className="flex items-start gap-3">
          <Info size={16} className="text-violet-400 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-[10px] text-violet-400 font-bold uppercase mb-0.5">AI Risk Advisor</div>
            <div className="text-[12px] text-gray-300">{vault.ai_last_advice}</div>
            {vault.ai_risk_score !== null && (
              <div className="text-[10px] text-gray-500 mt-1">Risk Score: {(vault.ai_risk_score * 100).toFixed(0)}%</div>
            )}
          </div>
        </div>
      )}

      {/* ═══ ACTION BUTTONS ═══ */}
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { mode: 'deposit' as ActionMode, label: 'Deposit', icon: <ArrowDownToLine size={15} />, color: 'emerald' },
          { mode: 'borrow' as ActionMode, label: 'Borrow', icon: <Banknote size={15} />, color: 'sky' },
          { mode: 'repay' as ActionMode, label: 'Repay', icon: <RotateCcw size={15} />, color: 'amber' },
          { mode: 'withdraw' as ActionMode, label: 'Withdraw', icon: <ArrowUpFromLine size={15} />, color: 'violet' },
        ].map(({ mode, label, icon, color }) => (
          <button
            key={mode}
            onClick={() => { setActionMode(actionMode === mode ? null : mode); setInputAmount(''); }}
            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.97]
              ${actionMode === mode
                ? `bg-${color}-500/20 text-${color}-300 border border-${color}-500/30`
                : 'bg-white/[0.04] text-gray-400 border border-white/[0.06] hover:bg-white/[0.06] hover:text-white'}`}
            style={actionMode === mode ? {
              background: color === 'emerald' ? 'rgba(16,185,129,0.15)' : color === 'sky' ? 'rgba(14,165,233,0.15)' : color === 'amber' ? 'rgba(245,158,11,0.15)' : 'rgba(139,92,246,0.15)',
              borderColor: color === 'emerald' ? 'rgba(16,185,129,0.3)' : color === 'sky' ? 'rgba(14,165,233,0.3)' : color === 'amber' ? 'rgba(245,158,11,0.3)' : 'rgba(139,92,246,0.3)',
              color: color === 'emerald' ? '#6ee7b7' : color === 'sky' ? '#7dd3fc' : color === 'amber' ? '#fcd34d' : '#c4b5fd',
            } : undefined}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* ═══ ACTION INPUT ═══ */}
      {actionMode && (
        <div style={{
          background: 'rgba(8,8,26,0.9)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          padding: '16px',
        }} className="animate-in slide-in-from-top-2 duration-200">
          <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">
            {actionMode === 'deposit' && `Deposit GSTD (Balance: ${(gstdBalance || 0).toFixed(2)})`}
            {actionMode === 'borrow' && `Borrow USDt (Max: $${(vault?.borrowable_usdt || 0).toFixed(2)})`}
            {actionMode === 'repay' && `Repay USDt (Debt: $${(vault?.debt_usdt || 0).toFixed(2)})`}
            {actionMode === 'withdraw' && `Withdraw GSTD (Max: ${(vault?.withdrawable_gstd || 0).toFixed(4)})`}
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              value={inputAmount}
              onChange={(e) => setInputAmount(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-white text-sm tabular-nums outline-none focus:border-violet-500/30"
              step="any"
              min="0"
            />
            <button
              onClick={() => {
                if (actionMode === 'deposit') setInputAmount(String(gstdBalance || 0));
                if (actionMode === 'borrow') setInputAmount(String(vault?.borrowable_usdt || 0));
                if (actionMode === 'repay') setInputAmount(String((vault?.debt_usdt || 0) + (vault?.accrued_interest || 0)));
                if (actionMode === 'withdraw') setInputAmount(String(vault?.withdrawable_gstd || 0));
              }}
              className="px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[11px] text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all font-bold uppercase"
            >
              Max
            </button>
            <button
              onClick={handleAction}
              disabled={processing || !inputAmount}
              className="px-5 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-bold hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.97]"
            >
              {processing ? <Loader2 size={16} className="animate-spin" /> : 'Confirm'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ TRANSACTION HISTORY ═══ */}
      {txHistory.length > 0 && (
        <div style={{
          background: 'rgba(8,8,26,0.8)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14,
        }}>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between px-4 py-3 text-gray-400 hover:text-white transition-colors"
          >
            <span className="text-[11px] font-bold uppercase tracking-wider">Transaction History</span>
            {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showHistory && (
            <div className="px-4 pb-3 space-y-1.5">
              {txHistory.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-2 border-t border-white/[0.04]">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      tx.tx_type === 'deposit' ? 'bg-emerald-500'
                        : tx.tx_type === 'borrow' ? 'bg-sky-500'
                        : tx.tx_type === 'repay' ? 'bg-amber-500'
                        : tx.tx_type === 'liquidation' ? 'bg-red-500'
                        : 'bg-violet-500'}`}
                    />
                    <div>
                      <div className="text-[12px] text-white capitalize">{tx.tx_type}</div>
                      <div className="text-[10px] text-gray-600">{new Date(tx.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    {tx.amount_gstd > 0 && <div className="text-[12px] text-white tabular-nums">{tx.amount_gstd.toFixed(2)} GSTD</div>}
                    {tx.amount_usdt > 0 && <div className="text-[11px] text-gray-400 tabular-nums">${tx.amount_usdt.toFixed(2)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ SAFETY INFO ═══ */}
      <div style={{
        background: 'rgba(16,185,129,0.04)',
        border: '1px solid rgba(16,185,129,0.08)',
        borderRadius: 12,
        padding: '12px 16px',
      }} className="flex items-start gap-3">
        <TrendingUp size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
        <div className="text-[11px] text-gray-400">
          <span className="text-emerald-400 font-semibold">Safety Fund:</span>{' '}
          {stats ? `${stats.safety_fund_gstd.toFixed(2)} GSTD` : '...'} backing all outstanding loans.
          Min collateral ratio: 150%. Positions below 110% are auto-liquidated.
        </div>
      </div>
    </div>
  );
}

export default memo(LendingPanel);
