/**
 * Multi-chain wallet connection hook for Bridge.
 * TON    → TonConnect (has its own QR/deeplink — always works)
 * Solana → @solana/connector (Wallet Standard — Phantom, Solflare, Backpack, etc.)
 * XRPL   → Xaman (Xumm) SDK via CDN (QR code / deeplink)
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { useWalletStore } from '../store/walletStore';
import { Address } from '@ton/core';

// @solana/connector — Solana Foundation official wallet connector
let connectorClientInstance: any | null = null;

function getConnectorClient() {
  if (connectorClientInstance) return Promise.resolve(connectorClientInstance);
  return import('@solana/connector/headless').then(mod => {
    const config = mod.getDefaultConfig({ appName: 'GSTD Bridge' });
    connectorClientInstance = new mod.ConnectorClient(config);
    return connectorClientInstance;
  }).catch(err => {
    console.warn('[Bridge] ConnectorKit load failed, falling back:', err);
    return null;
  });
}

export type ChainId = 'TON' | 'Solana' | 'XRPL';

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

/** Check if Solana wallet extension is available (Wallet Standard or legacy) */
function hasSolanaExtension(): boolean {
  if (typeof window === 'undefined') return false;
  // Wallet Standard wallets register via navigator.wallets
  const hasWalletStandard = !!(window as any).navigator?.wallets?.get?.()?.length;
  const hasLegacy = !!(
    (window as any).phantom?.solana ||
    (window as any).solana ||
    (window as any).solflare ||
    (window as any).backpack
  );
  return hasWalletStandard || hasLegacy;
}

/** Check if XRPL wallet extension is available (GemWallet/Crossmark) */
function hasXrplExtension(): boolean {
  if (typeof window === 'undefined') return false;
  return !!((window as any).GemWalletApi || (window as any).crossmark);
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
      const X = (window as any).Xumm;
      if (X) resolve(X); else reject(new Error('Xumm not loaded'));
    };
    script.onerror = () => reject(new Error('Failed to load Xumm CDN'));
    document.head.appendChild(script);
  });
}

export function useMultiChainWallet() {
  const [tonConnectUI] = useTonConnectUI();
  const tonWallet = useTonWallet();
  const { isConnected: tonStoreConnected, address: tonStoreAddress } = useWalletStore();

  const [solana, setSolana] = useState<ChainWalletState>({ address: '', connected: false, walletName: '', extensionAvailable: false });
  const [xrpl, setXrpl] = useState<ChainWalletState>({ address: '', connected: false, walletName: '', extensionAvailable: false });
  const [solConnectors, setSolConnectors] = useState<any[]>([]);
  const connectorClientRef = useRef<any>(null);
  const [xummReady, setXummReady] = useState(false);
  const xummRef = useRef<any>(null);

  // Detect extensions on mount + initialize ConnectorKit
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Initialize Solana ConnectorKit (Wallet Standard)
    const initConnectorKit = async () => {
      try {
        const client = await getConnectorClient();
        if (client) {
          connectorClientRef.current = client;
          // Get available connectors from snapshot
          const snap = client.getSnapshot();
          const available = snap.connectors || [];
          setSolConnectors(available);
          setSolana(prev => ({ ...prev, extensionAvailable: available.length > 0 || hasSolanaExtension() }));

          // Subscribe to state changes (returns unsubscribe fn)
          client.subscribe((newState: any) => {
            const connectors = newState.connectors || [];
            setSolConnectors(connectors);
            if (newState.connected && newState.selectedAccount) {
              const walletName = newState.wallet?.name || newState.selectedWallet || 'Solana Wallet';
              setSolana({
                address: newState.selectedAccount,
                connected: true,
                walletName,
                extensionAvailable: true,
              });
            } else if (!newState.connected) {
              setSolana(prev => ({ ...prev, address: '', connected: false, walletName: '' }));
            }
          });

          // Check if already connected from snapshot
          if (snap.connected && snap.selectedAccount) {
            setSolana({
              address: snap.selectedAccount,
              connected: true,
              walletName: snap.wallet?.name || 'Solana Wallet',
              extensionAvailable: true,
            });
          }
        } else {
          // Fallback: legacy detection
          const available = hasSolanaExtension();
          setSolana(prev => ({ ...prev, extensionAvailable: available }));
          const provider = (window as any).phantom?.solana || (window as any).solana;
          if (provider?.isConnected && provider.publicKey) {
            setSolana({
              address: provider.publicKey.toBase58(),
              connected: true,
              walletName: provider.isPhantom ? 'Phantom' : 'Solana Wallet',
              extensionAvailable: true,
            });
          }
        }
      } catch (err) {
        console.warn('[Bridge] ConnectorKit init failed:', err);
        setSolana(prev => ({ ...prev, extensionAvailable: hasSolanaExtension() }));
      }
    };

    // Wait a bit for wallet extensions to register
    setTimeout(initConnectorKit, 500);

    // XRPL extension detection
    setXrpl(prev => ({ ...prev, extensionAvailable: hasXrplExtension() }));

    // Pre-load Xumm SDK (it always works via QR code)
    loadXummFromCDN()
      .then(() => setXummReady(true))
      .catch(() => setXummReady(false));
  }, []);

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
    useWalletStore.getState().disconnect();
  }, [tonConnectUI]);

  // ─── Solana (via ConnectorKit — Wallet Standard) ──
  const connectSolana = useCallback(async () => {
    const client = connectorClientRef.current;

    // Method 1: ConnectorKit (preferred — Wallet Standard)
    if (client && solConnectors.length > 0) {
      try {
        // Use the first ready connector or first available
        const readyConnector = solConnectors.find((c: any) => c.ready) || solConnectors[0];
        if (readyConnector) {
          const connectorId = readyConnector.id || readyConnector.name;
          await client.connectWallet(connectorId);
          // Read state from snapshot after connection
          const snap = client.getSnapshot();
          if (snap.connected && snap.selectedAccount) {
            setSolana({
              address: snap.selectedAccount,
              connected: true,
              walletName: snap.wallet?.name || readyConnector.name || 'Solana Wallet',
              extensionAvailable: true,
            });
            return;
          }
        }
      } catch (err) {
        console.warn('[Bridge] ConnectorKit connect failed, trying legacy:', err);
      }
    }

    // Method 2: Legacy fallback (direct window.phantom/solana)
    const phantom = (window as any).phantom?.solana || (window as any).solana;
    const solflare = (window as any).solflare;
    const provider = phantom || solflare;

    if (!provider) {
      console.warn('[Bridge] No Solana wallet found');
      alert('Solana wallet not found! Please install Phantom, Solflare, or Backpack browser extension.');
      return;
    }

    try {
      const resp = await provider.connect();
      const name = solflare && !phantom ? 'Solflare' : (provider.isPhantom ? 'Phantom' : 'Solana Wallet');
      setSolana({
        address: resp.publicKey.toBase58(),
        connected: true,
        walletName: name,
        extensionAvailable: true,
      });
    } catch (err) {
      console.warn('[Bridge] Solana connect rejected:', err);
    }
  }, [solConnectors]);

  const disconnectSolana = useCallback(async () => {
    // Try ConnectorKit first
    const client = connectorClientRef.current;
    if (client) {
      const snap = client.getSnapshot();
      if (snap.connected) {
        try { await client.disconnectWallet(); } catch {}
      }
    }
    // Legacy fallback
    try {
      const provider = (window as any).phantom?.solana || (window as any).solana;
      if (provider?.disconnect) await provider.disconnect();
    } catch (err) { console.warn('[Bridge] Solana disconnect:', err); }
    setSolana(prev => ({ ...prev, address: '', connected: false, walletName: '' }));
  }, []);

  // ─── XRPL (Xaman QR code — works without extension) ──
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

      // Opens QR code overlay on desktop, deeplink on mobile
      await xumm.authorize();

      const account = await xumm.user.account;
      if (account) {
        setXrpl({ address: account, connected: true, walletName: 'Xaman', extensionAvailable: true });
      }
    } catch (err) {
      console.warn('[Bridge] Xumm authorize error:', err);
      // Don't redirect — show manual input
    }
  }, [xummReady]);

  const disconnectXrpl = useCallback(async () => {
    if (xummRef.current) {
      try { await xummRef.current.logout(); }
      catch (err) { console.warn('[Bridge] Xumm logout:', err); }
    }
    setXrpl(prev => ({ ...prev, address: '', connected: false, walletName: '' }));
  }, []);

  // ─── Unified API ──────────────────────────────────
  const getChainWallet = useCallback((chain: ChainId): ChainWalletState => {
    switch (chain) {
      case 'TON': return { address: tonFriendly, connected: tonConnected, walletName: 'TON Connect', extensionAvailable: true }; // TonConnect always has QR
      case 'Solana': return solana;
      case 'XRPL': return { ...xrpl, extensionAvailable: xrpl.extensionAvailable || xummReady }; // Xumm QR always works
    }
  }, [tonFriendly, tonConnected, solana, xrpl, xummReady]);

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
      case 'Solana': {
        // Dynamic list from ConnectorKit (Wallet Standard)
        if (solConnectors.length > 0) {
          return solConnectors.map((c: any) => c.name);
        }
        return ['Phantom', 'Solflare', 'Backpack'];
      }
      case 'XRPL': return ['Xaman (Xumm)'];
    }
  }, [solConnectors]);

  return { getChainWallet, connectChain, disconnectChain, getAvailableWallets, tonFriendly };
}
