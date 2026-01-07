import type { AppProps } from 'next/app';
import { appWithTranslation } from 'next-i18next';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { useEffect } from 'react';
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
    <TonConnectUIProvider 
      manifestUrl={manifestUrl}
      actionsConfiguration={{
        twaReturnUrl: 'https://t.me/gstdtoken_bot'
      }}
    >
      <Component {...pageProps} />
    </TonConnectUIProvider>
  );
}

export default appWithTranslation(App);

