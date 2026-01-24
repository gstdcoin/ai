import { useEffect, useRef, useCallback } from 'react';
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
    const proofRequested = useRef<boolean>(false);

    // Request tonProof on mount
    useEffect(() => {
        if (!tonConnectUI || proofRequested.current) return;

        // Generate payload for tonProof - using colon separator for backend compatibility
        // Backend expects format: nonce:timestamp
        const payload = `gstd_auth:${Math.floor(Date.now() / 1000)}`;

        tonConnectUI.setConnectRequestParameters({
            state: 'ready',
            value: {
                tonProof: payload
            }
        });

        proofRequested.current = true;
        logger.info('TonProof request parameters set', { payload });
    }, [tonConnectUI]);

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

                // Check for connectItems (proof)
                let signature = '';
                let payload = '';

                if (wallet.connectItems?.tonProof && 'proof' in wallet.connectItems.tonProof) {
                    const proofItem = wallet.connectItems.tonProof;
                    signature = proofItem.proof.signature;
                    payload = proofItem.proof.payload;
                    logger.info('TonProof found', { hasSignature: !!signature, payloadLength: payload.length });
                }

                // If no proof, try simple login without signature verification
                // This allows connection but with limited functionality
                if (!signature) {
                    logger.warn('No tonProof found. Attempting simple login.');

                    // Try simple login - backend should handle this
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

                            // Fetch balance
                            try {
                                const balanceData = await apiGet<any>('/users/balance');
                                useWalletStore.getState().updateBalance(
                                    (balanceData.ton || 0).toString(),
                                    balanceData.gstd || 0
                                );
                            } catch (e) { /* silent */ }
                        }
                    } catch (e: any) {
                        logger.error('Simple login failed', e);
                        // Still keep UI connected
                        lastLoggedInAddress.current = rawAddress;
                    }

                    isLoggingIn.current = false;
                    return;
                }

                // 3. Backend Login with full proof
                const connect_payload = {
                    wallet_address: walletAddress,
                    public_key: publicKey,
                    payload: payload,
                    signature: {
                        signature: signature,
                        type: 'ton_proof'
                    }
                };

                const requestBody = { connect_payload };

                const userData = await apiPost('/users/login', requestBody);

                // 4. Update User Store
                if (userData.user) {
                    setUser(userData.user);
                    if (userData.session_token) {
                        localStorage.setItem('session_token', userData.session_token);
                    }
                }

                localStorage.setItem('user', JSON.stringify(userData.user || userData));
                lastLoggedInAddress.current = rawAddress;

                // 5. Fetch Real Balance
                try {
                    const balanceData = await apiGet<any>('/users/balance');
                    useWalletStore.getState().updateBalance(
                        (balanceData.ton || 0).toString(),
                        balanceData.gstd || 0
                    );
                } catch (e) {
                    logger.error('Failed to fetch balance', e);
                }

                toast.success('Wallet connected successfully');

            } catch (err: any) {
                logger.error('Login failed', err);
                toast.error('Login failed', err.message);
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
                const balanceData = await apiGet<any>('/users/balance');
                useWalletStore.getState().updateBalance(
                    (balanceData.ton || 0).toString(),
                    balanceData.gstd || 0
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


