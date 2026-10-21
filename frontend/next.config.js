/** @type {import('next').NextConfig} */
const { i18n } = require('./next-i18next.config');

// HTTP bridge hosts from https://config.ton.org/wallets-v2.json; wallets cannot connect if the browser may not reach them.
const TON_CONNECT_BRIDGES = [
  'api.defiway.com', 'api-node.bybit.com', 'bridge.mirai.app', 'bridge.stower.money', 'bridge.tonapi.io',
  'bridge.uxuy.me', 'bridge.wallet.coffee.agency', 'connect.token.im', 'connect.ton.org', 'connect.tonhubapi.com',
  'dapp.gateio.services', 'go-bridge.tomo.inc', 'sse-bridge.hot-labs.org', 'tc.architecton.su',
  'ton-bridge.safepal.com', 'tonbridge.telegram.org', 'ton-connect.mytokenpocket.vip',
  'ton-connect-bridge.bgwapi.io', 'ton-connect-bridge.echooo.link', 'tonconnectbridge.mytonwallet.org',
  'wallet.binance.com', 'walletbot.me', 'web3.okx.com', 'web3-bridge.kolo.in', 'www.okx.com',
].map((host) => `https://${host}`);

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@upstash/redis'],
  i18n,
  // Production: strip console.* (keep errors/warnings) — smaller bundles, cleaner logs
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? { exclude: ['error', 'warn'] }
        : false,
  },
  // Pages Router inlines getStaticProps (incl. next-i18next `common` ~64KB×locales) in __NEXT_DATA__;
  // default 128kB warns; raise slightly until namespaces are split (layout vs page-specific).
  experimental: {
    largePageDataBytes: 200 * 1024,
  },
  outputFileTracingIncludes: {
    '/*': ['./node_modules/ofetch/dist/**'],
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'app.gstdtoken.com',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
  },
  env: {
    API_URL: process.env.API_URL || 'https://app.gstdtoken.com',
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://app.gstdtoken.com',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'https://app.gstdtoken.com',
    NEXT_PUBLIC_TONAPI_URL: process.env.NEXT_PUBLIC_TONAPI_URL || 'https://tonapi.io',
    TON_NETWORK: process.env.TON_NETWORK || 'mainnet',
    GSTD_JETTON_ADDRESS: process.env.GSTD_JETTON_ADDRESS || '',
  },
  // Production optimizations
  compress: true,
  poweredByHeader: false,
  generateEtags: false,
  // Output standalone for Docker; Vercel ignores this
  // ...(process.env.VERCEL ? {} : { output: 'standalone' }),
  // TypeScript: build will fail on TS errors (tsc --skipLibCheck verified clean)
  typescript: {
    ignoreBuildErrors: false,
  },
  // Webpack polyfills for @ston-fi/sdk and @ton/ton
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        buffer: require.resolve('buffer/'),
        crypto: false,
        stream: false,
        path: false,
        fs: false,
      };
      const webpack = require('webpack');
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
        })
      );
    }
    return config;
  },
  // Turbopack config (Next.js 16+)
  turbopack: {
    resolveAlias: {
      buffer: 'buffer/',
    },
  },
  // PWA configuration
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options',   value: 'nosniff' },
          { key: 'X-XSS-Protection',          value: '1; mode=block' },
          { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://telegram.org https://static.cloudflareinsights.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: https:",
              "font-src 'self' data: https://fonts.gstatic.com",
              // TonConnect loads the wallet list from config.ton.org and talks to each wallet's HTTP bridge.
              `connect-src 'self' https://app.gstdtoken.com https://tonapi.io https://toncenter.com https://api.github.com https://config.ton.org https://cloudflareinsights.com ${TON_CONNECT_BRIDGES.join(' ')} wss: ws:`,
              "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org https://t.me",
            ].join('; '),
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/manifest+json',
          },
        ],
      },
      // Omega Point: CDN resilience - long cache for hashed static assets (browser independence)
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  // No rewrites — all /api/v1/* are served by Next.js serverless functions.
  // Backed by Upstash Redis REST API. No separate Go backend.
  async redirects() {
    return [
      { source: '/bridge',   destination: '/nodes', permanent: true },
      { source: '/swap',     destination: '/nodes', permanent: true },
      { source: '/agents',   destination: '/chat',  permanent: true },
      { source: '/agent',    destination: '/chat',  permanent: true },
      { source: '/staking',  destination: '/nodes', permanent: true },
      { source: '/fund',     destination: '/stats', permanent: true },
      { source: '/operator', destination: '/nodes', permanent: true },
      { source: '/hive',     destination: '/chat',  permanent: true },
      { source: '/about',     destination: '/',      permanent: true },
      { source: '/campaigns', destination: '/nodes', permanent: true },
      { source: '/manifesto', destination: '/docs',  permanent: true },
      { source: '/import',    destination: '/docs',  permanent: true },
      { source: '/training',  destination: '/',      permanent: true },
      { source: '/developers', destination: '/docs', permanent: true },
      { source: '/network',   destination: '/stats', permanent: true },
      { source: '/models',    destination: '/chat',  permanent: true },
    ];
  },

};

module.exports = nextConfig;
