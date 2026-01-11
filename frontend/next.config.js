/** @type {import('next').NextConfig} */
const { i18n } = require('./next-i18next.config');

const nextConfig = {
  reactStrictMode: true,
  i18n,
  images: {
    domains: ['localhost', 'app.gstdtoken.com'],
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
  // Output standalone for Docker
  output: 'standalone',
};

module.exports = nextConfig;
