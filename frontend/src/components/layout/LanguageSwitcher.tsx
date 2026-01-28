import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { Globe } from 'lucide-react';

export default function LanguageSwitcher() {
  const router = useRouter();
  const { t, i18n } = useTranslation('common');
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const changeLanguage = (locale: string) => {
    if (!router || !locale) return;

    // Update URL with full navigation to trigger next-i18next reload
    const { pathname, asPath, query } = router;
    router.push({ pathname, query }, asPath, { locale, scroll: false });
    setIsOpen(false);
  };

  const currentLocale = router.locale || 'ru';

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        buttonRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="glass-button flex items-center gap-2 text-white touch-manipulation"
        aria-label={t('change_language') || 'Change language'}
        aria-expanded={isOpen}
        type="button"
      >
        <Globe size={18} />
        <span className="hidden sm:inline font-medium uppercase">
          {currentLocale === 'ru' ? 'RU' : 'EN'}
        </span>
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className="absolute right-0 sm:right-0 left-auto sm:left-auto top-full mt-2 z-50 glass-dark rounded-lg shadow-glass overflow-hidden min-w-[120px] max-w-[200px]"
          style={{
            right: '0',
            left: 'auto',
            transform: 'translateX(0)'
          }}
        >
          <button
            onClick={() => changeLanguage('en')}
            className={`
              w-full px-4 py-2 text-left text-sm transition-colors touch-manipulation
              ${currentLocale === 'en' ? 'bg-gold-900/20 text-gold-900' : 'text-gray-300 hover:bg-white/5 active:bg-white/10'}
            `}
            type="button"
          >
            English
          </button>
          <button
            onClick={() => changeLanguage('ru')}
            className={`
              w-full px-4 py-2 text-left text-sm transition-colors touch-manipulation
              ${currentLocale === 'ru' ? 'bg-gold-900/20 text-gold-900' : 'text-gray-300 hover:bg-white/5 active:bg-white/10'}
            `}
            type="button"
          >
            Русский
          </button>
        </div>
      )}
    </div>
  );
}
