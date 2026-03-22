/**
 * useTokenOps — React hook for token operations with TonConnect
 * 
 * Provides unified interface for all token interactions:
 * - Check gas before any operation
 * - Auto-swap GSTD→TON if needed for gas
 * - Execute token transfers with TonConnect signature
 * - Show real-time balance
 */

import { useState, useCallback, useEffect } from 'react';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { useWalletStore } from '../store/walletStore';
import { tokenGateway, GAS_ESTIMATES, type TokenBalance, type TransactionResult } from '../lib/tokenGateway';

export function useTokenOps() {
    const [tonConnectUI] = useTonConnectUI();
    const { address, isConnected } = useWalletStore();
    const [balance, setBalance] = useState<TokenBalance | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Refresh balance
    const refreshBalance = useCallback(async () => {
        if (!address) return;
        try {
            const bal = await tokenGateway.getBalance(address);
            setBalance(bal);
        } catch (err: any) {
            console.error('Balance fetch error:', err);
        }
    }, [address]);

    // Auto-refresh on connect
    useEffect(() => {
        if (isConnected && address) {
            refreshBalance();
            const interval = setInterval(refreshBalance, 30000); // every 30s
            return () => clearInterval(interval);
        }
    }, [isConnected, address, refreshBalance]);

    // Check if user has enough gas for operation
    const checkGas = useCallback(async (operation: keyof typeof GAS_ESTIMATES) => {
        if (!address) return { ready: false, message: 'Wallet not connected' };
        return tokenGateway.prepareOperation(address, operation);
    }, [address]);

    // Auto-swap GSTD → TON for gas
    const autoSwapForGas = useCallback(async (gstdAmount: number): Promise<TransactionResult> => {
        setLoading(true);
        setError(null);
        try {
            const result = await tokenGateway.swapGSTDForTON(gstdAmount);
            if (result.success) {
                await refreshBalance();
            } else {
                setError(result.error || 'Swap failed');
            }
            return result;
        } catch (err: any) {
            const errMsg = err.message || 'Swap failed';
            setError(errMsg);
            return { success: false, error: errMsg };
        } finally {
            setLoading(false);
        }
    }, [refreshBalance]);

    // Execute operation with gas check
    const executeWithGasCheck = useCallback(async (
        operation: keyof typeof GAS_ESTIMATES,
        action: () => Promise<TransactionResult>
    ): Promise<TransactionResult> => {
        if (!address) return { success: false, error: 'Wallet not connected' };

        setLoading(true);
        setError(null);

        try {
            // 1. Check gas
            const prep = await tokenGateway.prepareOperation(address, operation);

            if (!prep.ready && prep.autoSwapQuote) {
                // 2. Auto-swap GSTD → TON for gas
                const swapResult = await tokenGateway.swapGSTDForTON(prep.autoSwapQuote.fromAmount);
                if (!swapResult.success) {
                    setError('Failed to get gas: ' + swapResult.error);
                    return { success: false, error: 'Gas swap failed' };
                }
                // Wait a moment for chain confirmation
                await new Promise(r => setTimeout(r, 3000));
            } else if (!prep.ready) {
                setError(prep.message);
                return { success: false, error: prep.message };
            }

            // 3. Execute the actual operation
            const result = await action();

            if (result.success) {
                // 4. Refresh balance
                setTimeout(() => refreshBalance(), 5000);
            } else {
                setError(result.error || 'Operation failed');
            }

            return result;
        } catch (err: any) {
            const errMsg = err.message || 'Operation failed';
            setError(errMsg);
            return { success: false, error: errMsg };
        } finally {
            setLoading(false);
        }
    }, [address, refreshBalance]);

    // Send GSTD to address (via TonConnect — real TEP-74 jetton transfer)
    const sendGSTD = useCallback(async (
        recipientAddress: string,
        amount: number
    ): Promise<TransactionResult> => {
        return executeWithGasCheck('jettonTransfer', async () => {
            try {
                // Use real TEP-74 jetton transfer builder
                const { buildJettonTransferTx } = await import('../lib/jettonTransfer');
                const tx = await buildJettonTransferTx({
                    recipientAddress,
                    amount,
                    senderAddress: address || '',
                });

                const result = await tonConnectUI.sendTransaction(tx);
                return { success: true, txHash: result.boc };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });
    }, [tonConnectUI, address, executeWithGasCheck]);

    // Claim welcome bonus
    const claimBonus = useCallback(async (): Promise<TransactionResult> => {
        if (!address) return { success: false, error: 'No wallet' };
        setLoading(true);
        try {
            const result = await tokenGateway.claimWelcomeBonus(address);
            if (result.success) await refreshBalance();
            return result;
        } finally {
            setLoading(false);
        }
    }, [address, refreshBalance]);

    // Claim daily faucet
    const claimFaucet = useCallback(async (): Promise<TransactionResult> => {
        if (!address) return { success: false, error: 'No wallet' };
        setLoading(true);
        try {
            const result = await tokenGateway.claimDailyFaucet(address);
            if (result.success) await refreshBalance();
            return result;
        } finally {
            setLoading(false);
        }
    }, [address, refreshBalance]);

    // Get buy links
    const buyLinks = tokenGateway.getBuyLinks();

    return {
        // State
        balance,
        loading,
        error,
        isConnected,
        address,

        // Actions
        refreshBalance,
        checkGas,
        autoSwapForGas,
        sendGSTD,
        claimBonus,
        claimFaucet,
        executeWithGasCheck,

        // Constants
        buyLinks,
        gasEstimates: GAS_ESTIMATES,
    };
}
