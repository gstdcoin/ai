import type { AppProps } from 'next/app';
import { appWithTranslation } from 'next-i18next';
import { TonConnectUIProvider, THEME } from '@tonconnect/ui-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { TelegramThemeProvider } from '../components/common/TelegramThemeProvider';
import { initTelegramWebApp, isTelegramWebApp, getTelegramColorScheme } from '../lib/telegram';
import WalletListener from '../components/common/WalletListener';
import VercelSwarmHeartbeat from '../components/common/VercelSwarmHeartbeat';
import EcosystemNav from '../components/layout/EcosystemNav';
import EcosystemFooter from '../components/layout/EcosystemFooter';
import { logger } from '../lib/logger';
import '../styles/globals.css';

// Get manifestUrl from environment variable or use fallback
const getManifestUrl = (): string => {
  if (typeof window !== 'undefined') {
    // Check for environment variable in browser
    const envUrl = process.env.NEXT_PUBLIC_TONCONNECT_MANIFEST_URL;
    if (envUrl?.startsWith('https://')) {
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
        logger.info('Telegram WebApp initialized');
        logger.debug('Theme: ' + JSON.stringify(webApp.themeParams));
        logger.debug('Color scheme: ' + webApp.colorScheme);
      } else {
        logger.info('Not running in Telegram WebApp');
      }

      setIsMounted(true);

      // Global unhandled rejection handler - log but don't crash
      const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
        logger.error('[Unhandled Rejection]', event.reason);
      };
      window.addEventListener('unhandledrejection', handleUnhandledRejection);

      // Register Service Worker for PWA
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            logger.info('Service Worker registered: ' + registration.scope);
          })
          .catch((error) => {
            logger.error('Service Worker registration failed:', error);
          });
      }

      return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    }
  }, []);

  const manifestUrl = getManifestUrl();

  const colorScheme = getTelegramColorScheme();
  const isLight = colorScheme === 'light';
  const telegramTheme = isTelegramWebApp()
    ? (isLight ? THEME.LIGHT : THEME.DARK)
    : THEME.DARK;

  // Определить язык для TonConnect на основе текущей локали приложения
  const tonConnectLanguage = router.locale === 'en' ? 'en' : 'ru';

  return (
    <ErrorBoundary>
      <TelegramThemeProvider>
        <TonConnectUIProvider
          manifestUrl={manifestUrl}
          actionsConfiguration={{
            twaReturnUrl: 'https://t.me/GstdAppBot/app'
          }}
          restoreConnection={true}
          uiPreferences={{
            theme: telegramTheme,
            borderRadius: 'm'
          }}
          language={tonConnectLanguage}
        >
          {isMounted && <WalletListener />}
          {isMounted && <VercelSwarmHeartbeat />}
          {router.pathname !== '/tma' && <EcosystemNav />}
          <main style={{
            paddingTop: router.pathname === '/tma' ? 0 : 56,
            paddingBottom: 0,
            minHeight: '100vh',
          }}>
            <Component {...pageProps} />
          </main>
          {router.pathname !== '/tma' && router.pathname !== '/chat' && <EcosystemFooter />}
          <Toaster position="top-right" richColors closeButton />
        </TonConnectUIProvider>
      </TelegramThemeProvider>
    </ErrorBoundary>
  );
}

export default appWithTranslation(App);
