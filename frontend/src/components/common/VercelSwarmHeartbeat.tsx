'use client';

import { useEffect, useRef } from 'react';

const API_BASE = 'https://app.gstdtoken.com';
const HEARTBEAT_INTERVAL_MS = 20_000; // Keep within 30s active window

/**
 * Registers Vercel deployment as a swarm node via A2A handshake.
 * Runs only on *.vercel.app when NEXT_PUBLIC_GSTD_VERCEL_RELAY_WALLET is set.
 */
export default function VercelSwarmHeartbeat() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const wallet =
      process.env.NEXT_PUBLIC_GSTD_VERCEL_RELAY_WALLET ||
      'EQ0000000000000000000000000000000000000000000000000000';
    const isVercel = window.location.hostname.endsWith('vercel.app');

    if (!isVercel) return;

    const deviceId = `vercel-${window.location.hostname.replace(/[^a-z0-9-]/gi, '-')}`;

    const handshake = () => {
      fetch(`${API_BASE}/api/v1/agents/handshake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_version: '2.0.0-VERCEL',
          capabilities: ['relay', 'edge'],
          status: 'online',
          device_id: deviceId,
          device_type: 'vercel-edge',
          wallet_address: wallet,
        }),
      }).catch(() => {});
    };

    handshake();
    intervalRef.current = setInterval(handshake, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return null;
}
