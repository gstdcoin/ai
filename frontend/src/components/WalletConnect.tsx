import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../store/walletStore';
import { useTonConnectUI, useTonWallet, TonConnectButton } from '@tonconnect/ui-react';
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
    if (!wallet) {
      // Wallet is null - disconnected or not connected yet
      if (lastLoggedInAddress.current !== null) {
        logger.debug('Wallet disconnected (useTonWallet)');
        disconnect();
        lastLoggedInAddress.current = null;
      }
      return;
    }

    if (wallet.account?.address) {
      const address = wallet.account.address;
      logger.debug('Wallet detected via useTonWallet', { address });
      
      // Only process if address changed
      if (lastLoggedInAddress.current !== address) {
        logger.info('New wallet connected via useTonWallet', { address });
        connect(address);
        loginUser(address);
        setError(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, connect, disconnect]);

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
      logger.debug('TonConnectUI not available yet');
      return;
    }

    logger.debug('TonConnectUI initialized', { 
      connected: tonConnectUI.connected,
      hasAccount: !!tonConnectUI.account,
      accountAddress: tonConnectUI.account?.address 
    });
    
    // Check if already connected on mount
    if (tonConnectUI.account && tonConnectUI.account.address) {
      const accountAddress = tonConnectUI.account.address;
      // Only update if address changed to avoid loops
      if (lastLoggedInAddress.current !== accountAddress) {
        logger.info('TonConnect account found on mount', { address: accountAddress });
        connect(accountAddress);
        loginUser(accountAddress);
        lastLoggedInAddress.current = accountAddress;
        setError(null);
      }
    } else {
      if (lastLoggedInAddress.current !== null) {
        logger.debug('No account found, clearing state');
        disconnect();
        lastLoggedInAddress.current = null;
      }
    }

    // Listen for status changes - this is the main event handler
    const unsubscribe = tonConnectUI.onStatusChange((walletInfo) => {
      logger.debug('TonConnect onStatusChange triggered', { 
        hasWallet: !!walletInfo,
        hasAccount: !!(walletInfo?.account),
        address: walletInfo?.account?.address 
      });
      
      if (walletInfo && walletInfo.account && walletInfo.account.address) {
        const accountAddress = walletInfo.account.address;
        logger.info('Wallet connected via onStatusChange', { address: accountAddress });
        
        // Only update if address changed
        if (lastLoggedInAddress.current !== accountAddress) {
          logger.info('Processing new wallet connection', { address: accountAddress });
          connect(accountAddress);
          loginUser(accountAddress);
          lastLoggedInAddress.current = accountAddress;
          setError(null);
          
          // Close modal if open
          try {
            tonConnectUI.closeModal();
            logger.debug('Modal closed after successful connection');
          } catch (e) {
            // Modal might already be closed
            logger.debug('Modal close attempt (may already be closed)', { error: e });
          }
        } else {
          logger.debug('Wallet address unchanged, skipping', { address: accountAddress });
        }
      } else {
        // Wallet disconnected
        if (lastLoggedInAddress.current !== null) {
          logger.info('Wallet disconnected via onStatusChange');
          disconnect();
          lastLoggedInAddress.current = null;
        }
      }
    });

    return () => {
      logger.debug('Cleaning up TonConnect status listener');
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
      toast.error(t('connection_error'), err);
      return;
    }

    try {
      // Check if already connected
      if (tonConnectUI.account && tonConnectUI.account.address) {
        logger.info('Already connected', { address: tonConnectUI.account.address });
        const address = tonConnectUI.account.address;
        if (lastLoggedInAddress.current !== address) {
          connect(address);
          loginUser(address);
        }
        return;
      }

      // Open modal
      logger.debug('Opening connection modal...');
      await tonConnectUI.openModal();
      logger.debug('Modal opened successfully, waiting for wallet connection...');
      
      // Show user feedback
      toast.info(t('scanning_qr'), t('waiting_connection'));
      
      // Set up periodic check for connection
      const checkInterval = setInterval(() => {
        if (tonConnectUI.account && tonConnectUI.account.address) {
          const address = tonConnectUI.account.address;
          logger.info('Connection detected in periodic check', { address });
          if (lastLoggedInAddress.current !== address) {
            connect(address);
            loginUser(address);
            clearInterval(checkInterval);
          }
        }
      }, 1000); // Check every second
      
      // Clear interval after 30 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!tonConnectUI.account && !isConnected) {
          logger.warn('No connection detected after 30 seconds');
          // Don't show error - user might still be connecting
        }
      }, 30000);
    } catch (err: any) {
      const errorMsg = err?.message || 'Ошибка открытия модального окна';
      logger.error('Error opening modal', err);
      setError(errorMsg);
      toast.error(t('failed_to_open_wallet'), errorMsg);
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
      toast.error(t('failed_to_disconnect'), t('please_try_again'));
    }
  };

  // If connected, show disconnect option
  if (isConnected && (tonConnectUI?.account || wallet?.account)) {
    const address = tonConnectUI?.account?.address || wallet?.account?.address;
    return (
      <div className="w-full space-y-2">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800">
            ✅ {t('connected')}: {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Connected'}
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
      {/* Use built-in TonConnectButton - it handles all connection logic automatically */}
      <div className="w-full [&>button]:w-full [&>button]:!bg-primary-600 [&>button]:!text-white [&>button]:!px-6 [&>button]:!py-3 [&>button]:!rounded-lg [&>button]:hover:!bg-primary-700 [&>button]:!transition-colors">
        <TonConnectButton />
      </div>
      {/* Custom button as fallback if needed */}
      {(!tonConnectUI && !isInitializing) && (
        <div className="space-y-2">
          <button
            onClick={handleConnect}
            disabled={isInitializing || !tonConnectUI}
            className="w-full bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isInitializing ? t('loading') || 'Загрузка...' : (tonConnectUI ? t('connect_wallet') : t('tonconnect_not_ready'))}
          </button>
          <p className="text-sm text-gray-500 text-center">
            {t('tonconnect_not_ready')}
          </p>
        </div>
      )}
    </div>
  );
}
