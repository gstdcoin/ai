import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="ru">
      <Head>
        {/* Mobile viewport optimization */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="GSTD" />
        <meta name="theme-color" content="#0a1929" />
        
        {/* PWA Manifest */}
        <link rel="manifest" href="/manifest.json" />
        
        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" href="/icon.png" />
        
        {/* Telegram WebApp optimization */}
        <meta name="telegram-web-app" content="yes" />
        
        {/* Prevent zoom on input focus (iOS) */}
        <meta name="format-detection" content="telephone=no" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

