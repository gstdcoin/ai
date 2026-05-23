/**
 * Centralized configuration for API endpoints
 * Ensures production URLs are used instead of localhost fallbacks
 */

/** Canonical production API host — Next.js serverless routes on Vercel. */
export const PRODUCTION_API_ORIGIN = 'https://app.gstdtoken.com';

/**
 * Base API URL for backend requests
 *
 * Priority:
 * 1. NEXT_PUBLIC_API_URL (set in Vercel env vars)
 * 2. Production: https://app.gstdtoken.com (self — Next.js API routes)
 * 3. Development: http://localhost:3000
 */
export const API_BASE_URL = (() => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  if (process.env.NODE_ENV === 'production') {
    return PRODUCTION_API_ORIGIN;
  }
  return 'http://localhost:3000';
})();

/**
 * Full API URL with /api/v1 prefix
 */
export const API_URL = `${API_BASE_URL}/api/v1`;

/**
 * WebSocket URL for real-time updates
 */
/** WebSocket origin without path; callers append `/ws` where needed. */
export const WS_URL = (() => {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    const u = process.env.NEXT_PUBLIC_WS_URL.replace(/\/+$/, '');
    return u.endsWith('/ws') ? u.slice(0, -3) : u;
  }
  const base = API_BASE_URL
    .replace('https://', 'wss://')
    .replace('http://', 'ws://');
  return base || 'ws://localhost:8080';
})();

/**
 * Check if running in production
 */
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Check if running in development
 */
export const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

/**
 * GSTD Jetton Contract Address on TON
 */
export const GSTD_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_GSTD_CONTRACT || 'EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO';

/**
 * Admin Wallet for platform fees
 */
export const ADMIN_WALLET_ADDRESS = process.env.NEXT_PUBLIC_ADMIN_WALLET || 'UQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqQED';

/**
 * Escrow Contract Address
 */
export const ESCROW_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_CONTRACT || 'EQCucUHZGCr8KwBalmumsITvtMBtc5ZylAfw7sJk5SXpBWVh';

/**
 * Agent Registry Contract Address
 */
export const AGENT_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_AGENT_REGISTRY || 'EQDtWcGCQXLFdh7TmkL5QFbFNYXxL9mjOk4ehmsNFwCtsDoT';

/**
 * DAO Voting Contract Address
 */
export const DAO_VOTING_ADDRESS = process.env.NEXT_PUBLIC_DAO_VOTING || 'EQBa-hyO3JkcRJNyYKKOqBjsQ6KAS-dAHj6rf8KOuH4Jzls5';

/** Public web app origin (Nginx → frontend). Nav links use this off-app. */
export const APP_PUBLIC_ORIGIN = (
  process.env.NEXT_PUBLIC_APP_URL || 'https://app.gstdtoken.com'
).replace(/\/+$/, '');

/** TonAPI-compatible REST base for read-only jetton/TON balances in the browser. */
export const TONAPI_PUBLIC_BASE = (
  process.env.NEXT_PUBLIC_TONAPI_URL || 'https://tonapi.io'
).replace(/\/+$/, '');

/** B2B RPC gateway (multi-chain JSON-RPC); must match backend routes_b2b_clients copy. */
export const RPC_GATEWAY_PUBLIC_BASE = (
  process.env.NEXT_PUBLIC_RPC_GATEWAY_URL || 'https://rpc.gstd.network/v1'
).replace(/\/+$/, '');
