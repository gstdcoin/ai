// ═══════════════════════════════════════════════════════════════
// GSTD Price Chart — TradingView Lightweight Charts (awesome-charting)
// Professional candlestick + volume chart for GSTD price
// Source: https://github.com/nicedoc/awesome-charting
// ═══════════════════════════════════════════════════════════════
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type Time,
} from 'lightweight-charts';

interface PriceChartProps {
  height?: number;
  showVolume?: boolean;
  title?: string;
}

// Generate realistic GSTD price history (will be replaced with real API data)
function generatePriceData(days: number = 90): { candles: CandlestickData<Time>[]; volumes: HistogramData<Time>[] } {
  const candles: CandlestickData<Time>[] = [];
  const volumes: HistogramData<Time>[] = [];
  
  let price = 0.028; // Starting price in USD
  const now = Math.floor(Date.now() / 1000);
  const daySeconds = 86400;
  
  for (let i = days; i >= 0; i--) {
    const time = (now - i * daySeconds) as Time;
    const volatility = 0.03 + Math.random() * 0.05;
    const trend = Math.sin(i / 15) * 0.01 + 0.002;
    
    const open = price;
    const change = (Math.random() - 0.45) * volatility + trend;
    const close = Math.max(0.001, price * (1 + change));
    const high = Math.max(open, close) * (1 + Math.random() * 0.02);
    const low = Math.min(open, close) * (1 - Math.random() * 0.02);
    
    candles.push({ time, open, high, low, close });
    
    const volume = 50000 + Math.random() * 200000;
    const color = close >= open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)';
    volumes.push({ time, value: volume, color });
    
    price = close;
  }
  
  return { candles, volumes };
}

export default function PriceChart({ height = 400, showVolume = true, title = 'GSTD/USD' }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [currentPrice, setCurrentPrice] = useState('0.000');
  const [priceChange, setPriceChange] = useState(0);

  const initChart = useCallback(() => {
    if (!containerRef.current) return;

    // Clean up existing chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8892b0',
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(136, 146, 176, 0.06)' },
        horzLines: { color: 'rgba(136, 146, 176, 0.06)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(212, 175, 55, 0.4)', width: 1, style: 2 },
        horzLine: { color: 'rgba(212, 175, 55, 0.4)', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: 'rgba(136, 146, 176, 0.1)',
      },
      timeScale: {
        borderColor: 'rgba(136, 146, 176, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth,
      height: height,
    });

    chartRef.current = chart;

    // Candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderDownColor: '#ef5350',
      borderUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      wickUpColor: '#26a69a',
    });

    const { candles, volumes } = generatePriceData(90);
    candleSeries.setData(candles);

    // Volume histogram
    if (showVolume) {
      const volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
      volumeSeries.setData(volumes);
    }

    // Set current price from last candle
    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];
    if (lastCandle && prevCandle) {
      setCurrentPrice(lastCandle.close.toFixed(4));
      const change = ((lastCandle.close - prevCandle.close) / prevCandle.close) * 100;
      setPriceChange(change);
    }

    // Subscribe to crosshair move for tooltip
    chart.subscribeCrosshairMove((param) => {
      if (param.time) {
        const data = param.seriesData.get(candleSeries) as CandlestickData<Time> | undefined;
        if (data) {
          setCurrentPrice(data.close.toFixed(4));
          const change = ((data.close - data.open) / data.open) * 100;
          setPriceChange(change);
        }
      }
    });

    chart.timeScale().fitContent();

    // Resize handler
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [height, showVolume]);

  useEffect(() => {
    const cleanup = initChart();
    return () => cleanup?.();
  }, [initChart]);

  return (
    <div style={{
      background: 'rgba(10, 25, 41, 0.6)',
      borderRadius: '16px',
      border: '1px solid rgba(212, 175, 55, 0.15)',
      padding: '1.5rem',
      backdropFilter: 'blur(10px)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <span style={{ color: '#8892b0', fontSize: '0.85rem' }}>{title}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
            <span style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700 }}>
              ${currentPrice}
            </span>
            <span style={{
              color: priceChange >= 0 ? '#26a69a' : '#ef5350',
              fontSize: '0.9rem',
              fontWeight: 600,
            }}>
              {priceChange >= 0 ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)}%
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {['1D', '1W', '1M', '3M'].map((period) => (
            <button key={period} style={{
              padding: '4px 12px',
              borderRadius: '8px',
              border: period === '3M' ? '1px solid rgba(212, 175, 55, 0.5)' : '1px solid rgba(136, 146, 176, 0.2)',
              background: period === '3M' ? 'rgba(212, 175, 55, 0.1)' : 'transparent',
              color: period === '3M' ? '#d4af37' : '#8892b0',
              fontSize: '0.75rem',
              cursor: 'pointer',
              fontWeight: 500,
            }}>
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Container */}
      <div ref={containerRef} />
    </div>
  );
}
