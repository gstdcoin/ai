/**
 * Multi-chain wallet connection hook for Bridge.
 * TON    → TonConnect (existing infrastructure)
 * Solana → @phantom/browser-sdk + injected provider fallback
 * XRPL   → Xaman (Xumm) SDK loaded from CDN
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { useWalletStore } from '../store/walletStore';
import { Address } from '@ton/core';

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
    if (raw.startsWith('EQ') || raw.startsWith('UQ')) return raw;
    const addr = Address.parseRaw(raw);
    return addr.toString({ bounceable: false });
  } catch {
    return raw;
  }
}

// ─── Phantom SDK (lazy load) ───────────────────────
let phantomSdk: any = null;

async function getPhantomSDK() {
  if (typeof window === 'undefined') return null;
  if (phantomSdk) return phantomSdk;
  try {
    const mod = await import('@phantom/browser-sdk');
    phantomSdk = new mod.BrowserSDK({
      providers: ['injected'],
      addressTypes: [mod.AddressType.solana],
    });
    return phantomSdk;
  } catch (err) {
    console.warn('[Bridge] Phantom SDK not available, using injected fallback:', err);
    return null;
  }
}

// ─── Xumm/Xaman SDK (CDN-loaded) ──────────────────
const XAMAN_API_KEY = process.env.NEXT_PUBLIC_XAMAN_API_KEY || 'e68e4276-7e06-404d-afe6-e2fbb5a26a6b';

function loadXummFromCDN(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') { reject(new Error('SSR')); return; }
    if ((window as any).Xumm) { resolve((window as any).Xumm); return; }

    const script = document.createElement('script');
    script.src = 'https://xumm.app/assets/cdn/xumm.min.js';
    script.async = true;
    script.onload = () => {
      const XummClass = (window as any).Xumm;
      if (XummClass) resolve(XummClass);
      else reject(new Error('Xumm not found after script load'));
    };
    script.onerror = () => reject(new Error('Failed to load Xumm CDN'));
    document.head.appendChild(script);
  });
}

export function useMultiChainWallet() {
  const [tonConnectUI] = useTonConnectUI();
  const tonWallet = useTonWallet();
  const { isConnected: tonStoreConnected, address: tonStoreAddress } = useWalletStore();

  const [solana, setSolana] = useState<ChainWalletState>({ address: '', connected: false, walletName: '' });
  const [xrpl, setXrpl] = useState<ChainWalletState>({ address: '', connected: false, walletName: '' });
  const xummRef = useRef<any>(null);

  // ─── TON ──────────────────────────────────────────
  const tonRaw = tonWallet?.account?.address || tonStoreAddress || '';
  const tonFriendly = tonRawToFriendly(tonRaw);
  const tonConnected = !!(tonWallet?.account?.address || (tonStoreConnected && tonStoreAddress));

  const connectTon = useCallback(async () => {
    try { await tonConnectUI.openModal(); }
    catch (err) { console.warn('[Bridge] TON Connect error:', err); }
  }, [tonConnectUI]);

  const disconnectTon = useCallback(async () => {
    try { await tonConnectUI.disconnect(); }
    catch (err) { console.warn('[Bridge] TON disconnect error:', err); }
  }, [tonConnectUI]);

  // ─── Solana (Phantom SDK + injected fallback) ─────
  const connectSolana = useCallback(async () => {
    // Try Phantom Browser SDK first
    const sdk = await getPhantomSDK();
    if (sdk) {
      try {
        const { addresses } = await sdk.connect({ provider: 'injected' });
        if (addresses?.length > 0) {
          const solAddr = addresses.find((a: any) => a.type === 'solana') || addresses[0];
          setSolana({ address: solAddr.address, connected: true, walletName: 'Phantom' });
          return;
        }
      } catch (err) {
        console.warn('[Bridge] Phantom SDK connect failed, trying injected:', err);
      }
    }

    // Fallback: direct injected provider (window.phantom.solana / window.solflare)
    if (typeof window !== 'undefined') {
      const phantom = (window as any).phantom?.solana || (window as any).solana;
      const solflare = (window as any).solflare;
      const provider = phantom || solflare;

      if (provider) {
        try {
          const resp = await provider.connect();
          const name = solflare && !phantom ? 'Solflare' : 'Phantom';
          setSolana({ address: resp.publicKey.toBase58(), connected: true, walletName: name });
          return;
        } catch (err) {
          console.warn('[Bridge] Injected Solana connect error:', err);
        }
      }
    }

    // No wallet available — redirect to Phantom download
    window.open('https://phantom.app/', '_blank');
  }, []);

  const disconnectSolana = useCallback(async () => {
    try {
      const provider = (window as any).phantom?.solana || (window as any).solana;
      if (provider?.disconnect) await provider.disconnect();
    } catch (err) { console.warn('[Bridge] Solana disconnect:', err); }
    setSolana({ address: '', connected: false, walletName: '' });
  }, []);

  // Auto-detect existing Solana connection
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const provider = (window as any).phantom?.solana || (window as any).solana;
    if (provider?.isConnected && provider.publicKey) {
      setSolana({
        address: provider.publicKey.toBase58(),
        connected: true,
        walletName: provider.isPhantom ? 'Phantom' : 'Solana Wallet',
      });
    }
  }, []);

  // ─── XRPL (Xaman/Xumm SDK via CDN) ───────────────
  const connectXrpl = useCallback(async () => {
    try {
      const XummClass = await loadXummFromCDN();
      const xumm = new XummClass(XAMAN_API_KEY);
      xummRef.current = xumm;

      // Set up event listeners before authorize
      xumm.on('success', async () => {
        try {
          const account = await xumm.user.account;
          if (account) {
            setXrpl({ address: account, connected: true, walletName: 'Xaman' });
          }
        } catch (err) { console.warn('[Bridge] Xumm success callback error:', err); }
      });

      xumm.on('logout', () => {
        setXrpl({ address: '', connected: false, walletName: '' });
      });

      // This opens QR code modal / deeplink on mobile
      await xumm.authorize();

      // Check if we got an account after authorize returns
      try {
        const account = await xumm.user.account;
        if (account) {
          setXrpl({ address: account, connected: true, walletName: 'Xaman' });
        }
      } catch (err) { console.warn('[Bridge] Xumm post-authorize check:', err); }

    } catch (err) {
      console.warn('[Bridge] Xumm connect error:', err);
      // Fallback — open Xaman website
      window.open('https://xaman.app/', '_blank');
    }
  }, []);

  const disconnectXrpl = useCallback(async () => {
    if (xummRef.current) {
      try { await xummRef.current.logout(); }
      catch (err) { console.warn('[Bridge] Xumm logout:', err); }
    }
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
    switch (chain) {
      case 'TON': return ['Tonkeeper', 'MyTonWallet', 'OpenMask'];
      case 'Solana': return ['Phantom', 'Solflare'];
      case 'XRPL': return ['Xaman (Xumm)'];
    }
  }, []);

  return { getChainWallet, connectChain, disconnectChain, getAvailableWallets, tonFriendly };
}
