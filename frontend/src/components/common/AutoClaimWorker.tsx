'use client';

import { useEffect, useRef } from 'react';
import { useWalletStore } from '../../store/walletStore';
import { toast } from 'sonner';

const API_BASE = typeof window !== 'undefined'
  ? window.location.hostname.includes('localhost')
    ? 'http://localhost:8080'
    : 'https://v2.gstdtoken.com'
  : 'https://v2.gstdtoken.com';

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
        // 1. Check pending rewards
        const res = await fetch(`${API_BASE}/api/v1/nodes/pending-rewards?wallet=${address}`);
        if (!res.ok) return;
        const data = await res.json();
        const pending = data.total_pending || 0;

        // If we have any accumulated rewards (e.g. >= 0.0001), claim automatically
        if (pending > 0.0001) {
          // 2. Claim rewards
          const claimRes = await fetch(`${API_BASE}/api/v1/nodes/claim-rewards`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet_address: address }),
          });

          if (claimRes.ok) {
            const claimData = await claimRes.json();
            const claimedAmount = claimData.claimed || pending;
            
            // 3. Beautiful mobile-friendly toast animation
            toast(`📱 Auto-Claimed: +${claimedAmount.toFixed(4)} GSTD`, {
              description: 'Mobile Node background reward processed successfully.',
              style: {
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                color: '#34d399',
                backdropFilter: 'blur(10px)',
              },
            });

            // Refresh balances
            updateBalance(
              tonBalance || '0',
              (gstdBalance || 0) + claimedAmount,
              swarmBalance,
              0 // Pending is now claimed
            );
          }
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
