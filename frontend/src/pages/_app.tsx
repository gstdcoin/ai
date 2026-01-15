import type { AppProps } from 'next/app';
import { appWithTranslation } from 'next-i18next';
import { TonConnectUIProvider, THEME } from '@tonconnect/ui-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { TelegramThemeProvider } from '../components/common/TelegramThemeProvider';
import { initTelegramWebApp, isTelegramWebApp, getTelegramColorScheme } from '../lib/telegram';
import '../styles/globals.css';

// Get manifestUrl from environment variable or use fallback
const getManifestUrl = (): string => {
  if (typeof window !== 'undefined') {
    // Check for environment variable in browser
    const envUrl = process.env.NEXT_PUBLIC_TONCONNECT_MANIFEST_URL;
    if (envUrl && envUrl.startsWith('https://')) {
      return envUrl;
    }
  }
  // Fallback to default HTTPS URL
  return process.env.NEXT_PUBLIC_TONCONNECT_MANIFEST_URL || 'https://app.gstdtoken.com/tonconnect-manifest.json';
};

function App({ Component, pageProps }: AppProps) {
  const [isMounted, setIsMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Initialize Telegram WebApp on mount
    if (typeof window !== 'undefined') {
      const webApp = initTelegramWebApp();
      
      if (webApp) {
        console.log('✅ Telegram WebApp initialized');
        console.log('Theme:', webApp.themeParams);
        console.log('Color scheme:', webApp.colorScheme);
      } else {
        console.log('ℹ️ Not running in Telegram WebApp');
      }
      
      setIsMounted(true);
      
      // Register Service Worker for PWA
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('Service Worker registered:', registration.scope);
          })
          .catch((error) => {
            console.error('Service Worker registration failed:', error);
          });
      }
    }
  }, []);

  // Return null or loader until mounted
  if (!isMounted) {
    return null;
  }

  const manifestUrl = getManifestUrl();
  
  // Определить тему для TonConnect на основе Telegram
  const telegramTheme = isTelegramWebApp() 
    ? (getTelegramColorScheme() === 'light' ? THEME.LIGHT : THEME.DARK)
    : THEME.DARK;

  // Определить язык для TonConnect на основе текущей локали приложения
  const tonConnectLanguage = router.locale === 'en' ? 'en' : 'ru';

  return (
    <ErrorBoundary>
      <TelegramThemeProvider>
        <TonConnectUIProvider 
          manifestUrl={manifestUrl}
          actionsConfiguration={{
            twaReturnUrl: 'https://t.me/gstdtoken_bot'
          }}
          restoreConnection={true}
          uiPreferences={{
            theme: telegramTheme,
            borderRadius: 'm'
          }}
          language={tonConnectLanguage}
        >
          <Component {...pageProps} />
          <Toaster 
            position="top-right"
            richColors
            closeButton
          />
        </TonConnectUIProvider>
      </TelegramThemeProvider>
    </ErrorBoundary>
  );
}

export default appWithTranslation(App);

