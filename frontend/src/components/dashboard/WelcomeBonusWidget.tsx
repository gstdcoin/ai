import { useTranslation } from 'next-i18next';
import React, { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from '../../lib/apiClient';
import { Sparkles, CheckCircle, Smartphone, UserPlus, Gift } from 'lucide-react';
import { toast } from '../../lib/toast';
import { useWalletStore } from '../../store/walletStore';

interface BonusStatus {
    has_claimed_welcome: boolean;
    has_claimed_faucet_today: boolean;
    has_agent_bootstrap: boolean;
    welcome_amount: number;
    faucet_amount: number;
    bootstrap_amount: number;
}

export default function WelcomeBonusWidget() {
  const { t } = useTranslation('common');
    const { address, isConnected } = useWalletStore();
    const [status, setStatus] = useState<BonusStatus | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchStatus = useCallback(async () => {
        if (!isConnected) return;
        try {
            const response = await apiGet<BonusStatus>(`/bonus/status?wallet=${address}`);
            setStatus(response);
        } catch (error) {
            console.error('Failed to fetch bonus status:', error);
        }
    }, [address, isConnected]);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const handleClaim = async (type: 'welcome' | 'faucet' | 'bootstrap') => {
        setLoading(true);
        try {
            let endpoint = '';
            if (type === 'welcome') endpoint = '/tokens/welcome';
            else if (type === 'faucet') endpoint = '/tokens/faucet';
            else if (type === 'bootstrap') endpoint = '/tokens/agent/bootstrap';

            await apiPost(endpoint, { wallet_address: address });
            toast.success('GSTD Granted!', `You've received your ${type} bonus.`);
            fetchStatus();

            // Refresh balance in store
            // (Assuming store has a refresh mechanism or just let interval do it)
        } catch (error: any) {
            toast.error('Claim Failed', error.message || 'Already claimed or server busy.');
        } finally {
            setLoading(false);
        }
    };

    if (!isConnected || !status) return null;

    // Only show if there's something to claim
    const hasAnythingToClaim = !status.has_claimed_welcome || !status.has_claimed_faucet_today || !status.has_agent_bootstrap;
    if (!hasAnythingToClaim) return null;

    return (
        <div className="glass-card p-6 border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent animate-in zoom-in-95 duration-500">
            <div className="flex items-center gap-2 mb-6">
                <Gift className="w-5 h-5 text-amber-500" />
                <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em]">{t('growth_rewards', 'Growth Rewards')}</h3>
            </div>

            <div className="space-y-4">
                {!status.has_claimed_welcome && (
                    <BonusItem
                        title={t('welcome_bonus', 'Welcome Bonus')}
                        amount={status.welcome_amount}
                        onClaim={() => handleClaim('welcome')}
                        loading={loading}
                        icon={Sparkles}
                    />
                )}
                {!status.has_claimed_faucet_today && (
                    <BonusItem
                        title={t('daily_faucet', 'Daily Faucet')}
                        amount={status.faucet_amount}
                        onClaim={() => handleClaim('faucet')}
                        loading={loading}
                        icon={Smartphone}
                    />
                )}
                {!status.has_agent_bootstrap && (
                    <BonusItem
                        title={t('agent_bootstrap', 'Agent Bootstrap')}
                        amount={status.bootstrap_amount}
                        onClaim={() => handleClaim('bootstrap')}
                        loading={loading}
                        icon={UserPlus}
                    />
                )}
            </div>
        </div>
    );
}

function BonusItem({ title, amount, onClaim, loading, icon: Icon }: any) {
    return (
        <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10 group hover:border-amber-500/30 transition-all">
            <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
                    <Icon size={20} />
                </div>
                <div>
                    <div className="text-sm font-bold text-white tracking-tight">{title}</div>
                    <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">+{amount} GSTD</div>
                </div>
            </div>
            <button
                onClick={onClaim}
                disabled={loading}
                className="px-4 py-2 bg-white text-black rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
                {loading ? '...' : 'Claim'}
            </button>
        </div>
    );
}
