import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { Globe } from 'lucide-react';

export default function LanguageSwitcher() {
  const router = useRouter();
  const { t } = useTranslation('common');
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const changeLanguage = (locale: string) => {
    if (!router || !locale) return;
    const { pathname, asPath, query } = router;
    router.push({ pathname, query }, asPath, { locale, scroll: false });
    setIsOpen(false);
  };

  const currentLocale = router.locale || 'en';

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
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="g-btn g-btn--flat g-btn--s"
        aria-label={t('change_language', 'Change language') || 'Change language'}
        aria-expanded={isOpen}
        type="button"
        style={{ gap: 6 }}
      >
        <Globe size={16} />
        <span className="hidden sm:inline font-semibold uppercase" style={{ fontSize: 11 }}>
          {currentLocale === 'ru' ? 'RU' : 'EN'}
        </span>
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1 z-50 overflow-hidden"
          style={{
            background: 'var(--g-color-base-float-elevated)',
            border: '1px solid var(--g-color-line-hover)',
            borderRadius: 'var(--g-border-radius-l)',
            boxShadow: 'var(--g-shadow-l)',
            minWidth: 120,
            animation: 'g-modal-in 150ms ease forwards',
          }}
        >
          <button
            onClick={() => changeLanguage('en')}
            className="w-full px-4 py-2.5 text-left text-sm transition-colors touch-manipulation flex items-center gap-2"
            style={{
              color: currentLocale === 'en' ? 'var(--g-color-brand)' : 'var(--g-color-text-secondary)',
              background: currentLocale === 'en' ? 'var(--g-color-brand-light)' : 'transparent',
              fontWeight: currentLocale === 'en' ? 600 : 400,
            }}
            type="button"
          >
            🇺🇸 {t('english', 'English')}
          </button>
          <div style={{ height: 1, background: 'var(--g-color-line-generic)' }} />
          <button
            onClick={() => changeLanguage('ru')}
            className="w-full px-4 py-2.5 text-left text-sm transition-colors touch-manipulation flex items-center gap-2"
            style={{
              color: currentLocale === 'ru' ? 'var(--g-color-brand)' : 'var(--g-color-text-secondary)',
              background: currentLocale === 'ru' ? 'var(--g-color-brand-light)' : 'transparent',
              fontWeight: currentLocale === 'ru' ? 600 : 400,
            }}
            type="button"
          >
            🇷🇺 Русский
          </button>
        </div>
      )}
    </div>
  );
}
