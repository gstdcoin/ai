/**
 * Centralized configuration for API endpoints
 * Ensures production URLs are used instead of localhost fallbacks
 */

/**
 * Base API URL for backend requests
 * 
 * Priority:
 * 1. NEXT_PUBLIC_API_URL environment variable (if set)
 * 2. Production URL (https://app.gstdtoken.com) in production mode
 * 3. Development URL (http://localhost:8080) in development mode
 */
export const API_BASE_URL = (() => {
  // Check if environment variable is set
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '');
  }

  // Use production URL in production mode
  if (process.env.NODE_ENV === 'production') {
    return 'https://app.gstdtoken.com';
  }

  // Development fallback
  return 'http://localhost:8080';
})();

/**
 * Full API URL with /api/v1 prefix
 */
export const API_URL = `${API_BASE_URL}/api/v1`;

/**
 * WebSocket URL for real-time updates
 */
export const WS_URL = (() => {
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
