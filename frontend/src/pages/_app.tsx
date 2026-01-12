import type { AppProps } from 'next/app';
import { appWithTranslation } from 'next-i18next';
import { TonConnectUIProvider, THEME } from '@tonconnect/ui-react';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { initTelegramWebApp } from '../lib/telegram';
import '../styles/globals.css';

const manifestUrl = 'https://app.gstdtoken.com/tonconnect-manifest.json';

function App({ Component, pageProps }: AppProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // Initialize Telegram WebApp on mount
    if (typeof window !== 'undefined') {
      initTelegramWebApp();
      setIsClient(true);
    }
  }, []);

  return (
    <ErrorBoundary>
      {isClient ? (
        <TonConnectUIProvider 
          manifestUrl={manifestUrl}
          actionsConfiguration={{
            twaReturnUrl: 'https://t.me/gstdtoken_bot'
          }}
          restoreConnection={true}
          uiPreferences={{
            theme: THEME.DARK,
            borderRadius: 'm'
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
      ) : (
        // Render without TonConnectUIProvider during SSR
        <>
          <Component {...pageProps} />
          <Toaster 
            position="top-right"
            richColors
            closeButton
          />
        </>
      )}
    </ErrorBoundary>
  );
}

export default appWithTranslation(App);

