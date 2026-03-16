import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { Lock, TrendingUp, Clock, Shield, Zap, RefreshCw, Info, Wallet } from 'lucide-react';
import { useTonWallet, TonConnectButton } from '@tonconnect/ui-react';
import { API_BASE_URL } from '../lib/config';

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
  const walletAddress = tonWallet?.account?.address || '';
  const [info, setInfo] = useState<StakingInfo | null>(null);
  const [selectedTier, setSelectedTier] = useState(1);
  const [amount, setAmount] = useState('10');
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<number>(0);

  const fetchInfo = useCallback(async () => {
    setLoading(true);
    try {
      const url = walletAddress
        ? `${API_BASE_URL}/api/v1/sovereign/staking/info?wallet=${encodeURIComponent(walletAddress)}`
        : `${API_BASE_URL}/api/v1/sovereign/staking/info`;
      const res = await fetch(url);
      if (res.ok) setInfo(await res.json());
    } catch (e) {
      console.error('Staking info error:', e);
    }
    setLoading(false);
  }, [walletAddress]);

  useEffect(() => { fetchInfo(); }, [fetchInfo]);

  // Fetch balance
  useEffect(() => {
    if (!walletAddress) { setBalance(0); return; }
    fetch(`${API_BASE_URL}/api/v1/wallet/balance?wallet=${encodeURIComponent(walletAddress)}`)
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
      <EcosystemNav />

      <main className="max-w-3xl mx-auto px-4 pt-20 pb-16">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-300 bg-clip-text text-transparent mb-2">
            🏦 {t('staking', 'Staking')}
          </h1>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            {t('staking_desc', 'Earn real yield from AI compute fees. Lock GSTD, earn rewards daily. Node operators get 2x bonus.')}
          </p>
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

        {/* Global Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
            <div className="text-lg font-bold text-emerald-400">
              {info ? info.global_staked.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
            </div>
            <div className="text-xs text-gray-500">Total Staked</div>
          </div>
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
            <div className="text-lg font-bold text-violet-400">
              {info ? info.global_stakers : '—'}
            </div>
            <div className="text-xs text-gray-500">Stakers</div>
          </div>
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
            <div className="text-lg font-bold text-amber-400">
              36%
            </div>
            <div className="text-xs text-gray-500">Max APY</div>
          </div>
        </div>

        {/* APY Tiers */}
        <div className="mb-8">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <TrendingUp size={14} /> {t('select_lock_period', 'Select Lock Period')}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {APY_TIERS.map((t, i) => (
              <button
                key={t.days}
                onClick={() => setSelectedTier(i)}
                className={`p-4 rounded-2xl border transition-all hover:scale-[1.02] ${
                  selectedTier === i
                    ? 'border-white/20 bg-white/[0.05] ring-1 ring-white/10'
                    : 'border-white/5 bg-white/[0.01]'
                }`}
              >
                <div className={`text-2xl font-black bg-gradient-to-r ${t.color} bg-clip-text text-transparent`}>
                  {t.apy}%
                </div>
                <div className="text-xs text-gray-500 mt-1">{t.label}</div>
                <div className="text-[10px] text-gray-600 mt-0.5 flex items-center justify-center gap-1">
                  <Lock size={8} /> APY
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Calculator */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-xl p-6 mb-8">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Zap size={14} /> {t('rewards_calculator', 'Rewards Calculator')}
          </h2>

          {/* Amount Input */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-4 mb-4">
            <div className="text-xs text-gray-500 mb-2">{t('stake_amount', 'Stake Amount')}</div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10"
                min="1"
                className="flex-1 bg-transparent text-2xl font-bold text-white outline-none placeholder-gray-600"
              />
              <span className="text-violet-400 font-bold">GSTD</span>
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
                    ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
                    : 'border-white/5 bg-white/[0.02] text-gray-500 hover:border-white/10'
                }`}
              >
                {val} GSTD
              </button>
            ))}
          </div>

          {/* Rewards Breakdown */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Clock size={10} /> Daily</div>
              <div className="text-sm font-bold text-emerald-400">
                +{dailyReward.toFixed(4)} <span className="text-gray-500 text-xs">GSTD</span>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="text-xs text-gray-500 mb-1">Monthly</div>
              <div className="text-sm font-bold text-emerald-400">
                +{monthlyReward.toFixed(2)} <span className="text-gray-500 text-xs">GSTD</span>
              </div>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-xs text-gray-500">Total after {tier.days} days</div>
                <div className="text-xl font-black text-emerald-400">
                  +{totalReward.toFixed(2)} GSTD
                </div>
              </div>
              <div className="text-right">
                <div className={`text-2xl font-black bg-gradient-to-r ${tier.color} bg-clip-text text-transparent`}>
                  {tier.apy}%
                </div>
                <div className="text-[10px] text-gray-500">APY</div>
              </div>
            </div>
          </div>

          {/* Node Bonus */}
          <div className="mt-4 p-3 rounded-xl bg-violet-500/5 border border-violet-500/15 flex items-start gap-3">
            <Shield size={16} className="text-violet-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-bold text-violet-400">Node Operator Bonus: 2×</div>
              <div className="text-[11px] text-gray-500">
                Run a GSTD node to double your staking rewards. All APY rates are doubled for active node operators.
              </div>
            </div>
          </div>
        </div>

        {/* How it Works */}
        <div className="rounded-3xl border border-white/5 bg-white/[0.01] p-6 mb-8">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Info size={14} /> How Staking Works
          </h2>
          <div className="space-y-3">
            {[
              { icon: '1️⃣', title: 'Choose lock period', desc: '30–365 days. Longer = higher APY' },
              { icon: '2️⃣', title: 'Stake your GSTD', desc: 'Minimum 1 GSTD. Locked until unlock date' },
              { icon: '3️⃣', title: 'Earn daily rewards', desc: 'Real yield from AI compute and bridge fees' },
              { icon: '4️⃣', title: 'Unstake anytime', desc: 'Full return after lock. Early withdrawal: 10% penalty' },
            ].map(step => (
              <div key={step.title} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02]">
                <span className="text-lg">{step.icon}</span>
                <div>
                  <div className="text-sm font-bold text-white">{step.title}</div>
                  <div className="text-xs text-gray-500">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Yield Sources */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
            <div className="text-xs text-gray-500 mb-2">AI Compute Fees</div>
            <div className="text-lg font-bold text-cyan-400">40%</div>
            <div className="text-[10px] text-gray-600">→ to stakers</div>
          </div>
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
            <div className="text-xs text-gray-500 mb-2">Bridge Fees</div>
            <div className="text-lg font-bold text-violet-400">30%</div>
            <div className="text-[10px] text-gray-600">→ to stakers</div>
          </div>
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
            <div className="text-xs text-gray-500 mb-2">Storage Fees</div>
            <div className="text-lg font-bold text-amber-400">20%</div>
            <div className="text-[10px] text-gray-600">→ to stakers</div>
          </div>
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
            <div className="text-xs text-gray-500 mb-2">Governance</div>
            <div className="text-lg font-bold text-emerald-400">10%</div>
            <div className="text-[10px] text-gray-600">→ active voters</div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={fetchInfo}
            className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white border border-white/10 hover:border-white/20 transition-all"
          >
            <RefreshCw size={12} className={`inline mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
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
