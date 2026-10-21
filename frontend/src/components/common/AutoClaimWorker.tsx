'use client';

import { useEffect, useRef } from 'react';
import { useWalletStore } from '../../store/walletStore';
import { toast } from 'sonner';
import { apiGet, apiPost } from '../../lib/apiClient';

const CHECK_INTERVAL_MS = 60_000; // Check every 60 seconds

export default function AutoClaimWorker() {
  const { isConnected, address, updateBalance, gstdBalance, tonBalance, swarmBalance } = useWalletStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isConnected || !address) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const checkAndClaim = async () => {
      try {
        if (!localStorage.getItem('session_token')) return;

        // 1. Check pending rewards
        const data = await apiGet<{ wallet: string; pending_gstd: number }>('/nodes/pending-rewards');
        if (data.wallet.toLowerCase() !== address.toLowerCase()) return;
        const pending = Number(data.pending_gstd);

        if (Number.isFinite(pending) && pending >= 0.001) {
          // 2. Claim rewards
          const claimData = await apiPost<{
            ok: boolean;
            claimed_gstd: number;
          }>('/nodes/claim-rewards');
          if (!claimData.ok) return;
          const claimedAmount = Number(claimData.claimed_gstd);
          if (!Number.isFinite(claimedAmount) || claimedAmount <= 0) {
            console.error('AutoClaim returned an invalid claimed amount');
            return;
          }

          toast(`📱 Auto-Claimed: +${claimedAmount.toFixed(4)} GSTD`, {
            description: 'Node rewards were moved to spendable platform credits; this is not an on-chain payout.',
            style: {
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              color: '#34d399',
              backdropFilter: 'blur(10px)',
            },
          });

          updateBalance(
            tonBalance || '0',
            (gstdBalance || 0) + claimedAmount,
            swarmBalance,
            Math.max(0, pending - claimedAmount)
          );
        }
      } catch (e) {
        // Silent failure in background
        console.error('AutoClaim worker error:', e);
      }
    };

    // Initial check on load
    checkAndClaim();

    // Setup interval
    intervalRef.current = setInterval(checkAndClaim, CHECK_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isConnected, address, gstdBalance, tonBalance, swarmBalance, updateBalance]);

  return null;
}
