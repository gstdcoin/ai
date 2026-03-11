'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { API_BASE_URL } from '../lib/config';

const RECONNECT_DELAY_MS = 5000;
const STUCK_THRESHOLD_MS = 5000;
const NO_DATA_WARNING_MS = 2 * 60 * 1000; // Ticker Diagnostics: 2 min
const SUPREME_ALPHA_THRESHOLD = 30; // Guardian Mode: Critical Alerting
const SUPREME_PULSE_DURATION_MS = 15000; // Pulse for 15s after Supreme Opportunity
const TAB_HIDDEN_THROTTLE_MS = 3000; // Energy Efficiency: update every 3s when tab hidden

/** Parse Alpha % from "🔱 Alpha found: +X%" — Guardian Mode: Supreme Opportunity */
function parseAlphaFromMessage(msg: string): number | null {
  const m = msg.match(/Alpha found: \+([\d.]+)%/);
  return m ? parseFloat(m[1]) : null;
}

/**
 * Leviathan Live Stream Ticker — Protocol: Live Stream + Visual Confirmation + Guardian Mode
 * Ticker Diagnostics: if no data for 2 min with open connection → local warning
 * UI Layering: position fixed, top 0, full width — above all elements
 * Guardian Mode: Critical Alerting (Alpha 30%+ pulse), Energy Efficiency (throttle when tab hidden)
 */
/** Omnipresence: Multilingual Ticker — translate key phrases, keep technical terms (Alpha, Int-Logic, Verified) */
function translateTickerMessage(msg: string, t: any): string {
  if (msg.startsWith('🔍 Scan:')) return '🔍 ' + t('ticker_scan', 'Scan') + ': ' + msg.slice(8);
  if (msg.includes('Alpha found:')) return msg.replace('Alpha found:', t('ticker_alpha', 'Alpha found') + ':');
  if (msg.startsWith('🎓 Learning:')) return '🎓 ' + t('ticker_learning', 'Learning') + ': ' + msg.slice(12);
  if (msg.startsWith('🧠 Recall:')) return '🧠 ' + t('ticker_recall', 'Recall') + ': ' + msg.slice(10);
  if (msg.includes('System Heartbeat:')) return msg.replace('System Heartbeat:', t('ticker_heartbeat', 'System Heartbeat') + ':');
  if (msg.startsWith('Bank Vault:')) return t('ticker_bank_vault', 'Bank Vault') + ': ' + msg.slice(11);
  if (msg.includes('Golden Pattern Match:')) return msg.replace('Golden Pattern Match:', t('ticker_golden_match', 'Golden Pattern Match') + ':');
  if (msg.includes('No data from Leviathan')) return t('ticker_no_data', 'No data from Leviathan. Check Backend Pollers.');
  if (msg.includes('АРХИТЕКТОР, СИСТЕМА СТАЛА ПРОЗРАЧНОЙ')) return t('ticker_architect_ready', 'Leviathan Live Stream — АРХИТЕКТОР, СИСТЕМА СТАЛА ПРОЗРАЧНОЙ');
  if (msg.includes('ЛЕВИАФАН ИЩЕТ СИГНАЛ')) return t('ticker_seeking', 'STATUS: LEVIATHAN SEEKING SIGNAL...');
  if (msg.startsWith('⏱ Temporal Precision:')) {
    const m = msg.match(/predicted (\d+\.?\d*)h, actual (\d+\.?\d*)h/);
    const predicted = m ? m[1] : '?';
    const actual = m ? m[2] : '?';
    return '⏱ ' + (t('ticker_temporal_precision', 'Temporal Precision: predicted {{predicted}}h, actual {{actual}}h (refined)') || 'Temporal Precision') + `: predicted ${predicted}h, actual ${actual}h`;
  }
  if (msg.includes('Информационный вакуум') || msg.includes('Information vacuum')) {
    return '⚠️ ' + t('ticker_integrity_guard', 'Information vacuum: Trusting only Code and Oracles');
  }
  if (msg.includes('Integrity Check') && msg.includes('All systems nominal')) {
    return '✅ ' + t('ticker_integrity_check', 'Integrity Check: All systems nominal. Digital Hygiene: 100%. IQ: Evolving.');
  }
  if (msg.includes('IQ Level Up') && msg.includes('Network Intelligence reached')) {
    return msg; // Singularity Gateway: IQ Milestone — keep as-is
  }
  if (msg.includes('Omnipotence: Autonomous Expansion')) return msg;
  if (msg.includes('Golden Age Verification') && msg.includes('Intelligence backed by')) return msg;
  if (msg.startsWith('🔮 Прогноз:') || msg.startsWith('🔮 Forecast:')) {
    const m = msg.match(/через (\d+)|in (\d+)|(\d+)\s*ч|(\d+)\s*часов/);
    const hours = m ? (m[1] || m[2] || m[3] || m[4] || '?') : '?';
    const c = msg.match(/\((\d+)\s*(цепочек|chains)\)/);
    const count = c ? c[1] : '?';
    return '🔮 ' + (t('ticker_forecast', 'Forecast: Expecting market reaction in {{hours}}h based on experience ({{coun...') || 'Forecast') + `: ${hours}h (${count} chains)`;
  }
  return msg;
}

export default function LeviathanLiveTicker() {
  const { t } = useTranslation('common');
  const [items, setItems] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [noDataWarning, setNoDataWarning] = useState(false);
  const [supremeOpportunity, setSupremeOpportunity] = useState(false);
  const tabVisibleRef = useRef(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const connectTimeRef = useRef<number>(0);
  const lastMessageTimeRef = useRef<number>(0);
  const connectionOpenRef = useRef<boolean>(false);
  const supremeUntilRef = useRef<number>(0);
  const pendingItemsRef = useRef<string[]>([]);
  const throttleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectRef = useRef<() => void>(() => { });

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    connectionOpenRef.current = false;
    const url = `${API_BASE_URL}/api/v1/leviathan/stream`;
    const es = new EventSource(url);
    esRef.current = es;
    connectTimeRef.current = Date.now();

    es.onopen = () => {
      connectionOpenRef.current = true;
      lastMessageTimeRef.current = Date.now();
      setConnectionState('open');
    };

    es.onmessage = (e) => {
      const msg = e.data?.trim();
      if (msg && !msg.startsWith(':')) {
        lastMessageTimeRef.current = Date.now();
        setNoDataWarning(false);
        // Guardian Mode: Critical Alerting — Alpha >= 30% = Supreme Opportunity
        const alpha = parseAlphaFromMessage(msg);
        if (alpha !== null && alpha >= SUPREME_ALPHA_THRESHOLD) {
          setSupremeOpportunity(true);
          supremeUntilRef.current = Date.now() + SUPREME_PULSE_DURATION_MS;
        }
        // Energy Efficiency: when tab hidden, batch updates; when visible, update immediately
        if (tabVisibleRef.current) {
          setItems((prev) => [...prev.slice(-49), msg]);
        } else {
          pendingItemsRef.current = [...pendingItemsRef.current.slice(-49), msg];
        }
      }
    };

    es.onerror = () => {
      connectionOpenRef.current = false;
      setConnectionState('closed');
      es.close();
      esRef.current = null;
      // Auto-Reconnect: hard restart after 5s
      setTimeout(() => connectRef.current(), RECONNECT_DELAY_MS);
    };

    connectRef.current = connect;
    return es;
  }, []);

  // Guardian Mode: Energy Efficiency — visibility API
  useEffect(() => {
    const onVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      tabVisibleRef.current = visible;
      if (visible) {
        // Flush pending when tab becomes visible
        if (pendingItemsRef.current.length > 0) {
          setItems((prev) => {
            const merged = [...prev, ...pendingItemsRef.current].slice(-50);
            pendingItemsRef.current = [];
            return merged;
          });
        }
        if (throttleTimerRef.current) {
          clearInterval(throttleTimerRef.current);
          throttleTimerRef.current = null;
        }
      } else {
        // When hidden: flush pending every 3s via RAF-friendly interval
        throttleTimerRef.current = setInterval(() => {
          if (pendingItemsRef.current.length > 0) {
            setItems((prev) => {
              const merged = [...prev, ...pendingItemsRef.current].slice(-50);
              pendingItemsRef.current = [];
              return merged;
            });
          }
        }, TAB_HIDDEN_THROTTLE_MS);
      }
    };
    tabVisibleRef.current = document.visibilityState === 'visible';
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (throttleTimerRef.current) {
        clearInterval(throttleTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    connect();

    const checkStuck = setInterval(() => {
      const es = esRef.current;
      if (!es) return;
      const elapsed = Date.now() - connectTimeRef.current;
      if ((es.readyState === EventSource.CLOSED || es.readyState === EventSource.CONNECTING) && elapsed > STUCK_THRESHOLD_MS) {
        connect();
        connectTimeRef.current = Date.now();
      }
    }, 2000);

    // Ticker Diagnostics: no data for 2 min with open connection → warning
    const checkNoData = setInterval(() => {
      if (!connectionOpenRef.current) return;
      const sinceLast = Date.now() - lastMessageTimeRef.current;
      if (sinceLast > NO_DATA_WARNING_MS) {
        setNoDataWarning(true);
      }
    }, 10000);

    // Guardian Mode: clear Supreme Opportunity pulse after duration
    const checkSupreme = setInterval(() => {
      if (supremeUntilRef.current > 0 && Date.now() > supremeUntilRef.current) {
        supremeUntilRef.current = 0;
        setSupremeOpportunity(false);
      }
    }, 2000);

    return () => {
      clearInterval(checkStuck);
      clearInterval(checkNoData);
      clearInterval(checkSupreme);
      connectionOpenRef.current = false;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [connect]);

  const isEmpty = items.length === 0;
  const rawDisplayItems = noDataWarning
    ? ['⚠️ No data from Leviathan. Check Backend Pollers.']
    : isEmpty
      ? (connectionState === 'closed'
        ? ['СТАТУС: ЛЕВИАФАН ИЩЕТ СИГНАЛ...']
        : ['Leviathan Live Stream — АРХИТЕКТОР, СИСТЕМА СТАЛА ПРОЗРАЧНОЙ'])
      : items;
  const displayItems = rawDisplayItems.map((m) => translateTickerMessage(m, t));

  return (
    <div
      className={`overflow-hidden border-b py-2 z-[9999] opacity-100 transition-colors duration-300 ${supremeOpportunity
        ? 'border-amber-500/60 bg-amber-500/10 animate-supreme-pulse'
        : 'border-white/5 bg-black/30'
        }`}
      style={{ position: 'fixed', top: 0, left: 0, width: '100%' }}
    >
      <div
        ref={containerRef}
        className="flex animate-marquee w-max py-1"
        style={{ animationDuration: `${Math.max(20, displayItems.length * 2)}s` }}
      >
        {displayItems.map((msg, i) => (
          <span
            key={`${i}-${msg.slice(0, 20)}`}
            className={`text-[11px] px-4 shrink-0 flex items-center gap-2 ${isEmpty ? 'text-gray-500' : 'text-gray-400'}`}
          >
            {msg}
            <span className="text-white/20">•</span>
          </span>
        ))}
        {displayItems.map((msg, i) => (
          <span
            key={`dup-${i}-${msg.slice(0, 20)}`}
            className={`text-[11px] px-4 shrink-0 flex items-center gap-2 ${isEmpty ? 'text-gray-500' : 'text-gray-400'}`}
            aria-hidden
          >
            {msg}
            <span className="text-white/20">•</span>
          </span>
        ))}
      </div>
    </div>
  );
}
