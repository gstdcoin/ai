import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../store/walletStore';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { useEffect, useState, useRef } from 'react';

export default function WalletConnect() {
  const { t } = useTranslation('common');
  const { isConnected, disconnect, connect, setUser } = useWalletStore();
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const [error, setError] = useState<string | null>(null);
  const lastLoggedInAddress = useRef<string | null>(null);

  // Function to call login API
  const loginUser = async (walletAddress: string) => {
    // Avoid duplicate calls for the same address
    if (lastLoggedInAddress.current === walletAddress) {
      console.log('⏭️ Skipping duplicate login for:', walletAddress);
      return;
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
      const response = await fetch(`${apiUrl}/api/v1/users/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
        }),
      });

      if (!response.ok) {
        throw new Error(`Login failed: ${response.statusText}`);
      }

      const userData = await response.json();
      console.log('✅ User logged in:', userData);
      setUser(userData);
      lastLoggedInAddress.current = walletAddress;
      
      // Store in localStorage as well
      localStorage.setItem('user', JSON.stringify(userData));
    } catch (err: any) {
      console.error('❌ Error logging in user:', err);
      setError(err?.message || 'Failed to login user');
    }
  };

  // Use useTonWallet hook to detect wallet changes (primary hook as requested)
  useEffect(() => {
    if (wallet?.account?.address) {
      console.log('🔔 useTonWallet detected wallet:', wallet.account.address);
      connect(wallet.account.address);
      loginUser(wallet.account.address);
      setError(null);
    } else if (wallet === null) {
      // Wallet disconnected
      console.log('🔔 useTonWallet detected disconnect');
      disconnect();
      lastLoggedInAddress.current = null;
    }
  }, [wallet, connect, disconnect, setUser]);

  // Check initial connection state and listen for changes (fallback)
  // Only depend on tonConnectUI to avoid infinite loops
  useEffect(() => {
    if (!tonConnectUI) {
      return;
    }

    console.log('🔧 TonConnectUI initialized');
    console.log('📱 Connected:', tonConnectUI.connected);
    console.log('👤 Account:', tonConnectUI.account);
    
    // Check if already connected
    if (tonConnectUI.account) {
      const accountAddress = tonConnectUI.account.address;
      // Only update if address changed to avoid loops
      if (lastLoggedInAddress.current !== accountAddress) {
        console.log('✅ TonConnect account found:', accountAddress);
        connect(accountAddress);
        loginUser(accountAddress);
        lastLoggedInAddress.current = accountAddress;
        setError(null);
      }
    } else {
      if (lastLoggedInAddress.current !== null) {
        disconnect();
        lastLoggedInAddress.current = null;
      }
    }

    // Listen for status changes
    const unsubscribe = tonConnectUI.onStatusChange((wallet) => {
      console.log('🔄 TonConnect status changed:', wallet);
      if (wallet && wallet.account) {
        const accountAddress = wallet.account.address;
        // Only update if address changed
        if (lastLoggedInAddress.current !== accountAddress) {
          console.log('✅ Wallet connected:', accountAddress);
          connect(accountAddress);
          loginUser(accountAddress);
          lastLoggedInAddress.current = accountAddress;
          setError(null);
        }
      } else {
        if (lastLoggedInAddress.current !== null) {
          console.log('❌ Wallet disconnected');
          disconnect();
          lastLoggedInAddress.current = null;
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [tonConnectUI]); // Only depend on tonConnectUI to prevent loops

  const handleConnect = async () => {
    console.log('🔌 Opening TonConnect modal...');
    setError(null);
    
    if (!tonConnectUI) {
      const err = 'TonConnectUI не инициализирован';
      console.error('❌', err);
      setError(err);
      return;
    }

    try {
      // Open modal
      await tonConnectUI.openModal();
      console.log('✅ Modal opened');
    } catch (err: any) {
      const errorMsg = err?.message || 'Ошибка открытия модального окна';
      console.error('❌ Error opening modal:', err);
      setError(errorMsg);
    }
  };

  const handleDisconnect = async () => {
    console.log('🔌 Disconnecting...');
    try {
      if (tonConnectUI) {
        await tonConnectUI.disconnect();
      }
      disconnect();
      setError(null);
    } catch (err) {
      console.error('❌ Error disconnecting:', err);
    }
  };

  if (isConnected && tonConnectUI?.account) {
    return (
      <div className="w-full space-y-2">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800">
            ✅ {t('connected')}: {tonConnectUI.account.address.slice(0, 6)}...{tonConnectUI.account.address.slice(-4)}
          </p>
        </div>
        <button
          onClick={handleDisconnect}
          className="w-full bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors"
        >
          {t('disconnect')}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      <button
        onClick={handleConnect}
        disabled={!tonConnectUI}
        className="w-full bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {tonConnectUI ? t('connect_wallet') : t('tonconnect_not_ready')}
      </button>
      {!tonConnectUI && (
        <p className="text-sm text-gray-500 text-center">
          {t('tonconnect_not_ready')}
        </p>
      )}
    </div>
  );
}
