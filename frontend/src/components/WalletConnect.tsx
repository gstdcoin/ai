import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../store/walletStore';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { useEffect, useState, useRef } from 'react';
import { logger } from '../lib/logger';
import { toast } from '../lib/toast';

export default function WalletConnect() {
  const { t } = useTranslation('common');
  const { isConnected, disconnect, connect, setUser } = useWalletStore();
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const lastLoggedInAddress = useRef<string | null>(null);

  // Function to call login API
  const loginUser = async (walletAddress: string) => {
    // Avoid duplicate calls for the same address
    if (lastLoggedInAddress.current === walletAddress) {
      logger.debug('Skipping duplicate login', { walletAddress });
      return;
    }

    try {
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');
      const response = await fetch(`${apiBase}/api/v1/users/login`, {
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
      logger.info('User logged in successfully', { walletAddress });
      setUser(userData);
      lastLoggedInAddress.current = walletAddress;
      
      // Store in localStorage as well
      localStorage.setItem('user', JSON.stringify(userData));
    } catch (err: any) {
      logger.error('Error logging in user', err);
      const errorMsg = err?.message || 'Failed to login user';
      setError(errorMsg);
      toast.error('Login failed', errorMsg);
    }
  };

  // Use useTonWallet hook to detect wallet changes (primary hook as requested)
  useEffect(() => {
    if (wallet?.account?.address) {
      logger.debug('Wallet detected', { address: wallet.account.address });
      connect(wallet.account.address);
      loginUser(wallet.account.address);
      setError(null);
    } else if (wallet === null) {
      // Wallet disconnected
      logger.debug('Wallet disconnected');
      disconnect();
      lastLoggedInAddress.current = null;
    }
  }, [wallet, connect, disconnect, setUser]);

  // Show loading state while TonConnect initializes
  useEffect(() => {
    // Give TonConnect time to initialize
    const timer = setTimeout(() => {
      setIsInitializing(false);
    }, 2000);
    
    return () => clearTimeout(timer);
  }, []);

  // Check initial connection state and listen for changes (fallback)
  // Only depend on tonConnectUI to avoid infinite loops
  useEffect(() => {
    if (!tonConnectUI) {
      return;
    }

    logger.debug('TonConnectUI initialized', { 
      connected: tonConnectUI.connected,
      hasAccount: !!tonConnectUI.account 
    });
    
    // Check if already connected
    if (tonConnectUI.account) {
      const accountAddress = tonConnectUI.account.address;
      // Only update if address changed to avoid loops
      if (lastLoggedInAddress.current !== accountAddress) {
        logger.info('TonConnect account found', { address: accountAddress });
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
      logger.debug('TonConnect status changed', { hasWallet: !!wallet });
      if (wallet && wallet.account) {
        const accountAddress = wallet.account.address;
        // Only update if address changed
        if (lastLoggedInAddress.current !== accountAddress) {
          logger.info('Wallet connected', { address: accountAddress });
          connect(accountAddress);
          loginUser(accountAddress);
          lastLoggedInAddress.current = accountAddress;
          setError(null);
        }
      } else {
        if (lastLoggedInAddress.current !== null) {
          logger.info('Wallet disconnected');
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
    logger.debug('Opening TonConnect modal');
    setError(null);
    
    if (!tonConnectUI) {
      const err = 'TonConnectUI не инициализирован';
      logger.error('TonConnectUI not initialized');
      setError(err);
      toast.error('Connection error', err);
      return;
    }

    try {
      // Open modal
      await tonConnectUI.openModal();
      logger.debug('Modal opened successfully');
    } catch (err: any) {
      const errorMsg = err?.message || 'Ошибка открытия модального окна';
      logger.error('Error opening modal', err);
      setError(errorMsg);
      toast.error('Failed to open wallet', errorMsg);
    }
  };

  const handleDisconnect = async () => {
    logger.debug('Disconnecting wallet');
    try {
      if (tonConnectUI) {
        await tonConnectUI.disconnect();
      }
      disconnect();
      setError(null);
      toast.info('Wallet disconnected');
    } catch (err) {
      logger.error('Error disconnecting', err);
      toast.error('Failed to disconnect', 'Please try again');
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
        disabled={isInitializing || !tonConnectUI}
        className="w-full bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isInitializing ? t('loading') || 'Загрузка...' : (tonConnectUI ? t('connect_wallet') : t('tonconnect_not_ready'))}
      </button>
      {(!tonConnectUI && !isInitializing) && (
        <p className="text-sm text-gray-500 text-center">
          {t('tonconnect_not_ready')}
        </p>
      )}
    </div>
  );
}
