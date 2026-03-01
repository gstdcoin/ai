import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Dashboard from '../components/dashboard/Dashboard';
import { useWalletStore } from '../store/walletStore';

export default function DashboardPage() {
    const router = useRouter();
    const { isConnected, address } = useWalletStore();
    const [hydrated, setHydrated] = useState(false);

    // Wait for zustand store to rehydrate from localStorage
    useEffect(() => {
        // Method 1: Check if store has already rehydrated
        const state = useWalletStore.getState();
        if (state.isConnected && state.address) {
            setHydrated(true);
            return;
        }

        // Method 2: Subscribe to store changes for hydration
        const unsub = useWalletStore.subscribe((state) => {
            if (state.isConnected && state.address) {
                setHydrated(true);
            }
        });

        // Method 3: Timeout fallback — extended to 3s for slow TonConnect restore
        const timer = setTimeout(() => {
            setHydrated(true);
        }, 3000);

        // If there's saved data in localStorage, give extra time for TonConnect
        let storageTimer: ReturnType<typeof setTimeout> | null = null;
        const stored = localStorage.getItem('gstd-wallet-storage');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                const savedState = parsed?.state;
                if (savedState?.isConnected && savedState?.address) {
                    storageTimer = setTimeout(() => setHydrated(true), 1500);
                }
            } catch {
                // Invalid JSON, proceed normally
            }
        }

        return () => {
            unsub();
            clearTimeout(timer);
            if (storageTimer) clearTimeout(storageTimer);
        };
    }, []);

    // Redirect away if not connected after hydration — with longer delay for TonConnect restore
    useEffect(() => {
        if (!hydrated) return;

        // Extended delay (2s) to let TonConnect's restoreConnection finish
        const redirectTimer = setTimeout(() => {
            const currentState = useWalletStore.getState();
            if (!currentState.isConnected) {
                const source = router.query.source as string;
                const mode = router.query.mode as string;
                const params = new URLSearchParams();
                if (source) params.set('source', source);
                if (mode) params.set('mode', mode);
                const q = params.toString() ? '?' + params.toString() : '';
                router.push('/' + q);
            }
        }, 2000);

        return () => clearTimeout(redirectTimer);
    }, [hydrated, isConnected, router]);

    // Loading state — waiting for hydration
    if (!hydrated) {
        return (
            <div className="min-h-screen bg-[#030014] flex items-center justify-center">
                <div className="text-center space-y-3">
                    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-violet-500 opacity-50 mx-auto" />
                    <div className="text-xs text-gray-600 animate-pulse">Connecting to Swarm…</div>
                </div>
            </div>
        );
    }

    // If hydrated but not connected — show connect prompt (not dashboard)
    if (!isConnected && !address) {
        return (
            <div className="min-h-screen bg-[#030014] flex items-center justify-center" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
                <div className="text-center space-y-6 p-8 max-w-sm">
                    <div className="text-5xl">🔐</div>
                    <h2 className="text-xl font-bold text-white">Connect Wallet</h2>
                    <p className="text-sm text-gray-400">Connect your TON wallet to access the dashboard</p>
                    <a href="/" className="inline-block px-6 py-3 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-500 transition-colors">
                        Go to Home
                    </a>
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
