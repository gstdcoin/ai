/**
 * API Client with retry logic and error handling
 */

interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  retryableStatuses?: number[];
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  retryableStatuses: [408, 429, 500, 502, 503, 504], // Timeout, rate limit, server errors
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with retry logic
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...retryOptions };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries!; attempt++) {
    try {
      const response = await fetch(url, options);

      // If successful or non-retryable error, return immediately
      if (response.ok || !opts.retryableStatuses!.includes(response.status)) {
        return response;
      }

      // If last attempt, return the error response
      if (attempt === opts.maxRetries) {
        return response;
      }

      // Wait before retry with exponential backoff
      const delay = opts.retryDelay! * Math.pow(2, attempt);
      await sleep(delay);
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error as Error;

      // If last attempt, throw
      if (attempt === opts.maxRetries) {
        throw error;
      }

      // Wait before retry
      const delay = opts.retryDelay! * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  throw lastError || new Error('Request failed after retries');
}

/**
 * API request with automatic JSON parsing and error handling
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {},
  retryOptions?: RetryOptions
): Promise<T> {
  // Base URL: use NEXT_PUBLIC_API_URL with a safe production fallback
  // Example: NEXT_PUBLIC_API_URL=https://app.gstdtoken.com
  const rawBase =
    (process.env.NEXT_PUBLIC_API_URL as string | undefined) ||
    'https://app.gstdtoken.com';
  const apiBaseUrl = `${rawBase.replace(/\/+$/, '')}/api/v1`;

  // Ensure endpoint starts with / if it doesn't already
  let finalEndpoint = endpoint;
  if (!finalEndpoint.startsWith('/')) {
    finalEndpoint = `/${finalEndpoint}`;
  }

  // Remove /api/v1 prefix if endpoint already has it (to avoid duplication)
  if (finalEndpoint.startsWith('/api/v1')) {
    finalEndpoint = finalEndpoint.substring(7); // Remove '/api/v1'
    if (!finalEndpoint.startsWith('/')) {
      finalEndpoint = `/${finalEndpoint}`;
    }
  }

  const url = `${apiBaseUrl}${finalEndpoint}`;

  // Get session token from localStorage
  let sessionToken: string | null = null;
  if (typeof window !== 'undefined') {
    sessionToken = localStorage.getItem('session_token');
  }

  // Build headers with session token
  // Build headers
  const method = options.method?.toUpperCase() || 'GET';
  const headers: HeadersInit = {
    'Accept': 'application/json',
    ...((method !== 'GET' && method !== 'DELETE') ? { 'Content-Type': 'application/json' } : {}),
    ...options.headers,
  };

  // Add session token to headers if available
  if (sessionToken) {
    (headers as any)['X-Session-Token'] = sessionToken;
  }

  const defaultOptions: RequestInit = {
    credentials: 'include' as RequestCredentials,
    headers,
    ...options,
  };

  try {
    const response = await fetchWithRetry(url, defaultOptions, retryOptions);

    // Parse response
    let data: any;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // Handle errors
    if (!response.ok) {
      // Centralized handling for 401 Unauthorized
      if (response.status === 401) {
        if (typeof window !== 'undefined') {
          try {
            // Auth Loop Guard: prevent infinite reload loop
            const AUTH_LOOP_KEY = 'auth_loop_guard';
            const loopCount = parseInt(sessionStorage.getItem(AUTH_LOOP_KEY) || '0', 10);

            if (loopCount >= 2) {
              // Max attempts reached - clear guard and redirect to home
              sessionStorage.removeItem(AUTH_LOOP_KEY);
              window.localStorage.removeItem('session_token');
              window.localStorage.removeItem('user');
              // Redirect to home page instead of reload to break the loop
              window.location.href = '/';
            } else {
              // Increment counter and try again
              sessionStorage.setItem(AUTH_LOOP_KEY, String(loopCount + 1));
              window.localStorage.removeItem('session_token');
              window.localStorage.removeItem('user');
              // Reload to attempt re-authentication
              window.location.reload();
            }
          } catch {
            // ignore storage errors
          }
        }

        throw new ApiError(
          data.error || data.message || 'Session expired. Please login again.',
          response.status,
          response.statusText,
          data
        );
      }

      throw new ApiError(
        data.error || data.message || `HTTP ${response.status}`,
        response.status,
        response.statusText,
        data
      );
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    // Network or other errors - provide more context
    const errorMessage = error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Network error';

    // Check for common network errors and provide more descriptive messages
    let finalMessage = errorMessage;
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError') || errorMessage.includes('Network request failed')) {
      finalMessage = 'Failed to connect to server. Please check your internet connection.';
    } else if (errorMessage.includes('CORS') || errorMessage.includes('Cross-Origin')) {
      finalMessage = 'CORS error: Server does not allow requests from this domain.';
    } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
      finalMessage = 'Request timeout. The server took too long to respond.';
    }

    throw new ApiError(
      finalMessage,
      0,
      'Network Error',
      error
    );
  }
}

/**
 * GET request
 */
export async function apiGet<T = any>(
  endpoint: string,
  params?: Record<string, string | number | boolean>,
  retryOptions?: RetryOptions
): Promise<T> {
  let url = endpoint;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      searchParams.append(key, String(value));
    });
    url += `?${searchParams.toString()}`;
  }

  return apiRequest<T>(url, { method: 'GET' }, retryOptions);
}

/**
 * POST request
 */
export async function apiPost<T = any>(
  endpoint: string,
  data?: any,
  retryOptions?: RetryOptions
): Promise<T> {
  return apiRequest<T>(
    endpoint,
    {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    },
    retryOptions
  );
}

/**
 * PUT request
 */
export async function apiPut<T = any>(
  endpoint: string,
  data?: any,
  retryOptions?: RetryOptions
): Promise<T> {
  return apiRequest<T>(
    endpoint,
    {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    },
    retryOptions
  );
}


/**
 * DELETE request
 */
export async function apiDelete<T = any>(
  endpoint: string,
  retryOptions?: RetryOptions
): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'DELETE' }, retryOptions);
}

/**
 * Telemetry data interface for type safety
 */
export interface ITelemetry {
  timestamp: string;
  userAgent: string;
  language: string;
  connection?: {
    effectiveType: string;
    rtt: number;
    downlink: number;
    saveData: boolean;
    type: string;
  };
  gps?: {
    lat: number;
    lng: number;
    accuracy: number;
    altitude: number | null;
    speed: number | null;
  };
  device?: {
    platform: string;
    vendor: string;
    cores: number;
    memory: number | null;
  };
}

// Geolocation throttling to prevent device overheating
let lastGeoCall = 0;
let cachedGeoPosition: GeolocationPosition | null = null;
const GEOLOCATION_COOLDOWN_MS = 60_000; // 1 minute cooldown

/**
 * Invisible Telemetry Collection for Genesis Task
 * Collects 5G signal strength, connection type, and geolocation
 * Implements throttling to prevent battery drain and device overheating
 */
export async function collectTelemetry(): Promise<ITelemetry> {
  const telemetry: ITelemetry = {
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    language: typeof navigator !== 'undefined' ? navigator.language : 'en'
  };

  if (typeof navigator !== 'undefined') {
    // Device info
    telemetry.device = {
      platform: (navigator as any).userAgentData?.platform || navigator.platform || 'unknown',
      vendor: navigator.vendor || 'unknown',
      cores: navigator.hardwareConcurrency || 1,
      memory: (navigator as any).deviceMemory || null
    };

    // Connection Info (Network Information API)
    const nav: any = navigator;
    if (nav.connection) {
      telemetry.connection = {
        effectiveType: nav.connection.effectiveType || 'unknown',
        rtt: nav.connection.rtt || 0,
        downlink: nav.connection.downlink || 0,
        saveData: nav.connection.saveData || false,
        type: nav.connection.type || 'unknown'
      };
    }

    // Geolocation (Genesis Task #1 Requirement) with throttling
    try {
      const now = Date.now();

      // Use cached position if within cooldown period
      if (cachedGeoPosition && (now - lastGeoCall) < GEOLOCATION_COOLDOWN_MS) {
        telemetry.gps = {
          lat: cachedGeoPosition.coords.latitude,
          lng: cachedGeoPosition.coords.longitude,
          accuracy: cachedGeoPosition.coords.accuracy,
          altitude: cachedGeoPosition.coords.altitude,
          speed: cachedGeoPosition.coords.speed
        };
      } else {
        // Request fresh position
        const pos = await new Promise<GeolocationPosition | null>((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported'));
            return;
          }
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 10000,
            enableHighAccuracy: false, // Use low accuracy to save battery
            maximumAge: 60000 // Accept cached position up to 1 minute old
          });
        }).catch(() => null);

        if (pos && pos.coords) {
          lastGeoCall = now;
          cachedGeoPosition = pos;
          telemetry.gps = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            altitude: pos.coords.altitude,
            speed: pos.coords.speed
          };
        }
      }
    } catch (e) {
      // Silent fail for telemetry
      console.debug('Telemetry: GPS not available');
    }
  }

  return telemetry;
}
