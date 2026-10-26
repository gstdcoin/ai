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

    let inFlight = false;
    let disposed = false;
    const poll = async () => {
      if (disposed || !enabledRef.current || document.hidden || inFlight) return;
      inFlight = true;
      try { await callbackRef.current(); } finally { inFlight = false; }
    };
    void poll().catch(() => {});


    const intervalId = setInterval(() => { void poll().catch(() => {}); }, interval);
    return () => { disposed = true; clearInterval(intervalId); };

  }, [interval, enabled]);
}
