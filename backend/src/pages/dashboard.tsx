import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useTonConnectUI } from '@tonconnect/ui-react';
import Dashboard from '../components/dashboard/Dashboard';
import { useWalletStore } from '../store/walletStore';

export default function DashboardPage() {
    const router = useRouter();
    const { t } = useTranslation('common');
    const { isConnected, address } = useWalletStore();
    const [tonConnectUI] = useTonConnectUI();
    const [hydrated, setHydrated] = useState(false);

    // Wait for TonConnect to restore session
    useEffect(() => {
        const timer = setTimeout(() => {
            setHydrated(true);
        }, 2500);

        const state = useWalletStore.getState();
        if (state.isConnected && state.address) {
            setHydrated(true);
            clearTimeout(timer);
        }

        const unsub = useWalletStore.subscribe((state) => {
            if (state.isConnected && state.address) {
                setHydrated(true);
            }
        });

        const unsubTc = tonConnectUI.onStatusChange((wallet) => {
            if (wallet) {
                setHydrated(true);
                clearTimeout(timer);
            }
        });

        return () => { unsub(); unsubTc(); clearTimeout(timer); };
    }, [tonConnectUI]);

    // Loading state
    if (!hydrated) {
        return (
            <div className="min-h-screen bg-[#030014] flex items-center justify-center">
                <div className="text-center space-y-3">
                    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-violet-500 opacity-50 mx-auto" />
                    <div className="text-xs text-gray-600 animate-pulse">{t('connecting_to_swarm', 'Connecting to Swarm…')}</div>
                </div>
            </div>
        );
    }

    // Not connected — show dashboard with wallet connect prompt (NOT redirect)
    if (!isConnected && !address) {
        return (
            <div className="min-h-screen bg-[#030014]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
                <div className="flex items-center justify-center min-h-screen">
                    <div className="text-center space-y-6 p-8 max-w-md" style={{
                        background: 'rgba(139, 92, 246, 0.05)',
                        border: '1px solid rgba(139, 92, 246, 0.15)',
                        borderRadius: 16,
                        backdropFilter: 'blur(20px)',
                    }}>
                        <div className="text-5xl">🔐</div>
                        <h2 className="text-xl font-bold text-white">{t('connect_wallet', 'Connect Wallet')}</h2>
                        <p className="text-sm text-gray-400">{t('connect_wallet_dashboard', 'Connect your TON wallet to access the full dashboard with balances, nodes, and AI chat.')}</p>
                        <div className="flex gap-3 justify-center flex-wrap">
                            <button
                                onClick={() => tonConnectUI.openModal()}
                                className="px-6 py-3 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-500 transition-colors"
                            >
                                🔗 {t('connect_wallet', 'Connect Wallet')}
                            </button>
                            <a href="/chat" className="px-6 py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors" style={{ textDecoration: 'none' }}>
                                💬 {t('open_chat', 'Open Chat')}
                            </a>
                        </div>
                        <p className="text-xs text-gray-600">{t('dashboard_free_chat', 'AI Chat is free — connect wallet for Pro/Ultra tiers')}</p>
                    </div>
                </div>
            </div>
        );
    }

    // Show dashboard for authorized users
    return (
        <Dashboard
            initialTab={(router.query.tab as string) || (router.query.mode === 'mining' || router.query.mining === '1' ? 'home' : 'home')}
            initialMode={(router.query.mode as 'standard' | 'ultra') || undefined}
            sourceTelegram={router.query.source === 'telegram'}
            modeMining={router.query.mode === 'mining' || router.query.mining === '1'}
        />
    );
}


export const getStaticProps: GetStaticProps = async ({ locale }) => {
    return {
        props: {
            ...(await serverSideTranslations(locale ?? 'en', ['common'])),
        },
    };
};
