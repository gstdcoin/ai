'use client';

/**
 * Total Domination — Global Localization
 * Auto-switch RU/EN based on Telegram user language_code
 */
import React, { createContext, useContext, useEffect } from 'react';
import { useRouter } from 'next/router';
import { getTelegramUser } from '../lib/telegram';

type Locale = 'en' | 'ru';

const TMALocaleContext = createContext<{ locale: Locale }>({ locale: 'en' });

export function useTMALocaleContext(): Locale {
  return useContext(TMALocaleContext).locale;
}

export function TMALocaleProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = getTelegramUser();
  const locale: Locale = (user?.language_code?.toLowerCase().startsWith('ru') ? 'ru' : 'en') as Locale;

  useEffect(() => {
    if (router.locale !== locale) {
      router.push(router.pathname, router.asPath, { locale });
    }
  }, [locale, router.pathname, router.asPath, router.locale]);

  return (
    <TMALocaleContext.Provider value={{ locale }}>
      {children}
    </TMALocaleContext.Provider>
  );
}
