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
    const proofPayload = useRef<string | null>(null);

    useEffect(() => {
        if (wallet) return;

        let active = true;
        tonConnectUI.setConnectRequestParameters({ state: 'loading' });
        apiPost('/users/challenge', {})
            .then((challenge) => {
                if (!active) return;
                if (typeof challenge.payload !== 'string') {
                    throw new Error('Wallet challenge response is missing its payload');
                }
                proofPayload.current = challenge.payload;
                tonConnectUI.setConnectRequestParameters({
                    state: 'ready',
                    value: { tonProof: challenge.payload },
                });
            })
            .catch((error) => {
                if (!active) return;
                logger.error('Could not prepare wallet authentication challenge', error);
                tonConnectUI.setConnectRequestParameters(null);
                toast.error('Secure wallet login is unavailable. Please try again later.');
            });

        return () => {
            active = false;
        };
    }, [tonConnectUI, wallet]);

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

                const walletAddress = rawAddress;
                try {
                    let userData: any = null;
                    const existingSession = localStorage.getItem('session_token');
                    if (existingSession) {
                        const sessionData = await apiGet<any>('/users/balance');
                        if (typeof sessionData.wallet === 'string'
                            && sessionData.wallet.toLowerCase() === walletAddress.toLowerCase()) {
                            const storedUser = localStorage.getItem('user');
                            let cachedUser: any = null;
                            if (storedUser) {
                                try {
                                    cachedUser = JSON.parse(storedUser);
                                } catch {
                                    cachedUser = null;
                                }
                            }
                            userData = {
                                user: cachedUser?.wallet_address?.toLowerCase() === walletAddress.toLowerCase()
                                    ? cachedUser
                                    : { wallet_address: walletAddress, address: walletAddress },
                                session_token: existingSession,
                            };
                        } else {
                            localStorage.removeItem('session_token');
                            localStorage.removeItem('user');
                        }
                    }

                    if (!userData) {
                        const tonProofReply = wallet.connectItems?.tonProof;
                        if (!tonProofReply || tonProofReply.name !== 'ton_proof' || !proofPayload.current) {
                            toast.error('Wallet ownership proof is required. Reconnect your wallet to continue.');
                            disconnect();
                            await tonConnectUI.disconnect();
                            return;
                        }

                        userData = await apiPost('/users/login', {
                            connect_payload: {
                                wallet_address: walletAddress,
                                public_key: wallet.account.publicKey || '',
                                wallet_state_init: wallet.account.walletStateInit,
                                ton_proof: tonProofReply,
                            },
                        });
                    }

                    if (userData.user) {
                        connect(rawAddress);
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
                    logger.error('TonConnect login failed', e);
                    toast.error('Failed to authenticate wallet. Please disconnect and try again.');
                    disconnect();
                    await tonConnectUI.disconnect();
                }

            } catch (err: any) {
                logger.error('Login process failed', err);
            } finally {
                isLoggingIn.current = false;
            }
        };

        processLogin();

    }, [wallet, isConnected, connect, disconnect, setUser, tonConnectUI]);

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

