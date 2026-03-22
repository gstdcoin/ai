/**
 * Multi-chain wallet connection hook for Bridge.
 *
 * Uses official SDKs from:
 * - TON:      @tonconnect/ui-react (TonConnect)
 * - Solana:   @solana/wallet-adapter-react (Solana Wallet Adapter / Mobile Wallet Adapter)
 *             https://github.com/solana-mobile/mobile-wallet-adapter
 * - Ethereum: @metamask/sdk-react (MetaMask Official SDK)
 *             https://github.com/MetaMask/metamask-sdk
 *             Also supports Trust Wallet via EIP-6963
 *             https://github.com/trustwallet
 * - XRPL:    Xaman (Xumm) SDK from XRPL-Labs
 *             https://github.com/XRPL-Labs
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { useWalletStore } from '../store/walletStore';
import { Address } from '@ton/core';

// Solana Wallet Adapter — official SDK
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

// MetaMask SDK — official SDK (used via provider hook)
import { useSDK as useMetaMaskSDK } from '@metamask/sdk-react';

export type ChainId = 'TON' | 'Solana' | 'XRPL' | 'Ethereum';

export interface ChainWalletState {
  address: string;
  connected: boolean;
  walletName: string;
  /** Whether a wallet extension/app is detected in the browser */
  extensionAvailable: boolean;
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

/** Check if XRPL wallet extension is available (GemWallet/Crossmark) */
function hasXrplExtension(): boolean {
  if (typeof window === 'undefined') return false;
  return !!((window as any).GemWalletApi || (window as any).crossmark);
}

// ─── Xumm/Xaman SDK (CDN-loaded) ──────────────────
// https://github.com/XRPL-Labs
const XAMAN_API_KEY = process.env.NEXT_PUBLIC_XAMAN_API_KEY || 'e68e4276-7e06-404d-afe6-e2fbb5a26a6b';

function loadXummFromCDN(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') { reject(new Error('SSR')); return; }
    if ((window as any).Xumm) { resolve((window as any).Xumm); return; }
    const script = document.createElement('script');
    script.src = 'https://xumm.app/assets/cdn/xumm.min.js';
    script.async = true;
    script.onload = () => {
      const X = (window as any).Xumm;
      if (X) resolve(X); else reject(new Error('Xumm not loaded'));
    };
    script.onerror = () => reject(new Error('Failed to load Xumm CDN'));
    document.head.appendChild(script);
  });
}

export function useMultiChainWallet() {
  // ═══ TON — TonConnect SDK ═══════════════════════════
  const [tonConnectUI] = useTonConnectUI();
  const tonWallet = useTonWallet();
  const { isConnected: tonStoreConnected, address: tonStoreAddress } = useWalletStore();

  // ═══ SOLANA — Official Wallet Adapter SDK ═══════════
  // https://github.com/solana-mobile/mobile-wallet-adapter
  const solanaWallet = useSolanaWallet();
  const solanaModal = useWalletModal();

  // ═══ ETHEREUM — MetaMask Official SDK ═══════════════
  // https://github.com/MetaMask/metamask-sdk
  // Also supports Trust Wallet via EIP-6963
  const metamask = useMetaMaskSDK();

  // ═══ XRPL — Xaman (Xumm) from XRPL-Labs ═══════════
  // https://github.com/XRPL-Labs
  const [xrpl, setXrpl] = useState<ChainWalletState>({ address: '', connected: false, walletName: '', extensionAvailable: false });
  const [xummReady, setXummReady] = useState(false);
  const xummRef = useRef<any>(null);

  // Detect XRPL extensions + pre-load Xumm SDK
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setXrpl(prev => ({ ...prev, extensionAvailable: hasXrplExtension() }));
    loadXummFromCDN()
      .then(() => setXummReady(true))
      .catch(() => setXummReady(false));
  }, []);

  // ─── TON Wallet State ────────────────────────────────
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
    useWalletStore.getState().disconnect();
  }, [tonConnectUI]);

  // ─── Solana Wallet State (Official Adapter) ──────────
  const connectSolana = useCallback(async () => {
    if (solanaWallet.wallet) {
      // Wallet already selected, just connect
      try { await solanaWallet.connect(); }
      catch (err) { console.warn('[Bridge] Solana connect error:', err); }
    } else {
      // Open wallet selection modal (Phantom, Solflare, Backpack, etc.)
      solanaModal.setVisible(true);
    }
  }, [solanaWallet, solanaModal]);

  const disconnectSolana = useCallback(async () => {
    try { await solanaWallet.disconnect(); }
    catch (err) { console.warn('[Bridge] Solana disconnect error:', err); }
  }, [solanaWallet]);

  // ─── Ethereum Wallet State (MetaMask SDK) ────────────
  // MetaMask SDK: also detects Trust Wallet via EIP-6963
  const connectEthereum = useCallback(async () => {
    try {
      const accounts = await metamask.sdk?.connect();
      if (!accounts || accounts.length === 0) {
        console.warn('[Bridge] MetaMask: no accounts returned');
      }
    } catch (err) {
      console.warn('[Bridge] MetaMask connect error:', err);
    }
  }, [metamask.sdk]);

  const disconnectEthereum = useCallback(async () => {
    try { await metamask.sdk?.terminate(); }
    catch (err) { console.warn('[Bridge] MetaMask disconnect error:', err); }
  }, [metamask.sdk]);

  // ─── XRPL Wallet (Xaman SDK from XRPL-Labs) ─────────
  const connectXrpl = useCallback(async () => {
    // First try browser extensions (GemWallet / Crossmark)
    if (hasXrplExtension()) {
      const gem = (window as any).GemWalletApi;
      if (gem) {
        try {
          const installed = await gem.isInstalled();
          if (installed?.result?.isInstalled) {
            const resp = await gem.getAddress();
            if (resp?.result?.address) {
              setXrpl({ address: resp.result.address, connected: true, walletName: 'GemWallet', extensionAvailable: true });
              return;
            }
          }
        } catch (err) { console.warn('[Bridge] GemWallet error:', err); }
      }
      const crossmark = (window as any).crossmark;
      if (crossmark) {
        try {
          const resp = await crossmark.signIn();
          if (resp?.response?.data?.address) {
            setXrpl({ address: resp.response.data.address, connected: true, walletName: 'Crossmark', extensionAvailable: true });
            return;
          }
        } catch (err) { console.warn('[Bridge] Crossmark error:', err); }
      }
    }

    // Xaman SDK — QR code (works for everyone, no extension needed)
    if (!xummReady) {
      try { await loadXummFromCDN(); setXummReady(true); }
      catch { console.warn('[Bridge] Cannot load Xumm SDK'); return; }
    }

    try {
      const XummClass = (window as any).Xumm;
      if (!XummClass) return;
      const xumm = new XummClass(XAMAN_API_KEY);
      xummRef.current = xumm;

      xumm.on('success', async () => {
        try {
          const account = await xumm.user.account;
          if (account) {
            setXrpl({ address: account, connected: true, walletName: 'Xaman', extensionAvailable: true });
          }
        } catch (err) { console.warn('[Bridge] Xumm success error:', err); }
      });

      xumm.on('logout', () => {
        setXrpl(prev => ({ ...prev, address: '', connected: false, walletName: '' }));
      });

      // Opens QR overlay on desktop, deeplink on mobile  
      await xumm.authorize();
      const account = await xumm.user.account;
      if (account) {
        setXrpl({ address: account, connected: true, walletName: 'Xaman', extensionAvailable: true });
      }
    } catch (err) {
      console.warn('[Bridge] Xumm authorize error:', err);
    }
  }, [xummReady]);

  const disconnectXrpl = useCallback(async () => {
    if (xummRef.current) {
      try { await xummRef.current.logout(); }
      catch (err) { console.warn('[Bridge] Xumm logout:', err); }
    }
    setXrpl(prev => ({ ...prev, address: '', connected: false, walletName: '' }));
  }, []);

  // ═══ Unified API ═══════════════════════════════════

  const getChainWallet = useCallback((chain: ChainId): ChainWalletState => {
    switch (chain) {
      case 'TON':
        return {
          address: tonFriendly,
          connected: tonConnected,
          walletName: 'TON Connect',
          extensionAvailable: true, // TonConnect always has QR
        };

      case 'Solana':
        return {
          address: solanaWallet.publicKey?.toBase58() || '',
          connected: solanaWallet.connected,
          walletName: solanaWallet.wallet?.adapter.name || 'Solana Wallet',
          extensionAvailable: solanaWallet.wallets.length > 0,
        };

      case 'Ethereum': {
        const ethAccount = metamask.account || '';
        const ethConnected = metamask.connected && !!ethAccount;
        // Detect wallet name: MetaMask, Trust Wallet, Coinbase, etc.
        let ethWalletName = 'Ethereum Wallet';
        if ((window as any)?.ethereum?.isMetaMask) ethWalletName = 'MetaMask';
        if ((window as any)?.ethereum?.isTrust) ethWalletName = 'Trust Wallet';
        if ((window as any)?.ethereum?.isCoinbaseWallet) ethWalletName = 'Coinbase Wallet';
        return {
          address: ethAccount,
          connected: ethConnected,
          walletName: ethWalletName,
          extensionAvailable: !!(window as any)?.ethereum,
        };
      }

      case 'XRPL':
        return {
          ...xrpl,
          extensionAvailable: xrpl.extensionAvailable || xummReady,
        };
    }
  }, [tonFriendly, tonConnected, solanaWallet, metamask.account, metamask.connected, xrpl, xummReady]);

  const connectChain = useCallback(async (chain: ChainId) => {
    switch (chain) {
      case 'TON': return connectTon();
      case 'Solana': return connectSolana();
      case 'XRPL': return connectXrpl();
      case 'Ethereum': return connectEthereum();
    }
  }, [connectTon, connectSolana, connectXrpl, connectEthereum]);

  const disconnectChain = useCallback(async (chain: ChainId) => {
    switch (chain) {
      case 'TON': return disconnectTon();
      case 'Solana': return disconnectSolana();
      case 'XRPL': return disconnectXrpl();
      case 'Ethereum': return disconnectEthereum();
    }
  }, [disconnectTon, disconnectSolana, disconnectXrpl, disconnectEthereum]);

  const getAvailableWallets = useCallback((chain: ChainId): string[] => {
    switch (chain) {
      case 'TON': return ['Tonkeeper', 'MyTonWallet', 'OpenMask'];
      case 'Solana': {
        // Dynamic list from official Wallet Adapter
        if (solanaWallet.wallets.length > 0) {
          return solanaWallet.wallets.map(w => w.adapter.name);
        }
        return ['Phantom', 'Solflare', 'Backpack'];
      }
      case 'XRPL': return ['Xaman (Xumm)'];
      case 'Ethereum': return ['MetaMask', 'Trust Wallet', 'Coinbase Wallet'];
    }
  }, [solanaWallet.wallets]);

  return { getChainWallet, connectChain, disconnectChain, getAvailableWallets, tonFriendly };
}
