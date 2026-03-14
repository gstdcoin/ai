'use client';

/**
 * Total Domination — Financial Layer: Escrow 2.0 / Golden Gateway
 * Instant display of completed tasks as transactions
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { API_URL } from '../../lib/config';
import { ArrowUpRight, ArrowDownRight, Loader2 } from 'lucide-react';

interface Transaction {
  tx_id: string;
  tx_type: string;
  amount_gstd: number;
  from_wallet: string | null;
  to_wallet: string;
  task_id: string | null;
  description: string;
  status: string;
  created_at: string;
}

interface GoldenGatewayTransactionsProps {
  wallet: string | null;
}

export default function GoldenGatewayTransactions({ wallet }: GoldenGatewayTransactionsProps) {
  const { t } = useTranslation('common');
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!wallet) {
      setTxs([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const fetchTxs = async () => {
      try {
        const res = await fetch(`${API_URL}/billing/transactions/${wallet}?limit=15`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        setTxs(data.transactions || []);
      } catch (_e) {
        if (!cancelled) setTxs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchTxs();
    return () => { cancelled = true; };
  }, [wallet]);

  const formatDate = (s: string) => {
    const d = new Date(s);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return d.toLocaleDateString();
  };

  const isIncoming = (tx: Transaction) => {
    if (!wallet) return false;
    return tx.tx_type === 'worker_payout' || (tx.to_wallet?.toLowerCase() === wallet.toLowerCase());
  };

  if (loading) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex items-center justify-center min-h-[120px]">
        <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
      <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-3">
        {t('gold_reserve_title', 'Gold Reserve Fund')} — Golden Gateway
      </div>
      {txs.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">{t('no_tasks', 'No Tasks')}</p>
      ) : (
        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {txs.map((tx) => (
            <div
              key={tx.tx_id}
              className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
            >
              <div className="flex items-center gap-2">
                {isIncoming(tx) ? (
                  <ArrowDownRight className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <ArrowUpRight className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <div>
                  <div className="text-xs text-gray-300">
                    {tx.tx_type === 'worker_payout' ? t('task_history', 'Task History') : tx.description || tx.tx_type}
                  </div>
                  <div className="text-[10px] text-gray-500">{formatDate(tx.created_at)}</div>
                </div>
              </div>
              <span
                className={`text-sm font-bold tabular-nums ${
                  isIncoming(tx) ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {isIncoming(tx) ? '+' : '-'}{tx.amount_gstd.toFixed(4)} GSTD
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
