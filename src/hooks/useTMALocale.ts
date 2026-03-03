'use client';

/**
 * Total Domination — Global Localization
 * Returns locale (ru/en) from Telegram user language_code.
 * Syncs i18n language when in TMA.
 */
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { getTelegramUser } from '../lib/telegram';

export type TMALocale = 'en' | 'ru';

export function useTMALocale(): TMALocale {
  const user = getTelegramUser();
  return (user?.language_code?.toLowerCase().startsWith('ru') ? 'ru' : 'en') as TMALocale;
}

export function useTMALocaleSync() {
  const router = useRouter();
  const locale = useTMALocale();
  const synced = useRef(false);

  useEffect(() => {
    if (synced.current || router.locale === locale) return;
    synced.current = true;
    router.push(router.pathname, router.asPath, { locale });
  }, [locale, router]);
}
