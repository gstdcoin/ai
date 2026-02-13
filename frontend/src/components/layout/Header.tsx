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
      <div className="px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
            {/* Logo */}
            <div className="flex-shrink-0 relative">
              <img
                src="/logo.png"
                alt="GSTD Logo"
                className="w-9 h-9 transition-transform active:scale-95 duration-200"
              />
              <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-gray-900 ${isWsConnected ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' : 'bg-red-500 animate-pulse'}`} />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-black text-white font-display tracking-tighter truncate">
                <span className="bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">GSTD</span>
              </h1>
              {address && (
                <p className="text-[9px] text-gray-500 font-mono truncate">
                  {address.slice(0, 6)}…{address.slice(-4)}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-hidden">
            {/* Balance */}
            <div className="text-right">
              <span className="text-[8px] text-gray-500 font-bold uppercase block">GSTD</span>
              <span className="text-sm font-black text-cyan-400 tabular-nums">{gstdBalance?.toFixed(2) || '0.00'}</span>
            </div>

            {/* Quick Metrics - hidden on small, shown when space */}
            <div className="hidden md:flex items-center gap-3 px-2 py-1 rounded-lg bg-white/[0.02] border border-white/5">
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
