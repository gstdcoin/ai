import React from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import { Share2, LogOut, Home } from 'lucide-react';
import { useRouter } from 'next/router';
import LanguageSwitcher from './LanguageSwitcher';
import { toast } from '../../lib/toast';
import { Tooltip } from '../ui/Tooltip';
import { wsClient } from '../../lib/websocket';

interface HeaderProps {
  onCreateTask: () => void;
  onLogout: () => void;
  isPublic?: boolean;
}

export default React.memo(function Header({ onCreateTask, onLogout, isPublic = false }: HeaderProps) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { address, tonBalance, gstdBalance } = useWalletStore();
  const [isWsConnected, setIsWsConnected] = React.useState(false);

  React.useEffect(() => {
    const checkConn = () => {
      setIsWsConnected(wsClient.isConnected());
    };
    checkConn();
    const interval = setInterval(checkConn, 2000);
    return () => clearInterval(interval);
  }, []);

  if (isPublic) {
    return (
      <header className="glass-dark border-b border-white/10 sticky top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="flex-shrink-0">
              <img src="/logo.png" alt="GSTD Logo" className="w-10 h-10" />
            </div>
            <h1 className="text-xl font-bold text-white font-display">
              <span className="bg-gradient-to-r from-gold-400 to-gold-600 bg-clip-text text-transparent">GSTD</span>
              <span className="text-gray-300 ml-2">Documentation</span>
            </h1>
          </a>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <a href="/" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
              Back to Platform
            </a>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="glass-dark border-b border-white/10 sticky top-0 z-30">
      <div className="px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1 min-w-0 flex items-center gap-3">
            {/* Logo */}
            <div className="flex-shrink-0 relative">
              <img
                src="/logo.png"
                alt="GSTD Logo"
                className="w-10 h-10 sm:w-12 sm:h-12 transition-transform hover:scale-110 duration-300"
              />
              <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-gray-900 ${isWsConnected ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500 animate-pulse'}`} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-white font-display flex items-center gap-2">
                <span className="bg-gradient-to-r from-gold-400 to-gold-600 bg-clip-text text-transparent">
                  GSTD
                </span>
                <span className="text-gray-300">{t('dashboard')}</span>
              </h1>
              {address && (
                <p className="text-xs sm:text-sm text-gray-400 mt-1 truncate font-mono">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
            {/* Balances */}
            <div className="flex gap-3 sm:gap-4">
              {tonBalance !== null && (
                <div className="text-right border-r pr-3 sm:pr-4 border-white/10">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{t('ton_balance')}</p>
                  <p className="text-base sm:text-lg font-bold text-white">{tonBalance} TON</p>
                </div>
              )}
              {gstdBalance !== null && (
                <div className="text-right">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{t('gstd_balance')}</p>
                  <p className="text-base sm:text-lg font-bold text-gold-900">{gstdBalance} GSTD</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <LanguageSwitcher />

              <button
                onClick={onLogout}
                className="glass-button text-white touch-manipulation"
                aria-label={t('disconnect')}
                type="button"
              >
                <LogOut size={18} />
                <span className="hidden sm:inline">{t('disconnect')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Network Metrics Banner */}
      <div className="px-4 sm:px-6 py-3 bg-gradient-to-r from-orange-500/10 to-red-500/10 border-t border-orange-500/20">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <Tooltip content={t('network_temperature_tooltip')}>
              <div className="flex items-center gap-2">
                <span className="text-lg">🌡️</span>
                <div>
                  <p className="text-xs text-gray-400 font-mono tracking-tighter uppercase whitespace-nowrap">
                    {t('network_temperature')}
                  </p>
                  <p className="text-lg sm:text-xl font-bold text-orange-400" id="network-temperature">0.00 T</p>
                </div>
              </div>
            </Tooltip>

            <Tooltip content={t('computational_pressure_tooltip')}>
              <div className="flex items-center gap-2">
                <span className="text-lg">⚡</span>
                <div>
                  <p className="text-xs text-gray-400 font-mono tracking-tighter uppercase whitespace-nowrap">
                    {t('computational_pressure')}
                  </p>
                  <p className="text-lg sm:text-xl font-bold text-red-400" id="computational-pressure">0.00 P</p>
                </div>
              </div>
            </Tooltip>
          </div>
          <p className="text-xs text-gray-400 italic">
            {t('depin_network_status') || 'Real-time DePIN network metrics'}
          </p>
        </div>
      </div>
    </header>
  );
});

