/** @type {import('next').NextConfig} */
const { i18n } = require('./next-i18next.config');

const nextConfig = {
  reactStrictMode: true,
  i18n,
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
    TON_NETWORK: process.env.TON_NETWORK || 'mainnet',
    GSTD_JETTON_ADDRESS: process.env.GSTD_JETTON_ADDRESS || '',
  },
  // Production optimizations
  compress: true,
  poweredByHeader: false,
  generateEtags: false,
  // Output standalone for Docker; Vercel ignores this
  ...(process.env.VERCEL ? {} : { output: 'standalone' }),
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
  async rewrites() {
    const apiDest = process.env.VERCEL
      ? 'https://app.gstdtoken.com/api/:path*'
      : 'http://localhost:8080/api/:path*';
    return {
      beforeFiles: [],
      afterFiles: [
        // Exclude /api/chat — handled by Next.js API route (Neural Router)
        { source: '/api/v1/:path*', destination: apiDest.replace('/api/:path*', '/api/v1/:path*') },
      ],
      fallback: [
        // All other /api/* routes go to Go backend
        { source: '/api/:path*', destination: apiDest },
      ],
    };
  },
};

module.exports = nextConfig;
