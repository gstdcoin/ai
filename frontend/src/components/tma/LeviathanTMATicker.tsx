'use client';

/**
 * Total Domination — Leviathan Stream Bridge
 * SSE/WebSocket ticker on ALL TMA screens. Omnipresent.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { API_BASE_URL } from '../../lib/config';

const RECONNECT_DELAY_MS = 5000;
const MAX_ITEMS = 8;

export default function LeviathanTMATicker() {
  const { t } = useTranslation('common');
  const [items, setItems] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const translate = useCallback((msg: string): string => {
    if (msg.includes('Alpha found:')) return msg.replace('Alpha found:', t('ticker_alpha', 'Alpha found') + ':');
    if (msg.includes('No data from Leviathan')) return t('ticker_no_data', 'No data from Leviathan. Check Backend Pollers.');
    if (msg.includes('АРХИТЕКТОР')) return t('ticker_architect_ready', 'Leviathan Live Stream — АРХИТЕКТОР, СИСТЕМА СТАЛА ПРОЗРАЧНОЙ');
    if (msg.includes('ЛЕВИАФАН ИЩЕТ')) return t('ticker_seeking', 'STATUS: LEVIATHAN SEEKING SIGNAL...');
    return msg;
  }, [t]);

  const connectRef = useRef<() => void>(() => { });

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    const url = `${API_BASE_URL}/api/v1/leviathan/stream`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      const msg = e.data?.trim();
      if (msg && !msg.startsWith(':')) {
        setItems((prev) => [...prev.slice(-(MAX_ITEMS - 1)), translate(msg)]);
      }
    };
    es.onerror = () => {
      setConnected(false);
      es.close();
      esRef.current = null;
      setTimeout(() => {
        if (connectRef.current) connectRef.current();
      }, RECONNECT_DELAY_MS);
    };
  }, [translate]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [connect]);

  const displayItems = items.length === 0
    ? [connected ? t('ticker_architect_ready', 'Leviathan Live Stream — АРХИТЕКТОР, СИСТЕМА СТАЛА ПРОЗРАЧНОЙ') : t('ticker_seeking', 'STATUS: LEVIATHAN SEEKING SIGNAL...')]
    : items;

  return (
    <div
      className="overflow-hidden border-b border-white/5 bg-black/40 py-1.5"
      style={{ position: 'sticky', top: 0, zIndex: 9998 }}
    >
      <div
        className="flex animate-marquee w-max py-0.5 text-[10px] text-gray-400"
        style={{ animationDuration: `${Math.max(15, displayItems.length * 2)}s` }}
      >
        {displayItems.map((msg, i) => (
          <span key={`${i}-${msg.slice(0, 15)}`} className="px-3 shrink-0 flex items-center gap-2">
            {msg}
            <span className="text-white/10">•</span>
          </span>
        ))}
        {displayItems.map((msg, i) => (
          <span key={`d-${i}`} className="px-3 shrink-0 flex items-center gap-2" aria-hidden>
            {msg}
            <span className="text-white/10">•</span>
          </span>
        ))}
      </div>
    </div>
  );
}
