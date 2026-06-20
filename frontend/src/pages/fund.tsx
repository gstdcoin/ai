import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { API_BASE_URL } from '../lib/config';
import { GetStaticProps } from 'next';
import { getCommonStaticProps } from '../lib/i18n-static-props';
import { useTranslation } from 'next-i18next';
import { TrendingUp, Server, DollarSign, Flame, ExternalLink } from 'lucide-react';

interface TreasuryData {
  treasury_balance: number;
  total_burned: number;
  total_users: number;
  total_nodes: number;
  gstd_price_usd: number;
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all">
      <div className={`w-10 h-10 rounded-xl bg-${color}-500/15 flex items-center justify-center mb-4`}>
        <Icon className={`text-${color}-400`} size={20} />
      </div>
      <div className="text-2xl font-black text-white mb-1">{value}</div>
      <div className="text-sm text-gray-400 font-medium">{label}</div>
      {sub && <div className="text-xs text-gray-600 mt-1">{sub}</div>}
    </div>
  );
}

export default function TreasuryPage() {
  const { t } = useTranslation('common');
  const [data, setData] = useState<TreasuryData | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/network/stats`);
      if (!res.ok) return;
      const d = await res.json();
      setData({
        treasury_balance: d.treasury_balance ?? 0,
        total_burned: d.total_burned ?? 0,
        total_users: d.total_users ?? 0,
        total_nodes: d.active_workers ?? d.total_nodes ?? 0,
        gstd_price_usd: d.gstd_price_usd ?? 0,
      });
    } catch { /* silent */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const JETTON_ADDRESS = 'EQD-LkpGp98MdSCnfDdNmvtpMRFBkHDlhTb7e_gFbCjkUMpP';

  return (
    <div className="min-h-screen bg-[#030014] text-white">
      <Head>
        <title>GSTD — Ecosystem Treasury</title>
        <meta name="description" content="GSTD ecosystem treasury — 10% of all inference fees fund buybacks and development." />
      </Head>

      <div className="max-w-4xl mx-auto px-6 pt-16 pb-24">
        {/* Header */}
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-600/10 border border-cyan-600/20 text-cyan-400 text-[10px] font-black mb-4 uppercase tracking-[0.3em]">
            Ecosystem Treasury
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tighter">
            Network Economics
          </h1>
          <p className="text-gray-400 text-lg leading-relaxed max-w-2xl">
            10% of every AI inference fee goes to the ecosystem treasury. Funds are used for GSTD buybacks,
            network development, and grants. Node operators earn 90% of every request they serve.
          </p>
        </div>

        {/* Fee split visual */}
        <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 mb-8">
          <div className="text-xs text-gray-500 font-black uppercase tracking-widest mb-4">Fee Distribution — Per Inference Request</div>
          <div className="flex gap-2 h-8 rounded-xl overflow-hidden mb-3">
            <div className="flex-[90] bg-gradient-to-r from-violet-600 to-cyan-600 rounded-l-xl flex items-center justify-center text-white text-xs font-black">
              90% → Node Operator
            </div>
            <div className="flex-[10] bg-gradient-to-r from-amber-600 to-orange-600 rounded-r-xl flex items-center justify-center text-white text-xs font-black">
              10%
            </div>
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>90% paid directly to the node that served the request</span>
            <span>10% → Treasury</span>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Treasury Balance"
            value={data ? `${data.treasury_balance.toLocaleString()} GSTD` : '—'}
            sub="Accumulated fees"
            icon={DollarSign}
            color="cyan"
          />
          <StatCard
            label="GSTD Price"
            value={data?.gstd_price_usd ? `$${data.gstd_price_usd.toFixed(8)}` : '—'}
            sub="Live from STON.fi"
            icon={TrendingUp}
            color="violet"
          />
          <StatCard
            label="Active Nodes"
            value={data ? data.total_nodes.toLocaleString() : '—'}
            sub="Earning 90% of fees"
            icon={Server}
            color="emerald"
          />
          <StatCard
            label="Total Burned"
            value={data ? `${data.total_burned.toLocaleString()} GSTD` : '—'}
            sub="Deflationary sink"
            icon={Flame}
            color="orange"
          />
        </div>

        {/* How treasury is used */}
        <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 mb-6">
          <h2 className="text-lg font-black text-white mb-4">Treasury Use of Funds</h2>
          <div className="space-y-3">
            {[
              { label: 'GSTD Buybacks', desc: 'Regular market purchases to support liquidity and reduce supply', pct: '60%', color: 'cyan' },
              { label: 'Network Development', desc: 'Infrastructure, API improvements, node tooling', pct: '30%', color: 'violet' },
              { label: 'Ecosystem Grants', desc: 'Community builders, integrations, partnerships', pct: '10%', color: 'emerald' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <div className={`text-lg font-black text-${item.color}-400 w-12 shrink-0`}>{item.pct}</div>
                <div>
                  <div className="text-sm font-bold text-white">{item.label}</div>
                  <div className="text-xs text-gray-500">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Token contract */}
        <div className="p-5 rounded-2xl bg-black/40 border border-white/5">
          <div className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-2">GSTD Jetton Contract (TON)</div>
          <a
            href={`https://tonviewer.com/${JETTON_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-gray-400 font-mono hover:text-cyan-400 transition-colors break-all"
          >
            {JETTON_ADDRESS}
            <ExternalLink size={12} className="shrink-0" />
          </a>
        </div>
      </div>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: await getCommonStaticProps(locale),
});
