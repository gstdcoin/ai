import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { ArrowDownUp, Zap, RefreshCw, AlertCircle, Wallet, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
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

// eslint-disable-next-line complexity
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
    const amt = parseFloat(amount);
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
      console.error('Simulation failed:', err);
      setError(err?.message || 'No liquidity pool found for this pair');
      setStatus('error');
    }
  }, [amount, direction]);

  // Auto-simulate on change (debounced 1s)
  useEffect(() => {
    if (!amount || parseFloat(amount) <= 0) {
      setSimResult(null);
      setStatus('idle');
      return;
    }
    const timer = setTimeout(handleSimulate, 1000);
    return () => clearTimeout(timer);
  }, [handleSimulate]);

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
      console.error('Swap failed:', err);
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

      <main style={{ maxWidth: 420, margin: '0 auto', padding: '80px 16px 64px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{
            fontSize: 22, fontWeight: 800,
            background: 'linear-gradient(90deg, #22d3ee, #a78bfa, #22d3ee)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            marginBottom: 4,
          }}>
            💱 {t('swap', 'Swap')}
          </h1>
          <p style={{ color: '#6b7280', fontSize: 12 }}>
            {t('swap_desc', 'Trade GSTD ↔ TON via StonFi DEX — on-chain, in-app')}
          </p>
          {gstdPrice > 0 && (
            <p style={{ color: '#4b5563', fontSize: 10, marginTop: 4 }}>1 GSTD ≈ ${gstdPrice.toFixed(6)}</p>
          )}
        </div>

        {/* Success state */}
        {status === 'success' && (
          <div style={{
            borderRadius: 24, border: '1px solid rgba(16,185,129,0.2)',
            background: 'rgba(16,185,129,0.05)', padding: 24, textAlign: 'center', marginBottom: 24,
          }}>
            <CheckCircle2 size={48} style={{ color: '#34d399', margin: '0 auto 12px' }} />
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#34d399' }}>Swap Submitted!</h2>
            <p style={{ color: '#9ca3af', fontSize: 14, marginTop: 8 }}>
              Transaction sent. Confirmation takes 10-30 seconds.
            </p>
            {txHash && (
              <a href={`https://tonviewer.com/transaction/${txHash}`} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 12, color: '#22d3ee', fontSize: 12 }}>
                View on Tonviewer <ExternalLink size={10} />
              </a>
            )}
            <div style={{ marginTop: 16 }}>
              <button onClick={resetSwap} style={{
                padding: '8px 16px', borderRadius: 12,
                background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
                color: '#6ee7b7', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>New Swap</button>
            </div>
          </div>
        )}

        {status !== 'success' && (
          <>
            {/* Swap Card */}
            <div style={{
              borderRadius: 24, border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(20px)',
              padding: 20, overflow: 'hidden',
            }}>
              {/* Wallet bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                {userAddress ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Wallet size={12} style={{ color: '#34d399' }} />
                    <span style={{ fontSize: 11, color: '#6ee7b7', fontFamily: 'monospace' }}>
                      {userAddress.slice(0, 6)}...{userAddress.slice(-4)}
                    </span>
                    {balance > 0 && (
                      <span style={{ fontSize: 10, color: 'rgba(52,211,153,0.5)' }}>{balance.toFixed(1)} GSTD</span>
                    )}
                  </div>
                ) : (
                  <TonConnectButton />
                )}
                <span style={{ fontSize: 10, color: '#4b5563' }}>StonFi v2</span>
              </div>

              {/* FROM input */}
              <div style={{
                borderRadius: 16, background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.05)', padding: 16,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>You pay</span>
                  {direction === 'sell' && balance > 0 && (
                    <button onClick={() => setAmount(balance.toString())}
                      style={{ fontSize: 10, color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer' }}>
                      MAX: {balance.toFixed(2)}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input
                    type="number" value={amount}
                    onChange={(e) => { setAmount(e.target.value); setStatus('idle'); }}
                    placeholder="0.0" min="0" step="0.1"
                    style={{
                      flex: 1, background: 'transparent', border: 'none', outline: 'none',
                      fontSize: 24, fontWeight: 700, color: 'white', minWidth: 0,
                    }}
                  />
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 12,
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    flexShrink: 0,
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700,
                      background: fromToken === 'TON' ? '#3b82f6' : 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                    }}>
                      {fromToken === 'TON' ? '💎' : 'G'}
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{fromToken}</span>
                  </div>
                </div>
              </div>

              {/* Flip button */}
              <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0', position: 'relative', zIndex: 1 }}>
                <button onClick={flipDirection} style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', transition: 'all 0.3s',
                }}>
                  <ArrowDownUp size={15} style={{ color: '#a78bfa' }} />
                </button>
              </div>

              {/* TO output */}
              <div style={{
                borderRadius: 16, background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.05)', padding: 16,
              }}>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>You receive</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, fontSize: 24, fontWeight: 700, minWidth: 0, overflow: 'hidden' }}>
                    {(() => {
                      if (status === 'simulating') return <Loader2 size={20} style={{ color: '#6b7280', animation: 'spin 1s linear infinite' }} />;
                      if (outputAmount > 0) return <span style={{ color: '#34d399' }}>{outputAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>;
                      return <span style={{ color: '#374151' }}>0.0</span>;
                    })()}
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 12,
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    flexShrink: 0,
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700,
                      background: toToken === 'TON' ? '#3b82f6' : 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                    }}>
                      {toToken === 'TON' ? '💎' : 'G'}
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{toToken}</span>
                  </div>
                </div>
              </div>

              {/* Quote */}
              {simResult && status === 'simulated' && (
                <div style={{
                  borderRadius: 12, background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)', padding: 12, marginTop: 12,
                }}>
                  {[
                    ['Rate', `1 ${fromToken} ≈ ${(outputAmount / (parseFloat(amount) || 1)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${toToken}`],
                    ['Min received', `${minOutput.toFixed(4)} ${toToken}`],
                    ['Slippage', '1%'],
                    ['Price impact', `${(parseFloat(simResult.priceImpact) * 100).toFixed(4)}%`],
                    ['Route', 'StonFi v2 DEX'],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af', padding: '3px 0' }}>
                      <span>{label}</span>
                      <span style={{ color: label === 'Route' ? '#22d3ee' : '#d1d5db', fontWeight: label === 'Route' ? 600 : 400 }}>{value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, padding: 12,
                  borderRadius: 12, background: 'rgba(239,68,68,0.05)',
                  border: '1px solid rgba(239,68,68,0.15)', marginTop: 12,
                  fontSize: 12, color: '#f87171',
                }}>
                  <AlertCircle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              )}

              {/* Action button */}
              <div style={{ marginTop: 16 }}>
                {(() => {
                  if (!userAddress) {
                    return <div style={{ display: 'flex', justifyContent: 'center' }}><TonConnectButton /></div>;
                  }
                  if (status === 'simulated' && simResult) {
                    return (
                      <button onClick={handleSwap} style={{
                        width: '100%', padding: '14px 0', borderRadius: 16,
                        fontWeight: 800, fontSize: 15, border: 'none', cursor: 'pointer',
                        color: 'white', background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}>
                        <Zap size={17} /> Swap {amount} {fromToken} → {outputAmount.toFixed(2)} {toToken}
                      </button>
                    );
                  }
                  if (status === 'swapping') {
                    return (
                      <button disabled style={{
                        width: '100%', padding: '14px 0', borderRadius: 16,
                        fontWeight: 800, fontSize: 15, border: 'none',
                        color: '#c4b5fd', background: 'rgba(139,92,246,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}>
                        <Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} /> Confirming in wallet...
                      </button>
                    );
                  }
                  if (status === 'simulating') {
                    return (
                      <button disabled style={{
                        width: '100%', padding: '14px 0', borderRadius: 16,
                        fontWeight: 700, fontSize: 13, border: 'none',
                        color: '#6b7280', background: 'rgba(255,255,255,0.03)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}>
                        <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Getting best rate...
                      </button>
                    );
                  }
                  return (
                    <button onClick={handleSimulate} disabled={!amount || parseFloat(amount) <= 0}
                      style={{
                        width: '100%', padding: '14px 0', borderRadius: 16,
                        fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer',
                        color: '#9ca3af', background: 'rgba(255,255,255,0.05)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        opacity: (!amount || parseFloat(amount) <= 0) ? 0.3 : 1,
                      }}>
                      <RefreshCw size={14} /> Get Quote
                    </button>
                  );
                })()}
              </div>
            </div>

            {/* Quick amounts */}
            {direction === 'buy' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 16 }}>
                {['0.5', '1', '5', '10'].map(val => (
                  <button key={val} onClick={() => { setAmount(val); setStatus('idle'); }}
                    style={{
                      padding: '8px 0', borderRadius: 12, fontSize: 12, fontWeight: 700,
                      border: amount === val ? '1px solid rgba(167,139,250,0.4)' : '1px solid rgba(255,255,255,0.05)',
                      background: amount === val ? 'rgba(167,139,250,0.1)' : 'rgba(255,255,255,0.02)',
                      color: amount === val ? '#c4b5fd' : '#6b7280',
                      cursor: 'pointer',
                    }}>
                    {val} TON
                  </button>
                ))}
              </div>
            )}

            {/* Info */}
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 10, color: '#4b5563', lineHeight: 1.5, padding: '0 4px' }}>
              <AlertCircle size={12} style={{ marginTop: 2, flexShrink: 0 }} />
              <span>Swap executes on-chain via StonFi DEX. Transaction is signed in your wallet (Tonkeeper/MyTonWallet). 1% slippage protection.</span>
            </div>
          </>
        )}

        {/* Links */}
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 24, fontSize: 10 }}>
          <a href={`https://app.ston.fi/swap?ft=TON&tt=${GSTD_JETTON}`} target="_blank" rel="noopener noreferrer"
            style={{ color: 'rgba(34,211,238,0.4)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
            StonFi <ExternalLink size={8} />
          </a>
          <a href={`https://tonviewer.com/${GSTD_JETTON}`} target="_blank" rel="noopener noreferrer"
            style={{ color: '#4b5563', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
            Contract <ExternalLink size={8} />
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
    props: { ...(await serverSideTranslations(locale ?? 'en', ['common'])) },
  };
}
