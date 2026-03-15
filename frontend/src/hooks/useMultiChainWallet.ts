/**
 * Multi-chain wallet connection hook for Bridge.
 * Supports: TON (via TonConnect), Solana (Phantom/Solflare), XRPL (GemWallet/Crossmark)
 */
import { useState, useCallback, useEffect } from 'react';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { useWalletStore } from '../store/walletStore';
import { Address } from '@ton/core';

// ─── Type Declarations for browser wallet extensions ───────
declare global {
  interface Window {
    phantom?: { solana?: SolanaProvider };
    solana?: SolanaProvider;
    solflare?: SolanaProvider;
    GemWalletApi?: { isInstalled: () => Promise<{ result: { isInstalled: boolean } }>; getAddress: () => Promise<{ result: { address: string } }> };
    crossmark?: { signIn: () => Promise<{ response: { data: { address: string } } }> };
    xrpl?: { isConnected: () => boolean; getAddress: () => Promise<string> };
  }
}

interface SolanaProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isConnected?: boolean;
  connect: () => Promise<{ publicKey: { toBase58: () => string } }>;
  disconnect: () => Promise<void>;
  publicKey?: { toBase58: () => string };
}

export type ChainId = 'TON' | 'Solana' | 'XRPL';

interface ChainWalletState {
  address: string;
  connected: boolean;
  walletName: string;
}

/** Convert raw TON address (0:hex) to user-friendly UQ... format */
function tonRawToFriendly(raw: string): string {
  if (!raw) return '';
  try {
    // Already friendly format
    if (raw.startsWith('EQ') || raw.startsWith('UQ')) return raw;
    const addr = Address.parseRaw(raw);
    // Non-bounceable (UQ) for user wallets
    return addr.toString({ bounceable: false });
  } catch {
    return raw;
  }
}

export function useMultiChainWallet() {
  const [tonConnectUI] = useTonConnectUI();
  const tonWallet = useTonWallet();
  const { isConnected: tonStoreConnected, address: tonStoreAddress } = useWalletStore();

  const [solana, setSolana] = useState<ChainWalletState>({ address: '', connected: false, walletName: '' });
  const [xrpl, setXrpl] = useState<ChainWalletState>({ address: '', connected: false, walletName: '' });

  // ─── TON ──────────────────────────────────────────
  const tonRaw = tonWallet?.account?.address || tonStoreAddress || '';
  const tonFriendly = tonRawToFriendly(tonRaw);
  const tonConnected = !!(tonWallet?.account?.address || (tonStoreConnected && tonStoreAddress));

  const connectTon = useCallback(async () => {
    try { await tonConnectUI.openModal(); } catch (_) { /* */ }
  }, [tonConnectUI]);

  const disconnectTon = useCallback(async () => {
    try { await tonConnectUI.disconnect(); } catch (_) { /* */ }
  }, [tonConnectUI]);

  // ─── Solana ───────────────────────────────────────
  const getSolanaProvider = useCallback((): SolanaProvider | null => {
    if (typeof window === 'undefined') return null;
    return window.phantom?.solana || window.solflare || window.solana || null;
  }, []);

  const connectSolana = useCallback(async () => {
    const provider = getSolanaProvider();
    if (!provider) {
      window.open('https://phantom.app/', '_blank');
      return;
    }
    try {
      const resp = await provider.connect();
      const addr = resp.publicKey.toBase58();
      const name = provider.isSolflare ? 'Solflare' : 'Phantom';
      setSolana({ address: addr, connected: true, walletName: name });
    } catch (_) { /* user rejected */ }
  }, [getSolanaProvider]);

  const disconnectSolana = useCallback(async () => {
    const provider = getSolanaProvider();
    try { await provider?.disconnect(); } catch (_) { /* */ }
    setSolana({ address: '', connected: false, walletName: '' });
  }, [getSolanaProvider]);

  // Check if Solana was already connected
  useEffect(() => {
    const provider = getSolanaProvider();
    if (provider?.isConnected && provider.publicKey) {
      const name = provider.isSolflare ? 'Solflare' : 'Phantom';
      setSolana({ address: provider.publicKey.toBase58(), connected: true, walletName: name });
    }
  }, [getSolanaProvider]);

  // ─── XRPL ────────────────────────────────────────
  const connectXrpl = useCallback(async () => {
    if (typeof window === 'undefined') return;

    // Try GemWallet first
    if (window.GemWalletApi) {
      try {
        const installed = await window.GemWalletApi.isInstalled();
        if (installed?.result?.isInstalled) {
          const resp = await window.GemWalletApi.getAddress();
          if (resp?.result?.address) {
            setXrpl({ address: resp.result.address, connected: true, walletName: 'GemWallet' });
            return;
          }
        }
      } catch (_) { /* */ }
    }

    // Try Crossmark
    if (window.crossmark) {
      try {
        const resp = await window.crossmark.signIn();
        if (resp?.response?.data?.address) {
          setXrpl({ address: resp.response.data.address, connected: true, walletName: 'Crossmark' });
          return;
        }
      } catch (_) { /* */ }
    }

    // No wallet found — open Xaman
    window.open('https://xaman.app/', '_blank');
  }, []);

  const disconnectXrpl = useCallback(async () => {
    setXrpl({ address: '', connected: false, walletName: '' });
  }, []);

  // ─── Unified API ──────────────────────────────────
  const getChainWallet = useCallback((chain: ChainId): ChainWalletState => {
    switch (chain) {
      case 'TON': return { address: tonFriendly, connected: tonConnected, walletName: 'TON Connect' };
      case 'Solana': return solana;
      case 'XRPL': return xrpl;
    }
  }, [tonFriendly, tonConnected, solana, xrpl]);

  const connectChain = useCallback(async (chain: ChainId) => {
    switch (chain) {
      case 'TON': return connectTon();
      case 'Solana': return connectSolana();
      case 'XRPL': return connectXrpl();
    }
  }, [connectTon, connectSolana, connectXrpl]);

  const disconnectChain = useCallback(async (chain: ChainId) => {
    switch (chain) {
      case 'TON': return disconnectTon();
      case 'Solana': return disconnectSolana();
      case 'XRPL': return disconnectXrpl();
    }
  }, [disconnectTon, disconnectSolana, disconnectXrpl]);

  const getAvailableWallets = useCallback((chain: ChainId): string[] => {
    if (typeof window === 'undefined') return [];
    switch (chain) {
      case 'TON': return ['Tonkeeper', 'MyTonWallet', 'OpenMask'];
      case 'Solana': {
        const wallets: string[] = [];
        if (window.phantom?.solana) wallets.push('Phantom');
        if (window.solflare) wallets.push('Solflare');
        return wallets.length ? wallets : ['Phantom'];
      }
      case 'XRPL': {
        const wallets: string[] = [];
        if (window.GemWalletApi) wallets.push('GemWallet');
        if (window.crossmark) wallets.push('Crossmark');
        return wallets.length ? wallets : ['Xaman'];
      }
    }
  }, []);

  return { getChainWallet, connectChain, disconnectChain, getAvailableWallets, tonFriendly };
}
