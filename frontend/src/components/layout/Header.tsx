import React from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import { Share2, LogOut } from 'lucide-react';
import LanguageSwitcher from './LanguageSwitcher';
import { toast } from '../../lib/toast';

interface HeaderProps {
  onCreateTask: () => void;
  onLogout: () => void;
}

export default React.memo(function Header({ onCreateTask, onLogout }: HeaderProps) {
  const { t } = useTranslation('common');
  const { address, tonBalance, gstdBalance } = useWalletStore();

  const handleShare = () => {
    const shareText = t('share_text') || 'Join the GSTD Platform - Decentralized AI Inference Network';
    const shareUrl = typeof window !== 'undefined' ? window.location.origin : 'https://app.gstdtoken.com';
    
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      const tg = (window as any).Telegram.WebApp;
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`);
    } else if (navigator.share) {
      navigator.share({ title: 'GSTD Platform', text: shareText, url: shareUrl });
    } else {
      navigator.clipboard.writeText(shareUrl);
      toast.success(t('link_copied') || 'Link copied to clipboard!');
    }
  };

  return (
    <header className="glass-dark border-b border-white/10 sticky top-0 z-30">
      <div className="px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1 min-w-0 flex items-center gap-3">
            {/* Logo */}
            <div className="flex-shrink-0">
              <img 
                src="/logo-icon.svg" 
                alt="GSTD Logo" 
                className="w-10 h-10 sm:w-12 sm:h-12 transition-transform hover:scale-110 duration-300"
              />
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
                onClick={handleShare}
                className="glass-button text-white touch-manipulation"
                aria-label={t('share') || 'Share'}
                type="button"
              >
                <Share2 size={18} />
                <span className="hidden sm:inline">{t('share') || 'Share'}</span>
              </button>
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
            <div className="flex items-center gap-2">
              <span className="text-lg">🌡️</span>
              <div>
                <p 
                  className="text-xs text-gray-400 uppercase tracking-wider cursor-help" 
                  title="Среднее значение entropy_score по всем операциям. Высокая температура = низкая надёжность сети."
                >
                  {t('network_temperature')}
                </p>
                <p className="text-lg sm:text-xl font-bold text-orange-400" id="network-temperature">0.00 T</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">⚡</span>
              <div>
                <p 
                  className="text-xs text-gray-400 uppercase tracking-wider cursor-help" 
                  title="Количество ожидающих задач / Количество активных узлов. Высокое давление = перегрузка сети."
                >
                  {t('computational_pressure')}
                </p>
                <p className="text-lg sm:text-xl font-bold text-red-400" id="computational-pressure">0.00 P</p>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 italic">
            {t('depin_network_status') || 'Real-time DePIN network metrics'}
          </p>
        </div>
      </div>
    </header>
  );
});

