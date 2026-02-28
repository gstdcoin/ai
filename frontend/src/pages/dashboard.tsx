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

        // Method 3: Timeout fallback — if nothing hydrates in 1.5s, proceed
        const timer = setTimeout(() => {
            setHydrated(true);
        }, 1500);

        // If there's saved data in localStorage, give extra time for TonConnect
        let storageTimer: ReturnType<typeof setTimeout> | null = null;
        const stored = localStorage.getItem('gstd-wallet-storage');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                const savedState = parsed?.state;
                if (savedState?.isConnected && savedState?.address) {
                    // Store has data — it will hydrate shortly
                    // Give zustand time to finish persist rehydration
                    storageTimer = setTimeout(() => setHydrated(true), 800);
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

    // Redirect away if not connected after hydration
    useEffect(() => {
        if (!hydrated) return;

        // Give TonConnect's `restoreConnection` time to reconnect the wallet
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
        }, 500);

        return () => clearTimeout(redirectTimer);
    }, [hydrated, isConnected, router]);

    // Loading state — waiting for hydration
    if (!hydrated || !isConnected) {
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
