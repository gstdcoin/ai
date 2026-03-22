/**
 * TokenGateway — Unified token operations layer
 * 
 * Handles ALL token interactions securely:
 * - Balance checking (on-chain + platform)
 * - GSTD transfers via TonConnect
 * - Bonuses (welcome, daily faucet)
 * - Task rewards & escrow
 * - Internal GSTD↔TON swap for gas
 * - DEX swap links (STON.fi, DeDust)
 * - Gas estimation
 * - Stars purchase flow
 */

import { apiGet, apiPost } from './apiClient';
import { GSTD_CONTRACT_ADDRESS } from './config';

// GSTD Jetton contract on TON (from centralized config — real jetton master)
export const GSTD_CONTRACT = GSTD_CONTRACT_ADDRESS;
export const STON_FI_SWAP = `https://app.ston.fi/swap?ft=TON&tt=${GSTD_CONTRACT}`;
export const DEDUST_SWAP = `https://dedust.io/swap/TON/${GSTD_CONTRACT}`;

// Minimum TON required for gas on different operations
export const GAS_ESTIMATES = {
    jettonTransfer: 0.05,    // TON needed for GSTD send
    taskCreate: 0.1,         // TON for task creation escrow
    taskClaim: 0.05,         // TON for task claim
    swap: 0.15,              // TON for DEX swap
    deviceRegister: 0.05,    // TON for device registration
};

export interface TokenBalance {
    gstd: number;           // GSTD balance (platform + on-chain)
    gstdOnChain: number;    // GSTD on-chain (real jetton balance)
    gstdPlatform: number;   // GSTD on platform (pending/earned)
    ton: number;            // TON balance
    pending: number;        // Pending rewards
    escrow: number;         // Locked in escrow
}

export interface SwapQuote {
    fromAmount: number;
    toAmount: number;
    fromToken: 'GSTD' | 'TON';
    toToken: 'GSTD' | 'TON';
    rate: number;
    fee: number;
    gasNeeded: number;
    method: 'internal' | 'stonfi' | 'dedust';
}

export interface TransactionResult {
    success: boolean;
    txHash?: string;
    amount?: number;
    error?: string;
    refunded?: boolean;
}

class TokenGatewayService {
    private readonly baseUrl: string;

    constructor() {
        this.baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
    }

    // ─── Balance ────────────────────────────────────────────────

    async getBalance(walletAddress: string): Promise<TokenBalance> {
        try {
            const [platformRes, chainRes] = await Promise.all([
                apiGet('/api/v1/wallet/gstd-balance'),
                this.getOnChainBalance(walletAddress),
            ]);

            return {
                gstd: (platformRes?.gstd_balance || 0) + (chainRes?.gstd || 0),
                gstdOnChain: chainRes?.gstd || 0,
                gstdPlatform: platformRes?.gstd_balance || 0,
                ton: chainRes?.ton || 0,
                pending: platformRes?.pending || 0,
                escrow: platformRes?.escrow || 0,
            };
        } catch (e) {
            console.warn('TokenGateway: balance fetch failed:', e);
            return { gstd: 0, gstdOnChain: 0, gstdPlatform: 0, ton: 0, pending: 0, escrow: 0 };
        }
    }

    private async getOnChainBalance(address: string): Promise<{ gstd: number; ton: number }> {
        try {
            const res = await fetch(`https://tonapi.io/v2/accounts/${address}/jettons`);
            const data = await res.json();
            let gstd = 0;
            if (data?.balances) {
                for (const j of data.balances) {
                    if (j.jetton?.address?.includes(GSTD_CONTRACT.replace(/^EQ/, '')) ||
                        j.jetton?.symbol === 'GSTD') {
                        gstd = parseFloat(j.balance) / 1e9;
                    }
                }
            }

            const tonRes = await fetch(`https://tonapi.io/v2/accounts/${address}`);
            const tonData = await tonRes.json();
            const ton = (tonData?.balance || 0) / 1e9;

            return { gstd, ton };
        } catch (e) {
            console.warn('TokenGateway: on-chain balance failed:', e);
            return { gstd: 0, ton: 0 };
        }
    }

    // ─── Gas Check ──────────────────────────────────────────────

    async checkGas(walletAddress: string, operation: keyof typeof GAS_ESTIMATES): Promise<{
        hasEnough: boolean;
        tonBalance: number;
        tonNeeded: number;
        canAutoSwap: boolean;
    }> {
        const balance = await this.getBalance(walletAddress);
        const needed = GAS_ESTIMATES[operation];
        const hasEnough = balance.ton >= needed;

        // Can auto-swap if user has enough GSTD but not enough TON
        const canAutoSwap = !hasEnough && balance.gstdPlatform >= 1.0;

        return { hasEnough, tonBalance: balance.ton, tonNeeded: needed, canAutoSwap };
    }

    // ─── Internal Swap (GSTD → TON for gas) ─────────────────────

    async swapGSTDForTON(gstdAmount: number): Promise<TransactionResult> {
        try {
            const res = await apiPost('/api/v1/swap/gstd-for-ton', { gstd_amount: gstdAmount });
            if (res?.error) {
                return { success: false, error: res.error };
            }
            return {
                success: true,
                txHash: res?.tx_hash,
                amount: res?.ton_amount,
            };
        } catch (err: any) {
            return { success: false, error: err.message || 'Swap failed' };
        }
    }

    // ─── Bonuses ────────────────────────────────────────────────

    async claimWelcomeBonus(walletAddress: string): Promise<TransactionResult> {
        try {
            const res = await apiPost('/api/v1/bonus/welcome', { wallet_address: walletAddress });
            return {
                success: !res?.error,
                amount: res?.amount || 1.0,
                txHash: res?.tx_hash,
                error: res?.error,
            };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    async claimDailyFaucet(walletAddress: string): Promise<TransactionResult> {
        try {
            const res = await apiPost('/api/v1/telegram/faucet', { wallet_address: walletAddress });
            return {
                success: !res?.error,
                amount: res?.amount || 0.1,
                error: res?.error,
            };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    // ─── GSTD Price ─────────────────────────────────────────────

    async getPrice(): Promise<{ usd: number; tonPerGstd: number }> {
        try {
            const res = await apiGet('/api/v1/market/price');
            return {
                usd: res?.gstd_price_usd || 0.00028,
                tonPerGstd: res?.ton_per_gstd || 0.00005,
            };
        } catch (e) {
            console.warn('TokenGateway: price fetch failed:', e);
            return { usd: 0.00028, tonPerGstd: 0.00005 };
        }
    }

    // ─── Swap Quotes ────────────────────────────────────────────

    async getSwapQuote(fromToken: 'GSTD' | 'TON', amount: number): Promise<SwapQuote> {
        const price = await this.getPrice();
        const rate = fromToken === 'TON' ? 1 / price.tonPerGstd : price.tonPerGstd;
        const fee = amount * 0.003; // 0.3% platform fee
        const toAmount = (amount - fee) * rate;

        return {
            fromAmount: amount,
            toAmount,
            fromToken,
            toToken: fromToken === 'TON' ? 'GSTD' : 'TON',
            rate,
            fee,
            gasNeeded: GAS_ESTIMATES.swap,
            method: fromToken === 'GSTD' && amount < 100 ? 'internal' : 'stonfi',
        };
    }

    // ─── Build TonConnect Transaction ───────────────────────────

    buildJettonTransfer(params: {
        recipientAddress: string;
        jettonAmount: number;       // GSTD amount (will be multiplied by 1e9)
        senderJettonWallet: string; // Sender's jetton wallet address
        forwardPayload?: string;    // Optional comment
    }) {
        const { senderJettonWallet } = params;

        // NOTE: For proper TEP-74 transfers, use buildJettonTransferTx from
        // lib/jettonTransfer.ts which builds a real Cell payload.
        // This method provides a basic fallback structure.
        return {
            validUntil: Math.floor(Date.now() / 1000) + 600,
            messages: [
                {
                    address: senderJettonWallet,
                    amount: '65000000', // 0.065 TON for gas
                    // The real payload should be built using @ton/core Cell builder.
                    // Use buildJettonTransferTx() from lib/jettonTransfer.ts for
                    // proper TEP-74 jetton transfer with on-chain verification.
                },
            ],
        };
    }

    // ─── Buy Links ──────────────────────────────────────────────

    getBuyLinks() {
        return {
            stonfi: STON_FI_SWAP,
            dedust: DEDUST_SWAP,
            contract: GSTD_CONTRACT,
            botStars: 'https://t.me/GstdAppBot?start=buy',
        };
    }

    // ─── Stars Purchase (via bot) ───────────────────────────────

    async buyWithStars(amount: number): Promise<{ url: string }> {
        return {
            url: `https://t.me/GstdAppBot?start=buy_${amount}`,
        };
    }

    // ─── Prepare Operation (checks gas + offers auto-swap) ──────

    async prepareOperation(
        walletAddress: string,
        operation: keyof typeof GAS_ESTIMATES
    ): Promise<{
        ready: boolean;
        gasCheck: Awaited<ReturnType<TokenGatewayService['checkGas']>>;
        autoSwapQuote?: SwapQuote;
        message: string;
    }> {
        const gasCheck = await this.checkGas(walletAddress, operation);

        if (gasCheck.hasEnough) {
            return {
                ready: true,
                gasCheck,
                message: 'Ready to proceed',
            };
        }

        if (gasCheck.canAutoSwap) {
            const gstdNeeded = (gasCheck.tonNeeded - gasCheck.tonBalance + 0.01) / (await this.getPrice()).tonPerGstd;
            const quote = await this.getSwapQuote('GSTD', Math.ceil(gstdNeeded));
            return {
                ready: false,
                gasCheck,
                autoSwapQuote: quote,
                message: `Need ${gasCheck.tonNeeded.toFixed(3)} TON for gas. Auto-swap ${quote.fromAmount.toFixed(1)} GSTD → ${quote.toAmount.toFixed(4)} TON?`,
            };
        }

        return {
            ready: false,
            gasCheck,
            message: `Insufficient TON for gas. Need ${gasCheck.tonNeeded.toFixed(3)} TON. Buy TON or use internal swap.`,
        };
    }
}

// Singleton
export const tokenGateway = new TokenGatewayService();
export default tokenGateway;
