/** @type {import('next').NextConfig} */
const { i18n } = require('./next-i18next.config');

const nextConfig = {
  reactStrictMode: true,
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
  images: {
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
    NEXT_PUBLIC_RPC_GATEWAY_URL: process.env.NEXT_PUBLIC_RPC_GATEWAY_URL || 'https://rpc.gstd.network/v1',
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
          { key: 'X-Frame-Options',           value: 'SAMEORIGIN' },
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
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://app.gstdtoken.com https://tonapi.io https://toncenter.com wss: ws:",
              "frame-ancestors 'self'",
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
  // Backed by Upstash Redis (Vercel KV). No separate Go backend.
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
    ];
  },

};

module.exports = nextConfig;
