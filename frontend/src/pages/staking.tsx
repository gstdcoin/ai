import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { Lock, TrendingUp, Clock, Shield, Zap, RefreshCw, Info, Wallet, Loader2, Unlock } from 'lucide-react';
import { useTonWallet, useTonConnectUI, TonConnectButton } from '@tonconnect/ui-react';
import { buildStakingDepositTx } from '../lib/jettonTransfer';
import { API_BASE_URL } from '../lib/config';
import { toast } from 'sonner';

interface StakingInfo {
  your_stakes: number;
  your_staked: number;
  your_earned: number;
  global_staked: number;
  global_stakers: number;
  apy_tiers: Record<string, string>;
}

const APY_TIERS = [
  { days: 30, apy: 8, label: '30 Days', color: 'from-cyan-500 to-blue-500' },
  { days: 90, apy: 15, label: '90 Days', color: 'from-violet-500 to-purple-500' },
  { days: 180, apy: 24, label: '180 Days', color: 'from-amber-500 to-orange-500' },
  { days: 365, apy: 36, label: '365 Days', color: 'from-emerald-500 to-green-500' },
];

export default function StakingPage() {
  const { t } = useTranslation('common');
  const tonWallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();
  const walletAddress = tonWallet?.account?.address || '';
  const [info, setInfo] = useState<StakingInfo | null>(null);
  const [selectedTier, setSelectedTier] = useState(1);
  const [amount, setAmount] = useState('10');
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<number>(0);
  const [staking, setStaking] = useState(false);
  const [unstaking, setUnstaking] = useState(false);
  const [userStaked, setUserStaked] = useState(0);
  const [userDailyReward, setUserDailyReward] = useState(0);

  const fetchInfo = useCallback(async () => {
    setLoading(true);
    try {
      const url = walletAddress
        ? `${API_BASE_URL}/api/v1/sovereign/staking/info?wallet=${encodeURIComponent(walletAddress)}`
        : `${API_BASE_URL}/api/v1/sovereign/staking/info`;
      const res = await fetch(url);
      if (res.ok) setInfo(await res.json());

      // Also fetch per-user staking info
      if (walletAddress) {
        const stakingRes = await fetch(`${API_BASE_URL}/api/v1/sovereign/staking/info?wallet=${encodeURIComponent(walletAddress)}`);
        if (stakingRes.ok) {
          const d = await stakingRes.json();
          setUserStaked(d.wallet?.staked || 0);
          setUserDailyReward(d.wallet?.daily_reward || 0);
        }
      }
    } catch (e) {
      console.error('Staking info error:', e);
    }
    setLoading(false);
  }, [walletAddress]);

  useEffect(() => { fetchInfo(); }, [fetchInfo]);

  // Fetch balance
  useEffect(() => {
    if (!walletAddress) { setBalance(0); return; }
    fetch(`${API_BASE_URL}/api/v1/balance/public?wallet=${encodeURIComponent(walletAddress)}`)
      .then(r => r.json())
      .then(d => setBalance((d.gstd_balance || 0) + (d.pending_earnings || 0)))
      .catch(() => {});
  }, [walletAddress]);

  const tier = APY_TIERS[selectedTier];
  const amt = parseFloat(amount) || 0;
  const dailyReward = amt * (tier.apy / 100) / 365;
  const monthlyReward = dailyReward * 30;
  const totalReward = amt * (tier.apy / 100) * (tier.days / 365);

  return (
    <div className="min-h-screen bg-[#030014] text-white">
      <Head>
        <title>Staking — GSTD Yield</title>
        <meta name="description" content="Stake GSTD tokens and earn real yield from compute fees. Up to 36% APY with node operator bonus." />
      </Head>

      <main className="max-w-3xl mx-auto px-4 pt-24 pb-16 sovereign-section">
        {/* Header */}
        <div className="text-center mb-12 fu d1">
          <div className="sec-tag emerald justify-center inline-flex mb-3">LIQUID STAKING (stGSTD)</div>
          <h1 className="sec-title flex items-center justify-center gap-3">
            <span style={{ fontSize: 32, lineHeight: 1 }}>🏦</span> {t('staking', 'Liquid Staking')}
          </h1>
          <p className="sec-sub mx-auto">
            {t('staking_desc', 'Earn real yield from AI compute fees. Lock GSTD, receive liquid stGSTD on 1:1 ratio. Node operators get 2x bonus.')}
          </p>
          {/* Wallet status */}
          {walletAddress ? (
            <div className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
              <Wallet size={12} className="text-emerald-400" />
              <span className="text-xs text-emerald-300 font-mono font-bold tracking-wider">
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </span>
              {balance > 0 && (
                <span className="text-xs text-emerald-400/50 bg-emerald-400/10 px-1.5 py-0.5 rounded font-bold uppercase tracking-widest">{balance.toFixed(2)} GSTD</span>
              )}
            </div>
          ) : (
            <div className="mt-6 flex justify-center">
              <TonConnectButton />
            </div>
          )}
        </div>

        {/* Global Stats */}
        <div className="grid grid-cols-3 gap-3 mb-10 fu d2">
          <div className="sov-card !p-5 shrink flex flex-col items-center justify-center">
            <div className="text-2xl font-black text-emerald-400 mb-1 leading-none">
              {info ? info.global_staked.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
            </div>
            <div className="text-[10px] uppercase font-bold tracking-widest text-gray-500">Total Staked</div>
          </div>
          <div className="sov-card !p-5 shrink flex flex-col items-center justify-center">
            <div className="text-2xl font-black text-violet-400 mb-1 leading-none">
              {info ? info.global_stakers : '—'}
            </div>
            <div className="text-[10px] uppercase font-bold tracking-widest text-gray-500">Stakers</div>
          </div>
          <div className="sov-card !p-5 shrink flex flex-col items-center justify-center">
            <div className="text-2xl font-black text-amber-400 mb-1 leading-none">
              36%
            </div>
            <div className="text-[10px] uppercase font-bold tracking-widest text-gray-500">Max APY</div>
          </div>
        </div>

        {/* APY Tiers */}
        <div className="mb-10 fu d3">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center justify-center gap-2">
            <TrendingUp size={14} /> {t('select_lock_period', 'Select Lock Period')}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {APY_TIERS.map((t, i) => (
              <button
                key={t.days}
                onClick={() => setSelectedTier(i)}
                className={`py-6 px-4 rounded-3xl border transition-all hover:scale-[1.02] cursor-pointer relative overflow-hidden flex flex-col items-center justify-center ${
                  selectedTier === i
                    ? 'border-emerald-500/30 bg-emerald-500/5 shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/20'
                    : 'border-white/5 bg-white/[0.01] hover:bg-white/[0.03]'
                }`}
              >
                {selectedTier === i && <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-400/20 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />}
                <div className={`text-3xl font-black bg-gradient-to-r ${t.color} bg-clip-text text-transparent mb-1`}>
                  {t.apy}%
                </div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t.label}</div>
                <div className="text-[10px] text-gray-600 mt-2 flex items-center justify-center gap-1 font-bold tracking-wide">
                  <Lock size={10} /> APY
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Calculator */}
        <div className="sov-card !p-6 mb-10 fu d4">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6 flex items-center justify-center gap-2">
            <Zap size={14} className="text-amber-400" /> {t('rewards_calculator', 'Rewards Calculator')}
          </h2>

          {/* Amount Input */}
          <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-4 mb-4 hover:bg-white/[0.04] transition-colors">
            <div className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-2">{t('stake_amount', 'Stake Amount')}</div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10"
                min="1"
                className="flex-1 bg-transparent text-3xl font-black text-white outline-none placeholder-gray-600"
              />
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 shrink-0">
                <span className="font-bold text-sm tracking-wide text-violet-400">GSTD</span>
              </div>
            </div>
          </div>

          {/* Quick amounts */}
          <div className="grid grid-cols-4 gap-2 mb-6">
            {['10', '50', '100', '500'].map(val => (
              <button
                key={val}
                onClick={() => setAmount(val)}
                className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                  amount === val
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-white/5 bg-white/[0.02] text-gray-500 hover:border-white/10'
                }`}
              >
                {val} GSTD
              </button>
            ))}
          </div>

          {/* Rewards Breakdown */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col justify-center">
              <div className="text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-1 flex items-center gap-1"><Clock size={10} /> Daily</div>
              <div className="text-lg font-black text-emerald-400">
                +{dailyReward.toFixed(4)} <span className="text-emerald-400/50 text-xs font-bold">GSTD</span>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col justify-center">
              <div className="text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-1">Monthly</div>
              <div className="text-lg font-black text-emerald-400">
                +{monthlyReward.toFixed(2)} <span className="text-emerald-400/50 text-xs font-bold">GSTD</span>
              </div>
            </div>
          </div>
          <div className="p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.05)]">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-[10px] uppercase tracking-widest font-bold text-emerald-400/70 mb-1">Total after {tier.days} days</div>
                <div className="text-2xl font-black text-emerald-400">
                  +{totalReward.toFixed(2)} GSTD
                </div>
              </div>
              <div className="text-right">
                <div className={`text-3xl font-black bg-gradient-to-r ${tier.color} bg-clip-text text-transparent leading-none`}>
                  {tier.apy}%
                </div>
                <div className="text-[10px] font-bold text-gray-500 mt-1 uppercase tracking-widest">APY</div>
              </div>
            </div>
          </div>

          {/* User Position (if staked) */}
          {userStaked > 0 && walletAddress && (
            <div className="mt-6 p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.08)] relative overflow-hidden">
              <div className="absolute top-0 left-0 w-24 h-24 bg-emerald-400/15 rounded-full blur-2xl pointer-events-none -ml-8 -mt-8 animate-pulse" />
              <div className="text-[10px] uppercase font-bold tracking-widest text-emerald-400/60 mb-3 flex items-center gap-2">
                <Lock size={11} /> Your Staking Position
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-2xl font-black text-emerald-400">{userStaked.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">stGSTD Balance</div>
                </div>
                <div>
                  <div className="text-2xl font-black text-cyan-400">+{userDailyReward.toFixed(4)}</div>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Daily Reward</div>
                </div>
              </div>
            </div>
          )}

          {/* Stake / Unstake Action Buttons */}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              disabled={!walletAddress || staking || amt < 1}
              onClick={async () => {
                if (!walletAddress || amt < 1) return;
                setStaking(true);
                try {
                  // Step 1: Build real GSTD jetton transfer to Treasury
                  toast.loading('Building on-chain transaction...', { id: 'staking' });
                  const tx = await buildStakingDepositTx(walletAddress, amt, tier.days);

                  // Step 2: Sign & send via TonConnect (Tonkeeper/MyTonWallet)
                  toast.loading('Please confirm in your wallet...', { id: 'staking' });
                  const result = await tonConnectUI.sendTransaction(tx);
                  const txHash = result.boc || '';

                  // Step 3: Notify backend with tx hash to record stake
                  toast.loading('Verifying on-chain...', { id: 'staking' });
                  const sessionToken = localStorage.getItem('session_token') || '';
                  const res = await fetch(`${API_BASE_URL}/api/v1/sovereign/stake`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken, 'Authorization': `Bearer ${sessionToken}` },
                    body: JSON.stringify({ amount: amt, lock_days: tier.days, tx_hash: txHash }),
                  });
                  const data = await res.json();
                  if (res.ok) {
                    toast.success(`✅ Staked ${amt} GSTD on-chain! You received stGSTD at ${data.apy || tier.apy}% APY`, { id: 'staking' });
                    setUserStaked(data.total_staked || 0);
                    fetchInfo();
                  } else {
                    toast.error(data.error || 'Backend recording failed, but tx was sent', { id: 'staking' });
                  }
                } catch (err: any) {
                  const msg = err?.message || 'Transaction failed';
                  if (msg.includes('User rejected') || msg.includes('Cancelled')) {
                    toast.error('Transaction cancelled', { id: 'staking' });
                  } else {
                    toast.error(msg, { id: 'staking' });
                  }
                }
                finally { setStaking(false); }
              }}
              className="btn-sovereign emerald w-full disabled:opacity-30 disabled:cursor-not-allowed text-xs sm:text-sm whitespace-nowrap overflow-hidden text-ellipsis"
            >
              {staking ? <><Loader2 size={14} className="animate-spin mr-2 shrink-0" /> Signing On-Chain...</> : <><Lock size={14} className="mr-2 shrink-0" /> Stake GSTD (TON Wallet)</>}
            </button>
            <button
              disabled={!walletAddress || unstaking || userStaked <= 0}
              onClick={async () => {
                if (!walletAddress || userStaked <= 0) return;
                const unstakeAmount = parseFloat(prompt(`Amount of stGSTD to convert back to GSTD (max: ${userStaked}):`) || '0');
                if (unstakeAmount <= 0) return;
                setUnstaking(true);
                try {
                  const sessionToken = localStorage.getItem('session_token') || '';
                  const res = await fetch(`${API_BASE_URL}/api/v1/sovereign/unstake`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken, 'Authorization': `Bearer ${sessionToken}` },
                    body: JSON.stringify({ amount: unstakeAmount, stake_id: 0 }), // Needs proper stake_id selection in real usage, simplified here
                  });
                  const data = await res.json();
                  if (res.ok) {
                    toast.success(`Converted ${unstakeAmount} stGSTD back to GSTD`);
                    setUserStaked(userStaked - unstakeAmount);
                    fetchInfo();
                  } else {
                    toast.error(data.error || 'Conversion failed');
                  }
                } catch { toast.error('Network error'); }
                finally { setUnstaking(false); }
              }}
              className="btn-sovereign ghost w-full disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {unstaking ? <><Loader2 size={14} className="animate-spin mr-2" /> Restoring GSTD...</> : <><Unlock size={14} className="mr-2" /> Redeem stGSTD</>}
            </button>
          </div>

          {!walletAddress && (
            <div className="mt-4 p-3 rounded-xl bg-violet-500/5 border border-violet-500/15 text-center">
              <p className="text-xs text-gray-400 mb-2">Connect wallet to stake GSTD and earn rewards</p>
              <TonConnectButton />
            </div>
          )}

          {/* Node Bonus */}
          <div className="mt-4 p-4 rounded-2xl bg-violet-500/5 border border-violet-500/20 flex items-start gap-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-full blur-2xl pointer-events-none -mr-16 -mt-16" />
            <Shield size={18} className="text-violet-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-bold text-violet-400 mb-1">Node Operator Bonus: 2×</div>
              <div className="text-xs text-gray-400 leading-relaxed">
                Run a GSTD node to double your staking rewards. All APY rates are doubled for active node operators.
              </div>
            </div>
          </div>
        </div>

        {/* How it Works & Yield Sources */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 fu d5 mb-8">
          <div className="sov-card !p-6">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6 flex items-center justify-center gap-2">
              <Info size={14} className="text-cyan-400" /> How Staking Works
            </h2>
            <div className="space-y-4">
              {[
                { icon: '🗓️', title: 'Choose lock period', desc: '30–365 days. Longer = higher APY' },
                { icon: '🔒', title: 'Stake your GSTD', desc: 'Minimum 1 GSTD. Locked until unlock date' },
                { icon: '💰', title: 'Earn daily rewards', desc: 'Real yield from AI compute and bridge fees' },
                { icon: '🔓', title: 'Unstake anytime', desc: 'Full return after lock. Early withdrawal: 10% penalty' },
              ].map(step => (
                <div key={step.title} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                  <span className="text-xl leading-none">{step.icon}</span>
                  <div>
                    <div className="text-sm font-bold text-white mb-0.5">{step.title}</div>
                    <div className="text-xs text-gray-500">{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="sov-card !p-6">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6 flex items-center justify-center gap-2">
              <TrendingUp size={14} className="text-emerald-400" /> Yield Sources
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center text-center">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">AI Compute</div>
                <div className="text-2xl font-black text-cyan-400 mb-1">40%</div>
                <div className="text-[10px] text-gray-600 font-medium">→ STAKERS</div>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center text-center">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Bridge Fees</div>
                <div className="text-2xl font-black text-violet-400 mb-1">30%</div>
                <div className="text-[10px] text-gray-600 font-medium">→ STAKERS</div>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center text-center">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Storage</div>
                <div className="text-2xl font-black text-amber-400 mb-1">20%</div>
                <div className="text-[10px] text-gray-600 font-medium">→ STAKERS</div>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center text-center">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Governance</div>
                <div className="text-2xl font-black text-emerald-400 mb-1">10%</div>
                <div className="text-[10px] text-gray-600 font-medium">→ ACTIVE VOTERS</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center fu d5">
          <button
            onClick={fetchInfo}
            className="btn-sovereign ghost mx-auto"
          >
            <RefreshCw size={14} className={`inline mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh Stats
          </button>
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
