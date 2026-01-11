import type { AppProps } from 'next/app';
import { appWithTranslation } from 'next-i18next';
import { TonConnectUIProvider, THEME } from '@tonconnect/ui-react';
import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { initTelegramWebApp } from '../lib/telegram';
import '../styles/globals.css';

const manifestUrl = 'https://app.gstdtoken.com/tonconnect-manifest.json';

function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // Initialize Telegram WebApp on mount
    if (typeof window !== 'undefined') {
      initTelegramWebApp();
    }
  }, []);

  return (
    <ErrorBoundary>
      <TonConnectUIProvider 
        manifestUrl={manifestUrl}
        actionsConfiguration={{
          twaReturnUrl: 'https://t.me/gstdtoken_bot'
        }}
        restoreConnection={true}
        uiPreferences={{
          theme: THEME.DARK,
          borderRadius: 'm',
          colorsSet: {
            [THEME.DARK]: {
              connectButton: {
                background: '#FFD700',
                foreground: '#0a1929'
              }
            }
          }
        }}
        language="ru"
      >
        <Component {...pageProps} />
        <Toaster 
          position="top-right"
          richColors
          closeButton
        />
      </TonConnectUIProvider>
    </ErrorBoundary>
  );
}

export default appWithTranslation(App);

