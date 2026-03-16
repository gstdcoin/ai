import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { ArrowDownUp, Zap, RefreshCw, AlertCircle, Wallet, CheckCircle2, Loader2, ChevronDown, ExternalLink } from 'lucide-react';
import { useTonAddress, useTonConnectUI, TonConnectButton } from '@tonconnect/ui-react';
import { StonApiClient } from '@ston-fi/api';
import { dexFactory } from '@ston-fi/sdk';
import { TonClient } from '@ton/ton';
import { API_BASE_URL } from '../lib/config';

const GSTD_JETTON = 'EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO';
const TON_ADDRESS = 'ton'; // StonFi uses 'ton' literal for native TON

const tonApiClient = typeof window !== 'undefined' ? new TonClient({
  endpoint: 'https://toncenter.com/api/v2/jsonRPC',
}) : null;

const stonClient = typeof window !== 'undefined' ? new StonApiClient() : null;

type SwapStatus = 'idle' | 'simulating' | 'simulated' | 'swapping' | 'success' | 'error';

interface SimResult {
  offerUnits: string;
  askUnits: string;
  minAskUnits: string;
  offerAddress: string;
  askAddress: string;
  priceImpact: string;
  router: any;
  swapRate: string;
  feePercent: string;
}

export default function SwapPage() {
  const { t } = useTranslation('common');
  const userAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();

  const [direction, setDirection] = useState<'buy' | 'sell'>('buy'); // buy = TON→GSTD
  const [amount, setAmount] = useState('1');
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [status, setStatus] = useState<SwapStatus>('idle');
  const [error, setError] = useState('');
  const [gstdPrice, setGstdPrice] = useState(0);
  const [balance, setBalance] = useState(0);
  const [txHash, setTxHash] = useState('');

  // Fetch GSTD price
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/network/stats`)
      .then(r => r.json())
      .then(d => { if (d.gstd_price_usd > 0) setGstdPrice(d.gstd_price_usd); })
      .catch(() => {});
  }, []);

  // Fetch balance
  useEffect(() => {
    if (!userAddress) { setBalance(0); return; }
    fetch(`${API_BASE_URL}/api/v1/wallet/balance?wallet=${encodeURIComponent(userAddress)}`)
      .then(r => r.json())
      .then(d => setBalance((d.gstd_balance || 0) + (d.pending_earnings || 0)))
      .catch(() => {});
  }, [userAddress]);

  const fromToken = direction === 'buy' ? 'TON' : 'GSTD';
  const toToken = direction === 'buy' ? 'GSTD' : 'TON';

  // ─── SIMULATE ───────────────────────────────────────
  const handleSimulate = useCallback(async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0 || !stonClient) return;

    setStatus('simulating');
    setError('');
    setSimResult(null);

    try {
      const offerAddr = direction === 'buy' ? TON_ADDRESS : GSTD_JETTON;
      const askAddr = direction === 'buy' ? GSTD_JETTON : TON_ADDRESS;
      const decimals = 1e9; // TON and GSTD both use 9 decimals
      const offerUnits = Math.floor(amt * decimals).toString();

      const result = await stonClient.simulateSwap({
        offerAddress: offerAddr,
        askAddress: askAddr,
        offerUnits,
        slippageTolerance: '0.01',
      });

      const askUnitsNum = Number(result.askUnits || '0');
      const offerUnitsNum = Number(result.offerUnits || offerUnits);

      setSimResult({
        offerUnits: result.offerUnits || offerUnits,
        askUnits: result.askUnits || '0',
        minAskUnits: result.minAskUnits || '0',
        offerAddress: result.offerAddress || offerAddr,
        askAddress: result.askAddress || askAddr,
        priceImpact: result.priceImpact || '0',
        router: result.router,
        swapRate: offerUnitsNum > 0 ? (askUnitsNum / offerUnitsNum).toFixed(6) : '0',
        feePercent: result.feePercent || '0.3',
      });
      setStatus('simulated');
    } catch (err: any) {
      console.error('Simulation failed:', err);
      setError(err?.message || 'Simulation failed. Pool may not exist or has no liquidity.');
      setStatus('error');
    }
  }, [amount, direction]);

  // Auto-simulate on amount/direction change (debounced)
  useEffect(() => {
    if (!amount || parseFloat(amount) <= 0) {
      setSimResult(null);
      setStatus('idle');
      return;
    }
    const timer = setTimeout(handleSimulate, 800);
    return () => clearTimeout(timer);
  }, [handleSimulate]);

  // ─── SWAP (real on-chain) ────────────────────────────
  const handleSwap = async () => {
    if (!userAddress || !simResult || !tonApiClient) {
      setError('Connect wallet and simulate first');
      return;
    }

    setStatus('swapping');
    setError('');

    try {
      // Build router from simulation result
      const routerInfo = simResult.router;
      const dexContracts = dexFactory(routerInfo);
      const router = tonApiClient.open(
        dexContracts.Router.create(routerInfo.address)
      );
      const proxyTon = dexContracts.pTON.create(routerInfo.ptonMasterAddress);

      const sharedParams = {
        userWalletAddress: userAddress,
        offerAmount: simResult.offerUnits,
        minAskAmount: simResult.minAskUnits,
      };

      // Determine swap type
      let txParams: any;
      if (direction === 'buy') {
        // TON → GSTD (ton to jetton)
        txParams = await router.getSwapTonToJettonTxParams({
          ...sharedParams,
          proxyTon,
          askJettonAddress: simResult.askAddress,
        });
      } else {
        // GSTD → TON (jetton to ton)
        txParams = await router.getSwapJettonToTonTxParams({
          ...sharedParams,
          proxyTon,
          offerJettonAddress: simResult.offerAddress,
        });
      }

      // Send via TonConnect
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
      if (err?.message?.includes('User rejected')) {
        setError('Transaction cancelled');
      } else {
        setError(err?.message || 'Swap failed');
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
  const minOutput = simResult ? Number(simResult.minAskUnits) / 1e9 : 0;

  return (
    <div className="min-h-screen bg-[#030014] text-white">
      <Head>
        <title>Swap — GSTD Exchange</title>
        <meta name="description" content="Swap TON for GSTD tokens directly in-app via StonFi DEX. No intermediaries." />
      </Head>

      <main className="max-w-md mx-auto px-4 pt-20 pb-16">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-extrabold bg-gradient-to-r from-cyan-400 via-violet-400 to-cyan-300 bg-clip-text text-transparent mb-1">
            💱 {t('swap', 'Swap')}
          </h1>
          <p className="text-gray-500 text-xs">
            {t('swap_desc', 'Trade GSTD ↔ TON via StonFi DEX — directly in-app')}
          </p>
          {gstdPrice > 0 && (
            <p className="text-gray-600 text-[10px] mt-1">1 GSTD ≈ ${gstdPrice.toFixed(6)}</p>
          )}
        </div>

        {/* Success state */}
        {status === 'success' && (
          <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center mb-6">
            <CheckCircle2 size={48} className="text-emerald-400 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-emerald-400">Swap Submitted!</h2>
            <p className="text-gray-400 text-sm mt-2">
              Your transaction has been sent to the blockchain. It may take 10-30 seconds to confirm.
            </p>
            {txHash && (
              <a
                href={`https://tonviewer.com/transaction/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-cyan-400 text-xs hover:text-cyan-300"
              >
                View on Tonviewer <ExternalLink size={10} />
              </a>
            )}
            <button
              onClick={resetSwap}
              className="mt-4 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm font-bold hover:bg-emerald-500/20 transition-all"
            >
              New Swap
            </button>
          </div>
        )}

        {status !== 'success' && (
          <>
            {/* Swap Card */}
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-xl p-5 space-y-3">

              {/* Wallet bar */}
              <div className="flex items-center justify-between">
                {userAddress ? (
                  <div className="flex items-center gap-2">
                    <Wallet size={12} className="text-emerald-400" />
                    <span className="text-xs text-emerald-300 font-mono">
                      {userAddress.slice(0, 6)}...{userAddress.slice(-4)}
                    </span>
                    {balance > 0 && (
                      <span className="text-[10px] text-emerald-400/60">{balance.toFixed(1)} GSTD</span>
                    )}
                  </div>
                ) : (
                  <TonConnectButton />
                )}
                <span className="text-[10px] text-gray-600">StonFi v2</span>
              </div>

              {/* FROM */}
              <div className="rounded-2xl bg-white/[0.04] border border-white/5 p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">You pay</span>
                  {direction === 'sell' && balance > 0 && (
                    <button 
                      onClick={() => setAmount(balance.toString())}
                      className="text-[10px] text-violet-400 hover:text-violet-300"
                    >
                      MAX: {balance.toFixed(2)}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value); setStatus('idle'); }}
                    placeholder="0.0"
                    min="0"
                    step="0.1"
                    className="flex-1 bg-transparent text-2xl font-bold text-white outline-none placeholder-gray-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/10 shrink-0">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      fromToken === 'TON' ? 'bg-blue-500' : 'bg-gradient-to-br from-violet-500 to-cyan-500'
                    }`}>
                      {fromToken === 'TON' ? '💎' : 'G'}
                    </div>
                    <span className="font-bold text-sm">{fromToken}</span>
                    <ChevronDown size={12} className="text-gray-500" />
                  </div>
                </div>
              </div>

              {/* Flip Button */}
              <div className="flex justify-center -my-1 relative z-10">
                <button
                  onClick={flipDirection}
                  className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center hover:bg-violet-500/40 transition-all hover:scale-110 active:scale-90 hover:rotate-180 duration-300"
                >
                  <ArrowDownUp size={16} className="text-violet-400" />
                </button>
              </div>

              {/* TO */}
              <div className="rounded-2xl bg-white/[0.04] border border-white/5 p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">You receive</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-2xl font-bold">
                    {status === 'simulating' ? (
                      <Loader2 size={20} className="animate-spin text-gray-500" />
                    ) : outputAmount > 0 ? (
                      <span className="text-emerald-400">{outputAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                    ) : (
                      <span className="text-gray-700">0.0</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/10 shrink-0">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      toToken === 'TON' ? 'bg-blue-500' : 'bg-gradient-to-br from-violet-500 to-cyan-500'
                    }`}>
                      {toToken === 'TON' ? '💎' : 'G'}
                    </div>
                    <span className="font-bold text-sm">{toToken}</span>
                    <ChevronDown size={12} className="text-gray-500" />
                  </div>
                </div>
              </div>

              {/* Quote Details */}
              {simResult && status === 'simulated' && (
                <div className="rounded-xl bg-white/[0.02] border border-white/5 p-3 space-y-1.5 text-[11px]">
                  <div className="flex justify-between text-gray-400">
                    <span>Rate</span>
                    <span className="text-gray-300">
                      1 {fromToken} ≈ {(outputAmount / (parseFloat(amount) || 1)).toLocaleString(undefined, { maximumFractionDigits: 4 })} {toToken}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Min received</span>
                    <span className="text-gray-300">{minOutput.toFixed(4)} {toToken}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Slippage</span>
                    <span className="text-gray-300">1%</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Route</span>
                    <span className="text-cyan-400 font-medium">StonFi v2 DEX</span>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/5 border border-red-500/15 text-xs text-red-400">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Swap Button */}
              {!userAddress ? (
                <div className="w-full flex justify-center">
                  <TonConnectButton />
                </div>
              ) : status === 'simulated' && simResult ? (
                <button
                  onClick={handleSwap}
                  className="w-full py-4 rounded-2xl font-extrabold text-base transition-all flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99]"
                  style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)' }}
                >
                  <Zap size={18} />
                  Swap {amount} {fromToken} → {outputAmount.toFixed(2)} {toToken}
                </button>
              ) : status === 'swapping' ? (
                <button
                  disabled
                  className="w-full py-4 rounded-2xl font-extrabold text-base bg-violet-500/20 text-violet-300 flex items-center justify-center gap-2"
                >
                  <Loader2 size={18} className="animate-spin" />
                  Confirming in wallet...
                </button>
              ) : status === 'simulating' ? (
                <button
                  disabled
                  className="w-full py-4 rounded-2xl font-bold text-sm bg-white/[0.03] text-gray-500 flex items-center justify-center gap-2"
                >
                  <Loader2 size={16} className="animate-spin" />
                  Getting best rate...
                </button>
              ) : (
                <button
                  onClick={handleSimulate}
                  disabled={!amount || parseFloat(amount) <= 0}
                  className="w-full py-4 rounded-2xl font-bold text-sm bg-white/[0.05] text-gray-400 hover:bg-white/[0.08] hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <RefreshCw size={14} />
                  Get Quote
                </button>
              )}
            </div>

            {/* Quick amounts */}
            {direction === 'buy' && (
              <div className="mt-4 grid grid-cols-4 gap-2">
                {['0.5', '1', '5', '10'].map(val => (
                  <button
                    key={val}
                    onClick={() => { setAmount(val); setStatus('idle'); }}
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

            {/* Info note */}
            <div className="mt-4 flex items-start gap-2 text-[10px] text-gray-600 leading-relaxed px-1">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              <span>
                Swap executes on-chain via StonFi DEX smart contracts. Transaction is signed in your wallet (Tonkeeper/MyTonWallet). 1% slippage protection included.
              </span>
            </div>
          </>
        )}

        {/* Links */}
        <div className="mt-6 flex justify-center gap-6 text-[10px]">
          <a
            href={`https://app.ston.fi/swap?ft=TON&tt=${GSTD_JETTON}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400/40 hover:text-cyan-400 transition-colors flex items-center gap-1"
          >
            StonFi <ExternalLink size={8} />
          </a>
          <a
            href={`https://tonviewer.com/${GSTD_JETTON}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1"
          >
            Contract <ExternalLink size={8} />
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
