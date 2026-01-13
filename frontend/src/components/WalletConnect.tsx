import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../store/walletStore';
import { useTonConnectUI, useTonWallet, TonConnectButton } from '@tonconnect/ui-react';
import { useEffect, useState, useRef } from 'react';
import { logger } from '../lib/logger';
import { toast } from '../lib/toast';
import { apiPost } from '../lib/apiClient';

export default function WalletConnect() {
  const { t } = useTranslation('common');
  const { isConnected, disconnect, connect, setUser } = useWalletStore();
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const lastLoggedInAddress = useRef<string | null>(null);

  // Check if window is available (SSR safety) - at the beginning of render logic
  if (typeof window === 'undefined') {
    return null;
  }

  // Function to call login API with TonConnect signature
  const loginUser = async (walletAddress: string) => {
    // Avoid duplicate calls for the same address
    if (lastLoggedInAddress.current === walletAddress) {
      logger.debug('Skipping duplicate login', { walletAddress });
      return;
    }

    try {
      // Generate payload for signature (nonce + timestamp)
      const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const timestamp = Math.floor(Date.now() / 1000);
      const payload = JSON.stringify({
        nonce: nonce,
        timestamp: timestamp,
        address: walletAddress,
      });

      // Check if signature is available from wallet.connectItems.tonProof.proof.signature
      let signature: string | undefined;
      let publicKey: string | undefined;
      const walletAny = wallet as any;
      
      // Try to get signature from wallet.connectItems.tonProof.proof.signature
      if (walletAny?.connectItems?.tonProof?.proof?.signature) {
        const proofSignature = walletAny.connectItems.tonProof.proof.signature;
        logger.debug('Found signature in wallet.connectItems.tonProof.proof.signature', {
          signatureType: typeof proofSignature
        });
        
        // Extract signature string from the proof
        if (typeof proofSignature === 'string') {
          signature = proofSignature;
        } else if (proofSignature && typeof proofSignature === 'object' && 'signature' in proofSignature) {
          signature = proofSignature.signature;
        }
        
        // Try to get public key from proof
        if (walletAny.connectItems?.tonProof?.proof?.publicKey) {
          publicKey = walletAny.connectItems.tonProof.proof.publicKey;
        }
      }

      // If signature not found in connectItems, use signData API
      if (!signature) {
        // Sign payload with TonConnect
        if (!tonConnectUI.connector) {
          throw new Error('TonConnect not connected');
        }

        // TonConnect v2 signs the SHA-256 hash of the payload
        // Use the same sha256 function as in taskWorker.ts
        const sha256 = async (message: string): Promise<Uint8Array> => {
          const msgBuffer = new TextEncoder().encode(message);
          const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
          return new Uint8Array(hashBuffer);
        };
        
        const hashArray = await sha256(payload);
        
        // TonConnect v2 expects message as bytes or encoded string.
        // Convert hash to base64 string for maximum compatibility with SDK types.
        // Use Array.from to avoid TypeScript iteration issues with Uint8Array
        const hashBase64 = btoa(Array.from(hashArray).map(b => String.fromCharCode(b)).join(''));
        
        try {
          // Use 'as any' to bypass TypeScript type checking for SignDataPayload
          // The actual SDK may use different field names (message/data) depending on version
          // Add item with ton_proof to satisfy SDK requirements
          const signResult = await tonConnectUI.connector.signData({
            schema: 'v2',
            message: hashBase64,
            items: [
              {
                name: 'ton_proof',
                payload: hashBase64,
              }
            ],
          } as any);
          // Use 'as any' to bypass TypeScript type checking for signResult
          // TonConnect SDK may return different structures depending on version
          const resultAny = signResult as any;
          
          // TonConnect returns signature as base64 string
          signature = resultAny.signature;
          
          // Try to get public key from multiple sources
          // 1. From signData response (if available in TonConnect v2)
          if (resultAny.publicKey) {
            publicKey = resultAny.publicKey;
            logger.debug('Public key obtained from signData response', { 
              publicKey: publicKey?.length > 20 ? publicKey.substring(0, 20) + '...' : publicKey 
            });
          } else if (resultAny.signature && resultAny.signature.publicKey) {
            publicKey = resultAny.signature.publicKey;
            logger.debug('Public key obtained from signature object', { 
              publicKey: publicKey?.length > 20 ? publicKey.substring(0, 20) + '...' : publicKey 
            });
          } 
          // 2. From wallet account (TonConnect UI)
          else if (tonConnectUI.account?.publicKey) {
            publicKey = tonConnectUI.account.publicKey;
            logger.debug('Public key obtained from TonConnect UI account', { 
              publicKey: publicKey?.length > 20 ? publicKey.substring(0, 20) + '...' : publicKey 
            });
          }
          // 3. From connector wallet (fallback)
          else {
            const walletInfo = tonConnectUI.connector?.wallet;
            if (walletInfo?.account?.publicKey) {
              publicKey = walletInfo.account.publicKey;
              logger.debug('Public key obtained from connector wallet', { 
                publicKey: publicKey?.length > 20 ? publicKey.substring(0, 20) + '...' : publicKey 
              });
            } else {
              logger.warn('Public key not available from TonConnect - backend will fetch from TON API');
            }
          }
        } catch (signErr: any) {
          logger.error('Failed to sign login payload', signErr);
          throw new Error(`Signature failed: ${signErr?.message || 'Unknown error'}`);
        }
      }

      if (!signature) {
        throw new Error('Signature not available from wallet or signData API');
      }

      // Create signature object manually to satisfy SDK type requirements
      // If signature is a string, convert it to object with type field
      let signatureObj: { signature: string; type: string };
      if (typeof signature === 'string') {
        signatureObj = {
          signature: signature,
          type: 'test-item', // Required type field for SDK validation
        };
      } else {
        // If already an object, ensure it has type field
        signatureObj = {
          signature: (signature as any).signature || signature,
          type: (signature as any).type || 'test-item',
        };
      }

      // Prepare connect_payload object with properly formatted signature
      let connect_payload = {
        wallet_address: walletAddress,
        signature: signatureObj,
        payload: payload,
        public_key: publicKey,
      };

      // Принудительная проверка перед отправкой requestBody
      // Если signature является строкой или объектом без поля type, оборачиваем её
      if (typeof connect_payload.signature === 'string' || 
          (typeof connect_payload.signature === 'object' && 
           connect_payload.signature !== null && 
           !('type' in connect_payload.signature))) {
        const signatureValue = typeof connect_payload.signature === 'string' 
          ? connect_payload.signature 
          : (connect_payload.signature as any).signature || connect_payload.signature;
        connect_payload.signature = { 
          signature: signatureValue, 
          type: 'test-item' 
        };
      }

      // Prepare request body with full connect_payload
      const requestBody = {
        connect_payload: connect_payload,
        // Also include individual fields for backward compatibility
        wallet_address: walletAddress,
        signature: signatureObj.signature, // Send signature string for backward compatibility
        payload: payload,
        public_key: publicKey,
      };
      
      // Log request body before sending to backend
      console.log("SENDING TO BACKEND:", requestBody);
      
      // DEBUG: Log before API call to track if request is sent
      console.log('🚀 [WalletConnect] Sending login/registration request:', {
        url: '/users/login',
        wallet_address: walletAddress,
        has_signature: !!signature,
        has_public_key: !!publicKey,
        payload_length: payload.length,
        has_connect_payload: !!requestBody.connect_payload,
        signature_type: connect_payload.signature.type,
        timestamp: new Date().toISOString(),
      });
      
      logger.debug('Sending login request with connect_payload', {
        wallet_address: walletAddress,
        has_signature: !!signature,
        has_public_key: !!publicKey,
        payload_length: payload.length,
        signature_type: connect_payload.signature.type,
      });
      
      // Use apiClient.post to send full connect_payload object
      const userData = await apiPost('/users/login', requestBody);
      logger.info('User logged in successfully', { walletAddress });
      
      // Handle new response format with session_token
      if (userData.user) {
        setUser(userData.user);
        // Store session token if provided
        if (userData.session_token) {
          localStorage.setItem('session_token', userData.session_token);
        }
      } else {
        setUser(userData);
      }
      
      lastLoggedInAddress.current = walletAddress;
      
      // Store in localStorage as well
      localStorage.setItem('user', JSON.stringify(userData.user || userData));
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

  // Simple logic: if connected, show address, otherwise show TonConnectButton
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
          className="w-full bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors touch-manipulation"
          type="button"
        >
          {t('disconnect')}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2 relative z-10">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      {/* Use built-in TonConnectButton - only one button, no duplicates */}
      <div className="w-full flex justify-center [&>button]:!bg-primary-600 [&>button]:!text-white [&>button]:!px-6 [&>button]:!py-3 [&>button]:!rounded-lg [&>button]:hover:!bg-primary-700 [&>button]:!active:!bg-primary-800 [&>button]:!transition-colors [&>button]:!touch-manipulation [&>button]:!z-20 [&>button]:!relative [&>button]:!max-w-full [&>button]:!overflow-hidden">
        <TonConnectButton />
      </div>
    </div>
  );
}
