import { Html, Head, Main, NextScript, DocumentProps } from 'next/document';

export default function Document(props: DocumentProps) {
  const currentLocale = props.__NEXT_DATA__?.locale || 'en';
  return (
    <Html lang={currentLocale}>
      <Head>
        {/* Mobile viewport optimization */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="GSTD" />
        <meta name="theme-color" content="#030014" />

        {/* PWA Manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" href="/icon.png" />

        {/* Telegram WebApp optimization */}
        <meta name="telegram-web-app" content="yes" />

        {/* SEO */}
        <title>GSTD — Sovereign AI Network</title>
        <meta name="description" content="Decentralized AI platform powered by GSTD token. Run nodes, earn rewards, and access sovereign AI services." />
        <meta property="og:title" content="GSTD — Sovereign AI Network" />
        <meta property="og:description" content="Decentralized AI platform. Run nodes, earn GSTD tokens, bridge cross-chain, and access 163+ AI skills." />
        <meta property="og:image" content="https://platform.gstdtoken.com/og-image.png" />
        <meta property="og:url" content="https://platform.gstdtoken.com" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="GSTD — Sovereign AI Network" />
        <meta name="twitter:description" content="Decentralized AI platform. Run nodes, earn GSTD tokens." />

        {/* Prevent zoom on input focus (iOS) */}
        <meta name="format-detection" content="telephone=no" />
      </Head>
      <body suppressHydrationWarning>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

