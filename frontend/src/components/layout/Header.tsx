import React from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import { Share2, LogOut, Home, Activity, Server } from 'lucide-react';
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
              <h1 className="text-xl sm:text-2xl font-black text-white font-display flex items-center gap-2 tracking-tighter uppercase">
                <span className="bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
                  GSTD
                </span>
                <span className="text-gray-400/80">{t('dashboard')}</span>
              </h1>
              {address && (
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                  <p className="text-[10px] sm:text-xs text-gray-500 font-mono tracking-widest uppercase">
                    ID: {address.slice(0, 8)}...{address.slice(-4)}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 sm:gap-6 w-full sm:w-auto">
            {/* Balances */}
            <div className="flex gap-6">
              {tonBalance !== null && (
                <div className="text-right">
                  <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em] mb-1">{t('ton_balance')}</p>
                  <p className="text-lg sm:text-xl font-black text-white tabular-nums">{tonBalance} <span className="text-xs text-gray-600">TON</span></p>
                </div>
              )}
              {gstdBalance !== null && (
                <div className="text-right">
                  <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em] mb-1">{t('gstd_balance')}</p>
                  <p className="text-lg sm:text-xl font-black text-cyan-400 tabular-nums drop-shadow-[0_0_10px_rgba(34,211,238,0.3)]">{gstdBalance} <span className="text-xs text-cyan-900 font-bold">GSTD</span></p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <div className="h-8 w-[1px] bg-white/10 hidden sm:block" />
              <LanguageSwitcher />

              <button
                onClick={onLogout}
                className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all active:scale-95"
                title={t('disconnect')}
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Network Metrics Banner */}
      <div className="px-4 sm:px-6 py-2 bg-black/60 border-t border-white/5 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3 group">
              <div className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400">
                <Activity size={12} className="animate-pulse" />
              </div>
              <div>
                <span className="text-[9px] text-gray-600 font-black uppercase tracking-widest block leading-none mb-1">Grid Temp</span>
                <span className="text-sm font-black text-orange-400/90 font-mono" id="network-temperature">0.00 T</span>
              </div>
            </div>

            <div className="flex items-center gap-3 group">
              <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <Server size={12} />
              </div>
              <div>
                <span className="text-[9px] text-gray-600 font-black uppercase tracking-widest block leading-none mb-1">Compute Pressure</span>
                <span className="text-sm font-black text-cyan-400/90 font-mono" id="computational-pressure">0.00 P</span>
              </div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <span className="text-[10px] text-gray-600 font-bold uppercase tracking-wider">{t('depin_network_status') || 'Live DePIN Node Cluster'}</span>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
          </div>
        </div>
      </div>
    </header>
  );
});

