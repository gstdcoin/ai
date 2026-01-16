import { useEffect, useRef } from 'react';
import { useWalletStore } from '../../store/walletStore';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { logger } from '../../lib/logger';
import { toast } from '../../lib/toast';
import { apiPost, apiGet } from '../../lib/apiClient';

export default function WalletListener() {
    const { isConnected, disconnect, connect, setUser } = useWalletStore();
    const [tonConnectUI] = useTonConnectUI();
    const wallet = useTonWallet();

    // Ref to track login state and prevent duplicates
    const lastLoggedInAddress = useRef<string | null>(null);
    const isLoggingIn = useRef<boolean>(false);

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
            if (lastLoggedInAddress.current === rawAddress && isConnected) return; // Already logged in

            isLoggingIn.current = true;

            try {
                logger.info('Wallet connected, starting login process', { address: rawAddress });

                // 1. Update store immediately to show UI state
                // Normalize address if needed or leave raw
                connect(rawAddress);

                // 2. Prepare payload for backend login
                const walletAddress = rawAddress;
                const publicKey = wallet.account.publicKey;

                // Check for connectItems (proof)
                let signature = '';
                let payload = '';
                let proofItem: any = null;

                if (wallet.connectItems?.tonProof && 'proof' in wallet.connectItems.tonProof) {
                    proofItem = wallet.connectItems.tonProof;
                    signature = proofItem.proof.signature;
                    payload = proofItem.proof.payload;
                }

                // If no proof, we might skip backend login or generic login?
                // User requested "connect and execute", so backend session is needed.
                // If no proof, we can try to restore session or just update UI.
                if (!signature) {
                    logger.warn('No tonProof found. Skipping backend login, UI only.');
                    lastLoggedInAddress.current = rawAddress;
                    // Get balance anyway if possible
                    try {
                        // We can't use /users/balance without session token from login... 
                        // But maybe previous session exists?
                        const hasSession = localStorage.getItem('session_token');
                        if (hasSession) {
                            const balanceData = await apiGet('/users/balance');
                            useWalletStore.getState().updateBalance(
                                (balanceData.ton || "0").toString(),
                                balanceData.gstd || 0
                            );
                        }
                    } catch (e) { /* silent */ }
                    isLoggingIn.current = false;
                    return;
                }

                // 3. Backend Login
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
                    const balanceData = await apiGet('/users/balance');
                    useWalletStore.getState().updateBalance(
                        (balanceData.ton || "0").toString(),
                        balanceData.gstd || 0
                    );
                } catch (e) {
                    logger.error('Failed to fetch balance', e);
                }

                toast.success('Wallet connected successfully');

            } catch (err: any) {
                logger.error('Login failed', err);
                toast.error('Login failed', err.message);
                // Don't disconnect immediately, let user retry
            } finally {
                isLoggingIn.current = false;
            }
        };

        processLogin();

    }, [wallet, isConnected, connect, disconnect, setUser]);

    return null;
}
