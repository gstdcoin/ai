import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../store/walletStore';
import { useTonConnectUI, useTonWallet, TonConnectButton } from '@tonconnect/ui-react';
import { toast } from '../lib/toast';
import { logger } from '../lib/logger';

export default function WalletConnect() {
  const { t } = useTranslation('common');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { isConnected, disconnect } = useWalletStore();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();

  // Handle manual disconnect from UI
  const handleDisconnect = async () => {
    logger.debug('Disconnecting wallet via UI');
    try {
      if (tonConnectUI) {
        await tonConnectUI.disconnect();
      }
      disconnect();
      toast.info('Wallet disconnected');
    } catch (err) {
      logger.error('Error disconnecting', err);
      toast.error(t('failed_to_disconnect') || 'Failed to disconnect');
    }
  };

  // If client-side and connected, show connected UI
  if (typeof window !== 'undefined' && isConnected && (tonConnectUI?.account || wallet?.account)) {
    const address = tonConnectUI?.account?.address || wallet?.account?.address;
    return (
      <div className="w-full space-y-2">
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 backdrop-blur-sm">
          <p className="text-sm text-green-400 flex items-center justify-center gap-2">
            ✅ {t('connected')}: <span className="font-mono">{address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Connected'}</span>
          </p>
        </div>
        <button
          onClick={handleDisconnect}
          className="w-full bg-red-600/80 hover:bg-red-600 text-white px-6 py-3 rounded-lg transition-colors touch-manipulation backdrop-blur-sm"
          type="button"
        >
          {t('disconnect')}
        </button>
      </div>
    );
  }

  // Default: Show TonConnect Button
  return (
    <div id="ton-connect-button-root" className="w-full flex flex-col items-center justify-center">
      <TonConnectButton className="!w-full !max-w-[320px] mx-auto [&>button]:!w-full [&>button]:!justify-center [&>button]:!h-14 [&>button]:!text-lg [&>button]:!rounded-xl [&>button]:!bg-gradient-to-r [&>button]:!from-blue-600 [&>button]:!to-cyan-500 [&>button]:!shadow-lg [&>button]:!shadow-blue-500/25" />
    </div>
  );
}
