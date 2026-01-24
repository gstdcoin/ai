import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { X, Copy, CheckCircle, Users, Share2 } from 'lucide-react';
import { apiGet } from '../../lib/apiClient';
import { toast } from '../../lib/toast';
import { useWalletStore } from '../../store/walletStore';

interface ReferralModalProps {
    onClose: () => void;
}

interface ReferralStats {
    referral_code: string;
    total_referrals: number;
    total_earned: number;
    referral_link: string;
}

export default function ReferralModal({ onClose }: ReferralModalProps) {
    const { t } = useTranslation('common');
    const { address } = useWalletStore();
    const [stats, setStats] = useState<ReferralStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (address) {
            loadReferralStats();
        }
    }, [address]);

    const loadReferralStats = async () => {
        try {
            // In a real implementation this would fetch from /api/v1/user/referrals
            // For now we'll simulate or try to fetch if endpoint exists
            try {
                // Try to fetch real stats if endpoint available
                const data = await apiGet<ReferralStats>('/user/referrals');
                setStats(data);
            } catch (err) {
                // Fallback mock if endpoint not ready yet
                setStats({
                    referral_code: address ? address.slice(0, 8) : '--------',
                    total_referrals: 0,
                    total_earned: 0,
                    referral_link: `https://gstd.io/ref/${address ? address.slice(0, 8) : ''}`
                });
            }
        } catch (error) {
            console.error('Failed to load referral stats', error);
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied!', 'Referral link copied to clipboard');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/5">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-purple-400" />
                        {t('your_network') || 'Your Network'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">

                    <div className="text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-500/10 mb-4">
                            <Share2 className="w-8 h-8 text-purple-400" />
                        </div>
                        <h3 className="text-lg font-medium text-white mb-1">Invite Friends & Earn</h3>
                        <p className="text-sm text-gray-400">
                            Get 5% of all GSTD earned by your referrals forever.
                        </p>
                    </div>

                    {!loading && stats ? (
                        <>
                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white/5 rounded-xl p-4 border border-white/5 text-center">
                                    <div className="text-2xl font-bold text-white mb-1">{stats.total_referrals}</div>
                                    <div className="text-xs text-gray-500 uppercase tracking-wider">Referrals</div>
                                </div>
                                <div className="bg-white/5 rounded-xl p-4 border border-white/5 text-center">
                                    <div className="text-2xl font-bold text-gold-400 mb-1">{stats.total_earned.toFixed(2)}</div>
                                    <div className="text-xs text-gray-500 uppercase tracking-wider">GSTD Earned</div>
                                </div>
                            </div>

                            {/* Referral Link */}
                            <div className="space-y-2">
                                <label className="text-xs text-gray-400 uppercase tracking-wider">Your Referral Link</label>
                                <div className="flex gap-2">
                                    <div className="flex-1 bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-sm text-gray-300 font-mono truncate">
                                        {stats.referral_link}
                                    </div>
                                    <button
                                        onClick={() => copyToClipboard(stats.referral_link)}
                                        className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Copy size={18} />
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="py-8 text-center text-gray-500">
                            Loading referral data...
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
