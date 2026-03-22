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
import AutoClaimWorker from '../components/common/AutoClaimWorker';
import { useEcosystemStore } from '../store/ecosystemStore';
import { logger } from '../lib/logger';
import dynamic from 'next/dynamic';
import '../styles/globals.css';

// Lazy-load wallet providers to avoid SSR issues
const WalletProviders = dynamic(() => import('../components/common/WalletProviders'), { ssr: false });

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

  // Start ecosystem data auto-refresh (tokenomics, nodes, staking, queue stats)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const cleanup = useEcosystemStore.getState().startAutoRefresh();
      return cleanup;
    }
  }, []);

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
            twaReturnUrl: 'https://t.me/GstdAppBot/app'
          }}
          restoreConnection={true}
          uiPreferences={{
            theme: telegramTheme,
            borderRadius: 'm'
          }}
          language={tonConnectLanguage}
        >
          <WalletProviders>
            {/* Ambient glow — matches gstdbot.gstdtoken.com aesthetic */}
            <div className="page-glow" aria-hidden="true" />
            {isMounted && <WalletListener />}
            {isMounted && <VercelSwarmHeartbeat />}
            {isMounted && <AutoClaimWorker />}
            {router.pathname !== '/tma' && <EcosystemNav />}
            <main style={{ paddingTop: router.pathname !== '/tma' ? 56 : 0, paddingBottom: router.pathname === '/dashboard' ? 80 : 0, minHeight: '100vh', position: 'relative', zIndex: 1 }}>
              <Component {...pageProps} />
            </main>
            {router.pathname !== '/tma' && router.pathname !== '/dashboard' && router.pathname !== '/chat' && !router.pathname.startsWith('/monitor') && <EcosystemFooter />}
            <Toaster position="top-right" richColors closeButton />
          </WalletProviders>
        </TonConnectUIProvider>
      </TelegramThemeProvider>
    </ErrorBoundary>
  );
}

export default appWithTranslation(App);
