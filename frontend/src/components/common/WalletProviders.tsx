/**
 * Multi-chain wallet providers using official SDKs:
 *
 * 1. @metamask/sdk-react — MetaMask Official SDK
 *    https://github.com/MetaMask/metamask-sdk
 *    Supports: MetaMask, Trust Wallet (EIP-6963), Coinbase Wallet
 *
 * 2. @solana/wallet-adapter-react — Solana Wallet Adapter
 *    https://github.com/solana-mobile/mobile-wallet-adapter
 *    Supports: Phantom, Solflare, Backpack, Ledger, etc.
 *
 * 3. @tonconnect/ui-react — TonConnect (already in _app.tsx)
 *    Supports: Tonkeeper, MyTonWallet, OpenMask
 *
 * 4. xumm SDK — Xaman (XRPL Labs)
 *    https://github.com/XRPL-Labs
 *    Supports: Xaman (Xumm), GemWallet, Crossmark
 */
import React, { useMemo, type ReactNode } from 'react';
import { MetaMaskProvider } from '@metamask/sdk-react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { clusterApiUrl } from '@solana/web3.js';

// Import Solana wallet adapter default styles
import '@solana/wallet-adapter-react-ui/styles.css';

interface WalletProvidersProps {
  children: ReactNode;
}

export default function WalletProviders({ children }: WalletProvidersProps) {
  // ─── Solana Wallet Adapter ───────────────────────────
  // Using Solana mainnet for production
  const solanaEndpoint = useMemo(() => clusterApiUrl('mainnet-beta'), []);

  // Dedicated single-wallet adapter packages (not the @solana/wallet-adapter-wallets
  // bundle — that pulls in every adapter including an unused, vulnerable
  // Particle Network chain via uuidv4)
  // These use the Solana Mobile Wallet Adapter protocol for mobile
  const solanaWallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], []);

  return (
    <MetaMaskProvider
      debug={false}
      sdkOptions={{
        dappMetadata: {
          name: 'GSTD Bridge',
          url: typeof window !== 'undefined' ? window.location.origin : 'https://platform.gstdtoken.com',
          iconUrl: 'https://platform.gstdtoken.com/favicon.ico',
        },
        // Enable EIP-6963 for Trust Wallet, Coinbase, and other injected wallets
        useDeeplink: false,
        // Preferred communication method
        communicationLayerPreference: undefined,
      }}
    >
      <ConnectionProvider endpoint={solanaEndpoint}>
        <WalletProvider wallets={solanaWallets} autoConnect={false}>
          <WalletModalProvider>
            {children}
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </MetaMaskProvider>
  );
}
