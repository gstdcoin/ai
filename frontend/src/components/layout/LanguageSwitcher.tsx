import React from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { Globe } from 'lucide-react';

export default function LanguageSwitcher() {
  const router = useRouter();
  const { t } = useTranslation('common');

  const changeLanguage = (locale: string) => {
    router.push(router.pathname, router.asPath, { locale });
  };

  const currentLocale = router.locale || 'en';

  return (
    <div className="relative group">
      <button
        className="glass-button flex items-center gap-2 text-white"
        aria-label={t('change_language') || 'Change language'}
      >
        <Globe size={18} />
        <span className="hidden sm:inline font-medium uppercase">
          {currentLocale === 'ru' ? 'RU' : 'EN'}
        </span>
      </button>
      
      <div className="absolute right-0 top-full mt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
        <div className="glass-dark rounded-lg shadow-glass overflow-hidden min-w-[120px]">
          <button
            onClick={() => changeLanguage('en')}
            className={`
              w-full px-4 py-2 text-left text-sm transition-colors
              ${currentLocale === 'en' ? 'bg-gold-900/20 text-gold-900' : 'text-gray-300 hover:bg-white/5'}
            `}
          >
            English
          </button>
          <button
            onClick={() => changeLanguage('ru')}
            className={`
              w-full px-4 py-2 text-left text-sm transition-colors
              ${currentLocale === 'ru' ? 'bg-gold-900/20 text-gold-900' : 'text-gray-300 hover:bg-white/5'}
            `}
          >
            Русский
          </button>
        </div>
      </div>
    </div>
  );
}

