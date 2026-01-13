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
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add session token to headers if available
  if (sessionToken) {
    headers['X-Session-Token'] = sessionToken;
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

    // Network or other errors
    throw new ApiError(
      error instanceof Error ? error.message : 'Network error',
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

