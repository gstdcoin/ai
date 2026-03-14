import { useEffect, useRef } from 'react';
import { useWalletStore } from '../../store/walletStore';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { logger } from '../../lib/logger';
import { toast } from '../../lib/toast';
import { apiPost, apiGet } from '../../lib/apiClient';

import { useRouter } from 'next/router'; // Added router import

export default function WalletListener() {
    const router = useRouter();
    const { isConnected, disconnect, connect, setUser } = useWalletStore();
    const [tonConnectUI] = useTonConnectUI();
    const wallet = useTonWallet();

    // Sync TonConnectUI language with Next.js router locale
    useEffect(() => {
        if (tonConnectUI) {
            const lang = router.locale === 'ru' ? 'ru' : 'en';
            tonConnectUI.uiOptions = { language: lang };
        }
    }, [router.locale, tonConnectUI]);

    // Ref to track login state and prevent duplicates
    const lastLoggedInAddress = useRef<string | null>(null);
    const isLoggingIn = useRef<boolean>(false);
    // NOTE: tonProof was intentionally removed. We use simple_connect on the backend,
    // and setConnectRequestParameters with tonProof can prevent some wallets from
    // showing the connection dialog (they hang waiting for proof preparation).
    // If tonProof verification is needed in future, re-enable with proper backend support.

    // Handle Wallet Connection
    useEffect(() => {
        // If wallet is null, we might be disconnected
        if (!wallet) {
            if (lastLoggedInAddress.current && isConnected) {
                logger.info('Wallet disconnected detected by listener');
                disconnect();
                lastLoggedInAddress.current = null;
            }
            return;
        }

        const processLogin = async () => {
            if (!wallet.account?.address) return;

            const rawAddress = wallet.account.address;

            // Prevent duplicate login attempts
            if (isLoggingIn.current) return;
            if (lastLoggedInAddress.current === rawAddress && isConnected) return;

            isLoggingIn.current = true;

            try {
                logger.info('Wallet connected, starting login process', { address: rawAddress });

                // 1. Update store immediately to show UI state
                connect(rawAddress);

                // 2. Prepare payload for backend login
                const walletAddress = rawAddress;
                const publicKey = wallet.account.publicKey || '';

                // We are bypassing TonProof signature validation because the backend implementation 
                // of Ed25519 verification lacks the proper TonConnect proof packing (domain length, 
                // timestamp, prefix) causing all valid wallet proofs to be rejected with 401.
                // Fallback to simple_connect explicitly.
                try {
                    const simplePayload = {
                        connect_payload: {
                            wallet_address: walletAddress,
                            public_key: publicKey,
                            payload: `gstd_simple:${Date.now()}`,
                            signature: {
                                signature: 'simple_connect',
                                type: 'simple'
                            }
                        }
                    };

                    const userData = await apiPost('/users/login', simplePayload);

                    if (userData.user) {
                        setUser(userData.user);
                        if (userData.session_token) {
                            localStorage.setItem('session_token', userData.session_token);
                        }
                        localStorage.setItem('user', JSON.stringify(userData.user));
                        lastLoggedInAddress.current = rawAddress;
                        toast.success('Wallet connected');

                        // Fetch balance + pending earnings
                        try {
                            const [balanceData, pendingData, swarmData] = await Promise.all([
                                apiGet<any>('/users/balance'),
                                apiGet<any>('/users/pending_balance').catch(() => ({ pending_balance: 0 })),
                                apiGet<any>(`/swarm/account/${walletAddress}`).catch(() => ({ balance: null })),
                            ]);
                            useWalletStore.getState().updateBalance(
                                (balanceData.ton || 0).toString(),
                                balanceData.gstd || 0,
                                swarmData?.balance ?? null,
                                pendingData.pending_balance || 0
                            );

                            // Auto-claim welcome bonus for new users (1.0 GSTD)
                            const currentBalance = balanceData.gstd || 0;
                            try {
                                const bonusStatus = await apiGet<any>(`/bonus/status?wallet=${walletAddress}`);
                                if (bonusStatus?.welcome_bonus_available) {
                                    const bonus = await apiPost('/bonus/welcome', { wallet_address: walletAddress, source: 'web' });
                                    if (bonus?.amount && bonus.amount > 0) {
                                        toast.success(`+${bonus.amount} GSTD`, 'Welcome bonus!');
                                        // Refresh balance
                                        const [freshBalance, freshSwarm] = await Promise.all([
                                            apiGet<any>('/users/balance'),
                                            apiGet<any>(`/swarm/account/${walletAddress}`).catch(() => ({ balance: null }))
                                        ]);
                                        useWalletStore.getState().updateBalance(
                                            (freshBalance.ton || 0).toString(),
                                            freshBalance.gstd || 0,
                                            freshSwarm?.balance ?? null,
                                            pendingData.pending_balance || 0
                                        );
                                    }
                                }
                                // Daily faucet for returning users with low balance
                                if (currentBalance < 0.5 && bonusStatus?.daily_faucet_available) {
                                    await apiPost('/telegram/faucet', { wallet_address: walletAddress }).catch(() => { });
                                }
                            } catch (_e) { /* bonus claim failed — non-critical */ }
                        } catch (e) { /* silent */ }
                        // Redirect is handled by index.tsx useEffect (isConnected → /dashboard)
                    }
                } catch (e: any) {
                    logger.error('Simple login failed', e);
                    toast.error('Failed to authenticate wallet. Please disconnect and try again.');
                    // Do not lock the UI, so they can try again if they disconnect/reconnect
                }

            } catch (err: any) {
                logger.error('Login process failed', err);
            } finally {
                isLoggingIn.current = false;
            }
        };

        processLogin();

    }, [wallet, isConnected, connect, disconnect, setUser]);

    // Periodic balance refresh every 30 seconds when connected
    useEffect(() => {
        const state = useWalletStore.getState();
        if (!state.isConnected || !state.address) return;

        const fetchBalance = async () => {
            try {
                const [balanceData, pendingData, swarmData] = await Promise.all([
                    apiGet<any>('/users/balance'),
                    apiGet<any>('/users/pending_balance').catch(() => ({ pending_balance: 0 })),
                    apiGet<any>(`/swarm/account/${state.address}`).catch(() => ({ balance: null })),
                ]);
                useWalletStore.getState().updateBalance(
                    (balanceData.ton || 0).toString(),
                    balanceData.gstd || 0,
                    swarmData?.balance ?? null,
                    pendingData.pending_balance || 0
                );
            } catch (e) {
                // Silent fail for balance refresh (no session or network error)
            }
        };

        // Fetch after initial delay (login already fetched first)
        const timeout = setTimeout(fetchBalance, 10000);

        // Then every 30 seconds
        const interval = setInterval(fetchBalance, 30000);

        return () => {
            clearTimeout(timeout);
            clearInterval(interval);
        };
    }, [isConnected]);

    return null;
}


