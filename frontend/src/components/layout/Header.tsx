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
    <header className="glass-dark border-b border-white/10 sticky top-0 z-40">
      <div className="px-3 sm:px-6 py-2.5 sm:py-3">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Logo */}
            <div className="flex-shrink-0 relative">
              <img
                src="/logo.png"
                alt="GSTD Logo"
                className="w-8 h-8 sm:w-10 sm:h-10 transition-transform hover:scale-110 duration-300"
              />
              <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-gray-900 ${isWsConnected ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-red-500 animate-pulse'}`} />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg sm:text-xl font-black text-white font-display flex items-center gap-1.5 tracking-tighter uppercase whitespace-nowrap">
                <span className="bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">GSTD</span>
                <span className="text-gray-500 text-sm hidden sm:inline">/ CONTROL</span>
              </h1>
              {address && (
                <p className="text-[9px] text-gray-600 font-mono tracking-widest uppercase">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
            {/* Unified Balance Row */}
            <div className="flex items-center gap-3 sm:gap-6">
              <div className="text-right hidden sm:block">
                <span className="text-[9px] text-gray-600 font-black uppercase tracking-widest block mb-0.5">TON</span>
                <span className="text-sm font-black text-white tabular-nums">{tonBalance || '0.00'}</span>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-cyan-900 font-black uppercase tracking-widest block mb-0.5">GSTD</span>
                <span className="text-sm font-black text-cyan-400 tabular-nums">{gstdBalance?.toFixed(2) || '0.00'}</span>
              </div>
            </div>

            {/* Quick Metrics (Merged) */}
            <div className="hidden lg:flex items-center gap-6 px-4 py-1.5 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-gray-600 font-black uppercase tracking-widest">Grid</span>
                <span className="text-[10px] font-black text-orange-400 font-mono" id="network-temperature">0 T</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-gray-600 font-black uppercase tracking-widest">Load</span>
                <span className="text-[10px] font-black text-cyan-400 font-mono" id="computational-pressure">0 P</span>
              </div>
            </div>

            {/* Language & Profile */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <LanguageSwitcher />
              <button
                onClick={onLogout}
                className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-500 hover:text-white transition-all active:scale-90"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
});
