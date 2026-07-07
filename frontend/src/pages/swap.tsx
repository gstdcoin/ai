import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { getCommonStaticProps } from '../lib/i18n-static-props';
import { ArrowDownUp, RefreshCw, AlertCircle, Wallet, Loader2, ExternalLink } from 'lucide-react';
import { useTonAddress, useTonConnectUI, TonConnectButton } from '@tonconnect/ui-react';
import { API_BASE_URL, GSTD_CONTRACT_ADDRESS } from '../lib/config';

const GSTD_JETTON = GSTD_CONTRACT_ADDRESS;
const TON_NATIVE  = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';

type SwapStatus = 'idle' | 'simulating' | 'simulated' | 'swapping' | 'success' | 'error';

interface SimResult {
  offerUnits: string;
  askUnits: string;
  minAskUnits: string;
  offerAddress: string;
  askAddress: string;
  priceImpact: string;
  swapRate: string;
  feePercent: string;
  routerAddress: string;
  router: any;
}

// Direct StonFi API call (more reliable than SDK in browser)
async function stonfiSimulate(offerAddr: string, askAddr: string, units: string): Promise<any> {
  const params = new URLSearchParams({
    offer_address: offerAddr,
    ask_address: askAddr,
    units,
    slippage_tolerance: '0.01',
  });
  const res = await fetch(`https://api.ston.fi/v1/swap/simulate?${params}`, { method: 'POST' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `StonFi API error: ${res.status}`);
  }
  return res.json();
}

export default function SwapPage() {
  const { t } = useTranslation('common');
  const userAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();

  const [direction, setDirection] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('1');
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [status, setStatus] = useState<SwapStatus>('idle');
  const [error, setError] = useState('');
  const [gstdPrice, setGstdPrice] = useState(0);
  const [balance, setBalance] = useState(0);
  const [txHash, setTxHash] = useState('');

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/network/stats`)
      .then(r => r.json())
      .then(d => { if (d.gstd_price_usd > 0) setGstdPrice(d.gstd_price_usd); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!userAddress) { setBalance(0); return; }
    fetch(`${API_BASE_URL}/api/v1/balance/public?wallet=${encodeURIComponent(userAddress)}`)
      .then(r => r.json())
      .then(d => setBalance((d.gstd_balance || 0) + (d.pending_earnings || 0)))
      .catch(() => {});
  }, [userAddress]);

  const fromToken = direction === 'buy' ? 'TON' : 'GSTD';
  const toToken   = direction === 'buy' ? 'GSTD' : 'TON';

  // ─── SIMULATE via direct StonFi API ─────────────────
  const handleSimulate = useCallback(async () => {
    const amt = Number.parseFloat(amount);
    if (!amt || amt <= 0) return;

    setStatus('simulating');
    setError('');
    setSimResult(null);

    try {
      const offerAddr = direction === 'buy' ? TON_NATIVE : GSTD_JETTON;
      const askAddr   = direction === 'buy' ? GSTD_JETTON : TON_NATIVE;
      const offerUnits = Math.floor(amt * 1e9).toString();

      const data = await stonfiSimulate(offerAddr, askAddr, offerUnits);

      setSimResult({
        offerUnits: data.offer_units,
        askUnits: data.ask_units,
        minAskUnits: data.min_ask_units,
        offerAddress: data.offer_address,
        askAddress: data.ask_address,
        priceImpact: data.price_impact || '0',
        swapRate: data.swap_rate || '0',
        feePercent: data.fee_percent || '0',
        routerAddress: data.router_address,
        router: data.router,
      });
      setStatus('simulated');
    } catch (err: any) {
      setError(err?.message || 'No liquidity pool found for this pair');
      setStatus('error');
    }
  }, [amount, direction]);

  // Auto-simulate on change (debounced 1s)
  useEffect(() => {
    if (!amount || Number.parseFloat(amount) <= 0) {
      setSimResult(null);
      setStatus('idle');
      return;
    }
    const timer = setTimeout(handleSimulate, 1000);
    return () => clearTimeout(timer);
  }, [handleSimulate, amount]);

  // ─── SWAP (build TX via SDK + send via TonConnect) ───
  const handleSwap = async () => {
    if (!userAddress || !simResult) {
      setError('Connect wallet and wait for quote');
      return;
    }

    setStatus('swapping');
    setError('');

    try {
      // Dynamic import to avoid SSR issues
      const { dexFactory } = await import('@ston-fi/sdk');
      const { TonClient } = await import('@ton/ton');

      const tonClient = new TonClient({
        endpoint: 'https://toncenter.com/api/v2/jsonRPC',
      });

      const routerInfo = simResult.router;
      const dexContracts = dexFactory(routerInfo);
      const router = tonClient.open(
        dexContracts.Router.create(routerInfo.address)
      );
      const proxyTon = dexContracts.pTON.create(routerInfo.pton_master_address);

      const sharedParams = {
        userWalletAddress: userAddress,
        offerAmount: simResult.offerUnits,
        minAskAmount: simResult.minAskUnits,
      };

      let txParams: any;
      if (direction === 'buy') {
        txParams = await router.getSwapTonToJettonTxParams({
          ...sharedParams,
          proxyTon,
          askJettonAddress: simResult.askAddress,
        });
      } else {
        txParams = await router.getSwapJettonToTonTxParams({
          ...sharedParams,
          proxyTon,
          offerJettonAddress: simResult.offerAddress,
        });
      }

      const result = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{
          address: txParams.to.toString(),
          amount: txParams.value.toString(),
          payload: txParams.body?.toBoc().toString('base64'),
        }],
      });

      setTxHash(result.boc || '');
      setStatus('success');
    } catch (err: any) {
      const msg = err?.message || 'Swap failed';
      if (msg.includes('User rejected') || msg.includes('Cancelled')) {
        setError('Transaction cancelled by user');
      } else {
        setError(msg);
      }
      setStatus('error');
    }
  };

  const flipDirection = () => {
    setDirection(d => d === 'buy' ? 'sell' : 'buy');
    setSimResult(null);
    setStatus('idle');
    setError('');
  };

  const resetSwap = () => {
    setSimResult(null);
    setStatus('idle');
    setError('');
    setTxHash('');
  };

  const outputAmount = simResult ? Number(simResult.askUnits) / 1e9 : 0;
  const minOutput    = simResult ? Number(simResult.minAskUnits) / 1e9 : 0;

  return (
    <div className="min-h-screen bg-[#030014] text-white">
      <Head>
        <title>Swap — GSTD Exchange</title>
        <meta name="description" content="Swap TON ↔ GSTD directly in-app via StonFi DEX." />
      </Head>

      <main className="max-w-md mx-auto px-4 pt-24 pb-16 sovereign-section">
        {/* Header */}
        <div className="text-center mb-8 fu d1">
          <div className="sec-tag violet justify-center inline-flex mb-3">DEX SWAP</div>
          <h1 className="sec-title flex items-center justify-center gap-3">
            <span style={{ fontSize: 32, lineHeight: 1 }}>💱</span> {t('swap', 'Swap')}
          </h1>
          <p className="sec-sub mx-auto">
            {t('swap_desc', 'Trade GSTD ↔ TON via StonFi DEX — on-chain, in-app')}
          </p>
          {gstdPrice > 0 && (
            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mt-3">1 GSTD ≈ ${gstdPrice.toFixed(6)}</p>
          )}
        </div>

        {/* Success state */}
        {status === 'success' && (
          <div className="sov-card emerald-top p-8 text-center mb-8 fu d2">
            <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 16 }}>✅</div>
            <h2 className="text-xl font-bold text-emerald-400 mb-2">Swap Submitted!</h2>
            <p className="text-sm text-gray-400 mb-6">
              Transaction sent. Confirmation takes 10-30 seconds.
            </p>
            {txHash && (
              <a href={`https://tonviewer.com/transaction/${txHash}`} target="_blank" rel="noopener noreferrer"
                 className="flex items-center justify-center gap-2 text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors mb-6">
                View on Tonviewer <ExternalLink size={12} />
              </a>
            )}
            <button onClick={resetSwap} className="btn-sovereign ghost mx-auto">New Swap</button>
          </div>
        )}

        {status !== 'success' && (
          <>
            {/* Swap Card */}
            <div className="sov-card !p-6 fu d2 relative mb-6">
              <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl pointer-events-none -z-10" />

              {/* Wallet bar */}
              <div className="flex justify-between items-center mb-6">
                {userAddress ? (
                  <div className="flex items-center gap-2">
                    <Wallet size={14} className="text-emerald-400" />
                    <span className="text-xs font-mono text-emerald-400 font-bold">
                      {userAddress.slice(0, 6)}...{userAddress.slice(-4)}
                    </span>
                    {balance > 0 && (
                      <span className="text-[10px] text-emerald-400/50 bg-emerald-400/10 px-1.5 py-0.5 rounded ml-1">{balance.toFixed(1)} GSTD</span>
                    )}
                  </div>
                ) : (
                  <TonConnectButton />
                )}
                <span className="text-[10px] uppercase font-bold tracking-widest text-cyan-400/50">StonFi v2</span>
              </div>

              {/* FROM input */}
              <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-4 mb-2 hover:bg-white/[0.04] transition-colors">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500">You pay</span>
                  {direction === 'sell' && balance > 0 && (
                    <button onClick={() => setAmount(balance.toString())} className="text-[10px] font-bold text-violet-400 hover:text-violet-300 uppercase tracking-widest bg-transparent border-none cursor-pointer">
                      MAX: {balance.toFixed(2)}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number" value={amount}
                    onChange={(e) => { setAmount(e.target.value); setStatus('idle'); }}
                    placeholder="0.0" min="0" step="0.1"
                    className="flex-1 bg-transparent border-none outline-none text-3xl font-black text-white min-w-0"
                  />
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 shrink-0">
                    <div className="text-lg leading-none">{fromToken === 'TON' ? '💎' : '⚡'}</div>
                    <span className="font-bold text-sm tracking-wide">{fromToken}</span>
                  </div>
                </div>
              </div>

              {/* Flip button */}
              <div className="flex justify-center -my-3 relative z-10">
                <button onClick={flipDirection} className="w-10 h-10 rounded-xl bg-[#030014] border border-white/10 flex items-center justify-center hover:bg-white/5 hover:border-violet-500/30 hover:text-violet-400 transition-all text-gray-400 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                  <ArrowDownUp size={16} />
                </button>
              </div>

              {/* TO output */}
              <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-4 mt-2 hover:bg-white/[0.04] transition-colors">
                <div className="mb-3">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500">You receive</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-3xl font-black min-w-0 overflow-hidden text-gray-500">
                    {(() => {
                      if (status === 'simulating') return <Loader2 size={24} className="text-gray-500 animate-spin" />;
                      if (outputAmount > 0) return <span className="text-emerald-400">{outputAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>;
                      return "0.0";
                    })()}
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 shrink-0">
                    <div className="text-lg leading-none">{toToken === 'TON' ? '💎' : '⚡'}</div>
                    <span className="font-bold text-sm tracking-wide">{toToken}</span>
                  </div>
                </div>
              </div>

              {/* Quote */}
              {simResult && status === 'simulated' && (
                <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4 mt-4 text-xs font-medium space-y-2">
                  {[
                    ['Rate', `1 ${fromToken} ≈ ${(outputAmount / (Number.parseFloat(amount) || 1)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${toToken}`],
                    ['Min received', `${minOutput.toFixed(4)} ${toToken}`],
                    ['Slippage', '1%'],
                    ['Price impact', `${(Number.parseFloat(simResult.priceImpact) * 100).toFixed(4)}%`],
                    ['Route', 'StonFi v2 DEX'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between items-center text-gray-400">
                      <span>{label}</span>
                      <span className={label === 'Route' ? 'text-cyan-400 font-bold' : 'text-gray-300'}>{value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs mt-4">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Action button */}
              <div className="mt-6">
                {(() => {
                  if (!userAddress) {
                    return <div className="flex justify-center"><TonConnectButton /></div>;
                  }
                  if (status === 'swapping') {
                    return (
                      <button disabled className="btn-sovereign w-full !bg-white/5 border border-white/10 text-gray-400">
                        <Loader2 size={16} className="animate-spin mr-2" /> Confirming in wallet...
                      </button>
                    );
                  }
                  if (status === 'simulating') {
                    return (
                      <button disabled className="btn-sovereign w-full !bg-white/5 border border-white/10 text-gray-500 opacity-50">
                        <Loader2 size={16} className="animate-spin mr-2" /> Getting quote...
                      </button>
                    );
                  }
                  if (status === 'simulated' && simResult) {
                    return (
                      <button onClick={handleSwap} className="btn-sovereign emerald w-full">
                        <span style={{ fontSize: 16 }}>⚡</span> Swap {amount} {fromToken} → {outputAmount.toFixed(2)} {toToken}
                      </button>
                    );
                  }
                  return (
                    <button onClick={handleSimulate} disabled={!amount || Number.parseFloat(amount) <= 0} className="btn-sovereign ghost w-full bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed">
                      <RefreshCw size={14} className="mr-2" /> Get Quote
                    </button>
                  );
                })()}
              </div>
            </div>

            {/* Quick amounts */}
            {direction === 'buy' && (
              <div className="grid grid-cols-4 gap-2 mt-4 fu d3">
                {['0.5', '1', '5', '10'].map(val => (
                  <button key={val} onClick={() => { setAmount(val); setStatus('idle'); }}
                    className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                      amount === val ? 'border-violet-500/40 bg-violet-500/10 text-violet-300' : 'border-white/5 bg-white/[0.02] text-gray-400 hover:bg-white/[0.04]'
                    }`}>
                    {val} TON
                  </button>
                ))}
              </div>
            )}

            {/* Info */}
            <div className="flex items-start gap-2 text-[10px] text-gray-500 leading-relaxed p-2 mt-6 fu d4">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              <span>Swap executes on-chain via StonFi DEX. Transaction is signed in your wallet (Tonkeeper/MyTonWallet). 1% slippage protection.</span>
            </div>
          </>
        )}

        {/* Links */}
        <div className="flex justify-center gap-6 text-[10px] mt-8 fu d5">
          <a href={`https://app.ston.fi/swap?ft=TON&tt=${GSTD_JETTON}`} target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-1.5 text-cyan-400/50 hover:text-cyan-400 font-bold transition-colors">
            StonFi <ExternalLink size={10} />
          </a>
          <a href={`https://tonviewer.com/${GSTD_JETTON}`} target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 font-bold transition-colors">
            Contract <ExternalLink size={10} />
          </a>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
      `}} />
    </div>
  );
}

export async function getStaticProps({ locale }: { locale: string }) {
  return {
    props: await getCommonStaticProps(locale),
  };
}
