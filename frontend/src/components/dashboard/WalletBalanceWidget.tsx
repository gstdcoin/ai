import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import { apiGet, apiPost } from '../../lib/apiClient';
import {
    Wallet,
    TrendingUp,
    Clock,
    CheckCircle,
    DollarSign,
    RefreshCw,
    ArrowUpRight,
    ArrowDownRight,
    Loader2,
    ExternalLink,
    Copy,
    Check
} from 'lucide-react';
import { toast } from '../../lib/toast';

interface WalletBalance {
    gstd_balance: number;
    ton_balance: number;
    pending_earnings: number;
    pending_payouts: number;
    total_earned: number;
    locked_in_escrow: number;
}

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
    confirmed_at: string | null;
}

interface RecentActivity {
    type: 'earning' | 'payout' | 'escrow_lock' | 'escrow_release';
    amount: number;
    description: string;
    timestamp: string;
}

export const WalletBalanceWidget: React.FC = () => {
    const { t } = useTranslation('common');
    const { address } = useWalletStore();
    const [balance, setBalance] = useState<WalletBalance | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchBalance = useCallback(async () => {
        if (!address) return;

        try {
            const data = await apiGet<WalletBalance>(`/wallet/balance?wallet=${address}`);
            setBalance(data);
            if (data) {
                updateBalance(data.ton_balance.toString(), data.gstd_balance, data.pending_earnings);
            }
        } catch (error) {
            console.error('Failed to fetch balance:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [address]);

    useEffect(() => {
        fetchBalance();
        const interval = setInterval(fetchBalance, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, [fetchBalance]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchBalance();
    };

    if (loading) {
        return (
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 flex items-center justify-center min-h-[200px]">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 border border-gray-700/50">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                        <Wallet className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">{t('wallet.balance')}</h3>
                        <p className="text-sm text-gray-400">{t('wallet.realTime')}</p>
                    </div>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 text-gray-400 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="space-y-4">
                {/* GSTD Balance */}
                <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl p-4 border border-blue-500/20">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">GSTD</span>
                        <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-full">
                            {t('wallet.mainToken')}
                        </span>
                    </div>
                    <p className="text-3xl font-bold text-white mt-2">
                        {(balance?.gstd_balance || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                        ≈ ${((balance?.gstd_balance || 0) * 0.01).toFixed(2)} USD
                    </p>
                </div>

                {/* TON Balance */}
                <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">TON</span>
                        <span className="text-xs px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded-full">
                            {t('wallet.gasToken')}
                        </span>
                    </div>
                    <p className="text-2xl font-semibold text-white mt-2">
                        {(balance?.ton_balance || 0).toFixed(4)}
                    </p>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={() => toast.info('Bridge Coming Soon', 'Direct GSTD/XAUt bridge will be available in Phase 2.')}
                        className="py-2.5 px-4 rounded-xl bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/20 transition-all font-medium text-sm flex items-center justify-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Bridge / Swap
                    </button>
                    <button
                        onClick={() => window.open('https://tonviewer.com/' + address, '_blank')}
                        className="py-2.5 px-4 rounded-xl bg-gray-700/30 text-gray-300 hover:bg-gray-700/50 border border-gray-600/30 transition-all font-medium text-sm flex items-center justify-center gap-2"
                    >
                        <ExternalLink className="w-4 h-4" />
                        Explorer
                    </button>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-800/30 rounded-xl p-4">
                        <div className="flex items-center space-x-2 mb-2">
                            <TrendingUp className="w-4 h-4 text-green-400" />
                            <span className="text-sm text-gray-400">{t('wallet.totalEarned')}</span>
                        </div>
                        <p className="text-xl font-semibold text-green-400">
                            +{(balance?.total_earned || 0).toFixed(4)}
                        </p>
                    </div>

                    <div className="bg-gray-800/30 rounded-xl p-4">
                        <div className="flex items-center space-x-2 mb-2">
                            <Clock className="w-4 h-4 text-yellow-400" />
                            <span className="text-sm text-gray-400">{t('wallet.pending')}</span>
                        </div>
                        <p className="text-xl font-semibold text-yellow-400">
                            {(balance?.pending_earnings || 0).toFixed(4)}
                        </p>
                    </div>
                </div>

                {/* Locked in Escrow */}
                {(balance?.locked_in_escrow || 0) > 0 && (
                    <div className="bg-orange-500/10 rounded-xl p-4 border border-orange-500/30">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-orange-300">{t('wallet.lockedEscrow')}</span>
                            <span className="text-lg font-semibold text-orange-400">
                                {(balance?.locked_in_escrow || 0).toFixed(4)} GSTD
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export const TransactionHistory: React.FC = () => {
    const { t } = useTranslation('common');
    const { address } = useWalletStore();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const fetchTransactions = useCallback(async () => {
        if (!address) return;

        try {
            const params = filter !== 'all' ? `&type=${filter}` : '';
            const data = await apiGet<{ transactions: Transaction[] }>(
                `/marketplace/my-transactions?wallet=${address}&limit=50${params}`
            );
            setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
        } catch (error) {
            console.error('Failed to fetch transactions:', error);
            setTransactions([]);
        } finally {
            setLoading(false);
        }
    }, [address, filter]);

    useEffect(() => {
        fetchTransactions();
    }, [fetchTransactions]);

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(text);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'worker_payout':
                return <ArrowDownRight className="w-4 h-4 text-green-400" />;
            case 'escrow_lock':
                return <ArrowUpRight className="w-4 h-4 text-orange-400" />;
            case 'refund':
                return <ArrowDownRight className="w-4 h-4 text-blue-400" />;
            default:
                return <DollarSign className="w-4 h-4 text-gray-400" />;
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'worker_payout': return 'text-green-400';
            case 'escrow_lock': return 'text-orange-400';
            case 'refund': return 'text-blue-400';
            default: return 'text-gray-400';
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="bg-gray-900/50 rounded-2xl p-6 flex items-center justify-center min-h-[300px]">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            </div>
        );
    }

    return (
        <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-700/50">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">{t('wallet.transactionHistory')}</h3>

                {/* Filter */}
                <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="all">{t('wallet.allTransactions')}</option>
                    <option value="worker_payout">{t('wallet.payouts')}</option>
                    <option value="escrow_lock">{t('wallet.escrowLocks')}</option>
                    <option value="refund">{t('wallet.refunds')}</option>
                </select>
            </div>

            {transactions.length === 0 ? (
                <div className="text-center py-12">
                    <DollarSign className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-400">{t('wallet.noTransactions')}</p>
                </div>
            ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {transactions.map((tx) => (
                        <div
                            key={tx.tx_id}
                            className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl hover:bg-gray-800 transition-colors"
                        >
                            <div className="flex items-center space-x-4">
                                <div className="w-10 h-10 bg-gray-700/50 rounded-xl flex items-center justify-center">
                                    {getTypeIcon(tx.tx_type)}
                                </div>
                                <div>
                                    <p className="text-white font-medium capitalize">
                                        {tx.tx_type.replace(/_/g, ' ')}
                                    </p>
                                    <div className="flex items-center space-x-2 mt-1">
                                        <span className="text-xs text-gray-500">
                                            {formatDate(tx.created_at)}
                                        </span>
                                        {tx.task_id && (
                                            <>
                                                <span className="text-gray-600">•</span>
                                                <span className="text-xs text-gray-500">
                                                    Task: {tx.task_id.slice(0, 8)}...
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center space-x-4">
                                <div className="text-right">
                                    <p className={`font-semibold ${getTypeColor(tx.tx_type)}`}>
                                        {tx.tx_type === 'escrow_lock' ? '-' : '+'}
                                        {tx.amount_gstd.toFixed(4)} GSTD
                                    </p>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${tx.status === 'confirmed'
                                        ? 'bg-green-500/20 text-green-400'
                                        : 'bg-yellow-500/20 text-yellow-400'
                                        }`}>
                                        {tx.status}
                                    </span>
                                </div>

                                <button
                                    onClick={() => copyToClipboard(tx.tx_id)}
                                    className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 transition-colors"
                                    title="Copy Transaction ID"
                                >
                                    {copiedId === tx.tx_id ? (
                                        <Check className="w-4 h-4 text-green-400" />
                                    ) : (
                                        <Copy className="w-4 h-4 text-gray-400" />
                                    )}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Export Button */}
            {transactions.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                    <button className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-colors flex items-center justify-center space-x-2">
                        <ExternalLink className="w-4 h-4" />
                        <span>{t('wallet.exportCSV')}</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export const WorkerEarnings: React.FC = () => {
    const { t } = useTranslation('common');
    const { address } = useWalletStore();
    const [earnings, setEarnings] = useState<{
        today: number;
        week: number;
        month: number;
        allTime: number;
        tasksCompleted: number;
    } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchEarnings = async () => {
            if (!address) return;

            try {
                const data = await apiGet<typeof earnings>(
                    `/marketplace/worker/stats?wallet=${address}`
                );
                setEarnings(data);
            } catch (error) {
                console.error('Failed to fetch earnings:', error);
                // Set default values
                setEarnings({
                    today: 0,
                    week: 0,
                    month: 0,
                    allTime: 0,
                    tasksCompleted: 0
                });
            } finally {
                setLoading(false);
            }
        };

        fetchEarnings();
    }, [address]);

    if (loading) {
        return (
            <div className="bg-gray-900/50 rounded-2xl p-6 flex items-center justify-center min-h-[200px]">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-br from-green-900/20 to-emerald-900/20 rounded-2xl p-6 border border-green-500/30">
            <div className="flex items-center space-x-3 mb-6">
                <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-400" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-white">{t('worker.earnings')}</h3>
                    <p className="text-sm text-gray-400">{t('worker.earningsSubtitle')}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-900/50 rounded-xl p-4">
                    <p className="text-sm text-gray-400">{t('worker.today')}</p>
                    <p className="text-2xl font-bold text-green-400 mt-1">
                        +{(earnings?.today || 0).toFixed(4)}
                    </p>
                    <p className="text-xs text-gray-500">GSTD</p>
                </div>

                <div className="bg-gray-900/50 rounded-xl p-4">
                    <p className="text-sm text-gray-400">{t('worker.thisWeek')}</p>
                    <p className="text-2xl font-bold text-green-400 mt-1">
                        +{(earnings?.week || 0).toFixed(4)}
                    </p>
                    <p className="text-xs text-gray-500">GSTD</p>
                </div>

                <div className="bg-gray-900/50 rounded-xl p-4">
                    <p className="text-sm text-gray-400">{t('worker.thisMonth')}</p>
                    <p className="text-2xl font-bold text-green-400 mt-1">
                        +{(earnings?.month || 0).toFixed(4)}
                    </p>
                    <p className="text-xs text-gray-500">GSTD</p>
                </div>

                <div className="bg-gray-900/50 rounded-xl p-4">
                    <p className="text-sm text-gray-400">{t('worker.allTime')}</p>
                    <p className="text-2xl font-bold text-white mt-1">
                        {(earnings?.allTime || 0).toFixed(4)}
                    </p>
                    <p className="text-xs text-gray-500">GSTD</p>
                </div>
            </div>

            <div className="mt-4 p-4 bg-gray-900/50 rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <CheckCircle className="w-5 h-5 text-blue-400" />
                    <span className="text-gray-400">{t('worker.tasksCompleted')}</span>
                </div>
                <span className="text-xl font-bold text-white">
                    {earnings?.tasksCompleted || 0}
                </span>
            </div>
        </div>
    );
};

export default WalletBalanceWidget;
