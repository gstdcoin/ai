import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import { apiGet, apiPost } from '../../lib/apiClient';
import {
    Users, Link as LinkIcon, Gift, TrendingUp,
    ChevronRight, Copy, Share2, Award, Zap
} from 'lucide-react';
import { toast } from '../../lib/toast';

interface ReferralStats {
    total_referrals: number;
    level1_count: number;
    level2_count: number;
    level3_count: number;
    total_rewards_gstd: number;
    unclaimed_rewards_gstd: number;
    referral_code: string;
}

export default function ReferralPanel() {
    const { t } = useTranslation('common');
    const { address, isConnected } = useWalletStore();
    const [stats, setStats] = useState<ReferralStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [claiming, setClaiming] = useState(false);

    const fetchStats = useCallback(async () => {
        if (!isConnected) return;
        setLoading(true);
        try {
            const response = await apiGet<ReferralStats>('/referrals/ml/stats');
            setStats(response);
        } catch (error) {
            console.error('Failed to fetch referral stats:', error);
        } finally {
            setLoading(false);
        }
    }, [isConnected]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    const handleCopyCode = () => {
        if (!stats?.referral_code) return;
        const link = `${window.location.origin}?ref=${stats.referral_code}`;
        navigator.clipboard.writeText(link);
        toast.success('Link Copied!', 'Share it with your network.');
    };

    const handleClaim = async () => {
        if (!stats?.unclaimed_rewards_gstd || stats.unclaimed_rewards_gstd <= 0) return;
        setClaiming(true);
        try {
            await apiPost('/referrals/ml/claim', {});
            toast.success('Rewards Claimed!', 'Your referral bonus has been added to your balance.');
            fetchStats();
        } catch (error: any) {
            toast.error('Claim Failed', error.message || 'Failed to claim rewards.');
        } finally {
            setClaiming(false);
        }
    };

    if (!isConnected) {
        return (
            <div className="flex flex-col items-center justify-center p-12 glass-card text-center">
                <Users className="w-16 h-16 text-gray-600 mb-4" />
                <h3 className="text-xl font-black text-white mb-2">{t('build_your_ai_network', 'Build Your AI Network')}</h3>
                <p className="text-gray-400 max-w-md mb-6">Connect your wallet to generate your unique referral link and start earning from the compute grid expansion.</p>
                <div className="px-6 py-2 rounded-full bg-violet-600/20 border border-violet-500/30 text-[10px] font-black text-violet-400 uppercase tracking-widest">
                    3-Level Rewards Active
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header / Main Link */}
            <div className="relative glass-card p-8 bg-gradient-to-br from-violet-600/10 to-transparent border-violet-500/20">
                <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 rounded-full blur-[80px] -mr-32 -mt-32" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h2 className="text-3xl font-black text-white mb-2 tracking-tight">{t('expand_the_grid', 'Expand the Grid')}</h2>
                        <p className="text-gray-400 text-sm">Earn passive income from every task executed by your network.</p>
                    </div>

                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 p-1 bg-white/5 border border-white/10 rounded-2xl">
                            <div className="px-4 py-2 font-mono text-sm text-violet-400 font-bold">
                                {stats?.referral_code || 'LINK-GEN-REQ'}
                            </div>
                            <button
                                onClick={handleCopyCode}
                                className="p-3 bg-white text-black rounded-xl hover:bg-violet-400 hover:text-white transition-all transform active:scale-95"
                            >
                                <Copy size={16} />
                            </button>
                        </div>
                        <p className="text-[10px] font-black text-gray-600 uppercase tracking-wider text-center">{t('your_unique_multilevel_link', 'Your unique multi-level link')}</p>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatBox
                    label="Total Network"
                    value={stats?.total_referrals || 0}
                    icon={Users}
                    color="violet"
                    suffix="Nodes"
                />
                <StatBox
                    label="Total Earned"
                    value={(stats?.total_rewards_gstd || 0).toFixed(2)}
                    icon={TrendingUp}
                    color="emerald"
                    suffix="GSTD"
                />
                <div className="glass-card p-6 border-cyan-500/30 bg-gradient-to-br from-cyan-500/5 to-transparent relative overflow-hidden group">
                    <div className="relative z-10 flex flex-col h-full justify-between">
                        <div>
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">{t('ready_to_claim', 'Ready to Claim')}</h3>
                                <Gift className="w-5 h-5 text-cyan-400" />
                            </div>
                            <div className="text-3xl font-black text-white mb-1">
                                {(stats?.unclaimed_rewards_gstd || 0).toFixed(2)}
                                <span className="text-sm font-bold text-gray-600 ml-2">GSTD</span>
                            </div>
                        </div>
                        <button
                            onClick={handleClaim}
                            disabled={claiming || !stats?.unclaimed_rewards_gstd || stats.unclaimed_rewards_gstd <= 0}
                            className="w-full mt-4 py-3 bg-cyan-500 text-black rounded-xl font-bold uppercase text-[10px] tracking-[0.2em] transition-all hover:bg-white disabled:opacity-50"
                        >
                            {claiming ? 'Processing...' : 'Settle Rewards'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Tree Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <Award className="text-amber-400 w-5 h-5" />
                    <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em]">{t('multilevel_structure', 'Multi-Level Structure')}</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <LevelCard level={1} count={stats?.level1_count || 0} bonus="15%" description="Direct Referrals" />
                    <LevelCard level={2} count={stats?.level2_count || 0} bonus="7%" description="Second Tier" />
                    <LevelCard level={3} count={stats?.level3_count || 0} bonus="3%" description="Legacy Growth" />
                </div>
            </div>

            {/* Info Section */}
            <div className="glass-card p-6 bg-white/[0.02] border-white/5">
                <div className="flex gap-4">
                    <div className="p-3 rounded-2xl bg-violet-500/10 border border-violet-500/20 text-violet-400 h-fit">
                        <Zap className="w-6 h-6" />
                    </div>
                    <div>
                        <h4 className="text-white font-bold mb-1">{t('how_rewards_work', 'How Rewards Work')}</h4>
                        <p className="text-xs text-gray-500 leading-relaxed max-w-2xl">
                            Each time someone in your network executes a task, part of the platform fee is redistributed back to the inviters.
                            Level 1 earns you 15% of the fee, Level 2 earns 7%, and Level 3 earns 3%.
                            Expand the compute grid and grow your passive revenue.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatBox({ label, value, icon: Icon, color, suffix }: any) {
    const colors: any = {
        violet: 'text-violet-400 border-violet-500/20 bg-violet-500/5',
        emerald: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5'
    };

    return (
        <div className={`glass-card p-6 border ${colors[color]}`}>
            <div className="flex justify-between items-start mb-4">
                <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">{label}</h3>
                <Icon className="w-5 h-5 opacity-60" />
            </div>
            <div className="text-3xl font-black text-white flex items-baseline gap-2">
                {value}
                <span className="text-xs font-bold text-gray-600 uppercase tracking-tighter">{suffix}</span>
            </div>
        </div>
    );
}

function LevelCard({ level, count, bonus, description }: any) {
    return (
        <div className="glass-card p-6 border-white/5 hover:border-violet-500/20 transition-all group">
            <div className="flex justify-between items-center mb-4">
                <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs font-black text-white">
                    L{level}
                </div>
                <div className="text-[9px] font-black text-violet-400 uppercase tracking-widest">
                    +{bonus} Bonus
                </div>
            </div>
            <div className="text-2xl font-black text-white mb-1">{count}</div>
            <div className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{description}</div>
            <div className="mt-4 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                <div
                    className="h-full bg-gradient-to-r from-violet-600 to-cyan-500 transition-all duration-1000"
                    style={{ width: `${Math.min(100, (count / 10) * 100)}%` }}
                />
            </div>
        </div>
    );
}
