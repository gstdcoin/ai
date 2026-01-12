import { useEffect, useRef } from 'react';

/**
 * Custom hook for polling with pause/resume functionality
 * @param callback Function to call on each poll
 * @param interval Polling interval in milliseconds
 * @param enabled Whether polling is enabled (pauses when false)
 */
export function usePolling(
  callback: () => void | Promise<void>,
  interval: number,
  enabled: boolean = true
) {
  const callbackRef = useRef(callback);
  const enabledRef = useRef(enabled);

  // Keep refs up to date
  useEffect(() => {
    callbackRef.current = callback;
    enabledRef.current = enabled;
  }, [callback, enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Call immediately on mount/enable
    callbackRef.current();

    const intervalId = setInterval(() => {
      if (enabledRef.current) {
        callbackRef.current();
      }
    }, interval);

    return () => clearInterval(intervalId);
  }, [interval, enabled]);
}
