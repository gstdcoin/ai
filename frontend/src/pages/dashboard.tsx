import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Dashboard from '../components/dashboard/Dashboard';
import { useWalletStore } from '../store/walletStore';

export default function DashboardPage() {
    const router = useRouter();
    const { isConnected } = useWalletStore();
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        // Wait for localStorage hydration before checking connection
        // This prevents race conditions where wallet appears disconnected
        // even though it was previously connected
        const checkWallet = () => {
            const stored = localStorage.getItem('gstd-wallet-storage');
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    // If there's stored state, give it time to rehydrate
                    setTimeout(() => setIsChecking(false), 500);
                } catch {
                    setIsChecking(false);
                }
            } else {
                setIsChecking(false);
            }
        };
        
        // Small delay to allow initial render
        const timer = setTimeout(checkWallet, 100);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!isChecking && !isConnected) {
            const source = router.query.source as string;
            const mode = router.query.mode as string;
            const params = new URLSearchParams();
            if (source) params.set('source', source);
            if (mode) params.set('mode', mode);
            const q = params.toString() ? '?' + params.toString() : '';
            router.push('/' + q);
        }
    }, [isChecking, isConnected, router]);

    // Loading state
    if (isChecking) {
        return (
            <div className="min-h-screen bg-[#030014] flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-500 opacity-50"></div>
            </div>
        );
    }

    // Not connected - redirecting
    if (!isConnected) {
        return (
            <div className="min-h-screen bg-[#030014] flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-500 opacity-50"></div>
            </div>
        );
    }

    return (
      <Dashboard
        initialTab={(router.query.tab as string) || (router.query.mode === 'mining' || router.query.mining === '1' ? 'home' : undefined)}
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
