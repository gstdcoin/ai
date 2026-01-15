import React, { useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Copy, Users, DollarSign, Gift } from 'lucide-react';
import { apiGet, apiPost } from '../../lib/apiClient';
import { toast } from '../../lib/toast';

interface ReferralStats {
    referral_code: string;
    total_referrals: number;
    total_earnings: number;
}

export default function ReferralPanel() {
    const { t } = useTranslation('common');
    const [stats, setStats] = useState<ReferralStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [inviteCode, setInviteCode] = useState('');

    const fetchStats = async () => {
        try {
            const data = await apiGet<ReferralStats>('/referrals/stats');
            setStats(data);
        } catch (error) {
            console.error('Failed to fetch referral stats:', error);
            // Don't show error toast on initial load to avoid annoyance if feature not used
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    const handleCopyCode = () => {
        if (stats?.referral_code) {
            const url = `${window.location.origin}?ref=${stats.referral_code}`;
            navigator.clipboard.writeText(url);
            toast.success(t('link_copied') || 'Referral link copied!');
        }
    };

    const handleApplyCode = async () => {
        if (!inviteCode.trim()) return;
        try {
            await apiPost('/referrals/apply', { code: inviteCode });
            toast.success(t('referral_applied') || 'Referral code applied successfully!');
            setInviteCode('');
        } catch (error: any) {
            toast.error(t('error') || 'Error', error.response?.data?.error || 'Failed to apply code');
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-400">{t('loading') || 'Loading...'}</div>;
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-2">{t('referral_program') || 'Referral Program'}</h2>
                    <p className="text-gray-400">
                        {t('referral_desc') || 'Invite friends and earn 5% of platform fees from their tasks.'}
                    </p>
                </div>
            </div>

            {/* Main Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-card p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Gift size={64} className="text-gold-500" />
                    </div>
                    <h3 className="text-sm font-medium text-gray-400 mb-2">{t('your_referral_code') || 'Your Referral Code'}</h3>
                    <div className="flex items-center gap-3">
                        <code className="text-2xl font-bold text-gold-400 font-mono tracking-wider">
                            {stats?.referral_code || '---'}
                        </code>
                        <button
                            onClick={handleCopyCode}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
                            title={t('copy_link') || 'Copy Link'}
                        >
                            <Copy size={20} />
                        </button>
                    </div>
                </div>

                <div className="glass-card p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-blue-500/20 text-blue-400">
                            <Users size={24} />
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-gray-400">{t('total_referrals') || 'Total Referrals'}</h3>
                            <p className="text-2xl font-bold text-white">{stats?.total_referrals || 0}</p>
                        </div>
                    </div>
                </div>

                <div className="glass-card p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-green-500/20 text-green-400">
                            <DollarSign size={24} />
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-gray-400">{t('total_earnings') || 'Total Earnings'}</h3>
                            <p className="text-2xl font-bold text-white">{stats?.total_earnings?.toFixed(2) || '0.00'} GSTD</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Apply Code Section */}
            <div className="glass-card p-6 max-w-xl">
                <h3 className="text-lg font-bold text-white mb-4">{t('have_invite_code') || 'Have an invite code?'}</h3>
                <div className="flex gap-4">
                    <input
                        type="text"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                        placeholder="ENTER CODE"
                        className="flex-1 bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-gold-500/50"
                        maxLength={10}
                    />
                    <button
                        onClick={handleApplyCode}
                        disabled={!inviteCode}
                        className="glass-button-gold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {t('apply') || 'Apply'}
                    </button>
                </div>
            </div>
        </div>
    );
}
