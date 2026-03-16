import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { ArrowDownUp, Zap, ExternalLink, RefreshCw, AlertCircle, Wallet } from 'lucide-react';
import { useTonWallet, TonConnectButton } from '@tonconnect/ui-react';
import { API_BASE_URL } from '../lib/config';

const GSTD_JETTON = 'EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO';

interface QuoteData {
  amount_in: number;
  rate: number;
  gstd_amount: number;
  price_impact: string;
  min_amount_out: string;
  amount_out: string;
}

export default function SwapPage() {
  const { t } = useTranslation('common');
  const tonWallet = useTonWallet();
  const walletAddress = tonWallet?.account?.address || '';
  const [direction, setDirection] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('1');
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(false);
  const [gstdPrice, setGstdPrice] = useState<number>(0);
  const [balance, setBalance] = useState<number>(0);

  const fetchQuote = useCallback(async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setQuote(null); return; }
    setLoading(true);
    try {
      const from = direction === 'buy' ? 'TON' : 'GSTD';
      const to = direction === 'buy' ? 'GSTD' : 'TON';
      const res = await fetch(`${API_BASE_URL}/api/v1/market/quote?from=${from}&to=${to}&amount=${amt}`);
      if (res.ok) {
        const data = await res.json();
        setQuote(data);
      }
    } catch (e) {
      console.error('Quote error:', e);
    }
    setLoading(false);
  }, [amount, direction]);

  // Fetch price on load
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/network/stats`)
      .then(r => r.json())
      .then(d => { if (d.gstd_price_usd > 0) setGstdPrice(d.gstd_price_usd); })
      .catch(() => {});
  }, []);

  // Fetch GSTD balance when wallet connected
  useEffect(() => {
    if (!walletAddress) { setBalance(0); return; }
    fetch(`${API_BASE_URL}/api/v1/wallet/balance?wallet=${encodeURIComponent(walletAddress)}`)
      .then(r => r.json())
      .then(d => setBalance((d.gstd_balance || 0) + (d.pending_earnings || 0)))
      .catch(() => {});
  }, [walletAddress]);

  // Debounce quote fetch
  useEffect(() => {
    const timer = setTimeout(fetchQuote, 500);
    return () => clearTimeout(timer);
  }, [fetchQuote]);

  const flipDirection = () => {
    setDirection(d => d === 'buy' ? 'sell' : 'buy');
    setQuote(null);
  };

  const openStonFi = () => {
    const amt = parseFloat(amount);
    if (!amt) return;
    let url: string;
    if (direction === 'buy') {
      // TON → GSTD
      const nanoTon = Math.floor(amt * 1e9);
      url = `https://app.ston.fi/swap?ft=TON&tt=${GSTD_JETTON}&ta=${nanoTon}`;
    } else {
      // GSTD → TON
      const nanoGstd = Math.floor(amt * 1e9);
      url = `https://app.ston.fi/swap?ft=${GSTD_JETTON}&tt=TON&ta=${nanoGstd}`;
    }
    window.open(url, '_blank');
  };

  const fromToken = direction === 'buy' ? 'TON' : 'GSTD';
  const toToken = direction === 'buy' ? 'GSTD' : 'TON';
  const outputAmount = quote ? quote.gstd_amount || quote.rate : 0;
  const priceImpact = quote ? parseFloat(quote.price_impact || '0') : 0;

  return (
    <div className="min-h-screen bg-[#030014] text-white">
      <Head>
        <title>Swap — GSTD Exchange</title>
        <meta name="description" content="Swap TON for GSTD tokens on StonFi DEX. Decentralized exchange powered by the GSTD network." />
      </Head>
      <EcosystemNav />

      <main className="max-w-lg mx-auto px-4 pt-20 pb-16">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold bg-gradient-to-r from-cyan-400 via-violet-400 to-cyan-300 bg-clip-text text-transparent mb-2">
            💱 {t('swap', 'Swap')}
          </h1>
          <p className="text-gray-400 text-sm">
            {t('swap_desc', 'Trade GSTD ↔ TON via StonFi DEX')}
          </p>
          {gstdPrice > 0 && (
            <p className="text-gray-500 text-xs mt-1">
              1 GSTD ≈ ${gstdPrice.toFixed(6)}
            </p>
          )}
          {/* Wallet status */}
          {walletAddress ? (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <Wallet size={12} className="text-emerald-400" />
              <span className="text-xs text-emerald-300 font-mono">
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </span>
              {balance > 0 && (
                <span className="text-xs text-emerald-400 font-bold">{balance.toFixed(2)} GSTD</span>
              )}
            </div>
          ) : (
            <div className="mt-3">
              <TonConnectButton />
            </div>
          )}
        </div>

        {/* Swap Card */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-xl p-6 space-y-4">
          
          {/* FROM */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-gray-500 font-medium">{t('from', 'From')}</span>
              <span className="text-xs text-gray-500">{fromToken}</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                min="0"
                step="0.1"
                className="flex-1 bg-transparent text-2xl font-bold text-white outline-none placeholder-gray-600"
                style={{ appearance: 'textfield' }}
              />
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  fromToken === 'TON' ? 'bg-blue-500' : 'bg-gradient-to-br from-violet-500 to-cyan-500'
                }`}>
                  {fromToken === 'TON' ? '💎' : 'G'}
                </div>
                <span className="font-bold text-sm">{fromToken}</span>
              </div>
            </div>
          </div>

          {/* Flip Button */}
          <div className="flex justify-center -my-2 relative z-10">
            <button
              onClick={flipDirection}
              className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center hover:bg-violet-500/30 transition-all hover:scale-110 active:scale-95"
            >
              <ArrowDownUp size={18} className="text-violet-400" />
            </button>
          </div>

          {/* TO */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-gray-500 font-medium">{t('to', 'To')}</span>
              <span className="text-xs text-gray-500">{toToken}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 text-2xl font-bold">
                {loading ? (
                  <RefreshCw size={20} className="animate-spin text-gray-500" />
                ) : outputAmount > 0 ? (
                  <span className="text-emerald-400">{outputAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                ) : (
                  <span className="text-gray-600">0.0</span>
                )}
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  toToken === 'TON' ? 'bg-blue-500' : 'bg-gradient-to-br from-violet-500 to-cyan-500'
                }`}>
                  {toToken === 'TON' ? '💎' : 'G'}
                </div>
                <span className="font-bold text-sm">{toToken}</span>
              </div>
            </div>
          </div>

          {/* Quote Details */}
          {quote && (
            <div className="rounded-xl bg-white/[0.02] border border-white/5 p-3 space-y-2 text-xs">
              <div className="flex justify-between text-gray-400">
                <span>Rate</span>
                <span className="text-gray-300">
                  1 {fromToken} ≈ {(outputAmount / (parseFloat(amount) || 1)).toLocaleString(undefined, { maximumFractionDigits: 4 })} {toToken}
                </span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Price Impact</span>
                <span className={priceImpact > 1 ? 'text-red-400' : 'text-emerald-400'}>
                  {priceImpact.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Min received</span>
                <span className="text-gray-300">
                  {(parseInt(quote.min_amount_out || '0') / 1e9).toLocaleString(undefined, { maximumFractionDigits: 6 })} {toToken}
                </span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Provider</span>
                <span className="text-cyan-400 font-medium">StonFi DEX</span>
              </div>
            </div>
          )}

          {/* Swap Button */}
          <button
            onClick={openStonFi}
            disabled={!amount || parseFloat(amount) <= 0}
            className="w-full py-4 rounded-2xl font-extrabold text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{
              background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
              color: 'white',
            }}
          >
            <Zap size={18} />
            {t('swap_on_stonfi', 'Swap on StonFi')}
            <ExternalLink size={14} />
          </button>

          {/* Info */}
          <div className="flex items-start gap-2 text-[11px] text-gray-500 leading-relaxed">
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-gray-600" />
            <span>
              {t('swap_info', 'Swap is executed directly on StonFi DEX. Connect your TON wallet (Tonkeeper, MyTonWallet) to complete the transaction. No intermediaries.')}
            </span>
          </div>
        </div>

        {/* Quick Buy Amounts */}
        {direction === 'buy' && (
          <div className="mt-6 grid grid-cols-4 gap-2">
            {['0.5', '1', '5', '10'].map(val => (
              <button
                key={val}
                onClick={() => setAmount(val)}
                className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                  amount === val
                    ? 'border-violet-400/50 bg-violet-400/10 text-violet-300'
                    : 'border-white/5 bg-white/[0.02] text-gray-500 hover:border-white/10'
                }`}
              >
                {val} TON
              </button>
            ))}
          </div>
        )}

        {/* External Links */}
        <div className="mt-8 flex justify-center gap-6 text-xs">
          <a
            href={`https://app.ston.fi/swap?ft=TON&tt=${GSTD_JETTON}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400/60 hover:text-cyan-400 transition-colors flex items-center gap-1"
          >
            StonFi <ExternalLink size={10} />
          </a>
          <a
            href={`https://tonviewer.com/${GSTD_JETTON}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
          >
            Token Info <ExternalLink size={10} />
          </a>
        </div>
      </main>
    </div>
  );
}

export async function getStaticProps({ locale }: { locale: string }) {
  return {
    props: { ...(await serverSideTranslations(locale ?? 'en', ['common'])) },
  };
}
