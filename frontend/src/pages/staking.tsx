import Head from 'next/head';
import Link from 'next/link';
import { getCommonStaticProps } from '../lib/i18n-static-props';
import { Server, Zap, DollarSign, Terminal, CheckCircle } from 'lucide-react';

export default function NodeEarningsPage() {
  return (
    <div className="min-h-screen bg-[#030014] text-white">
      <Head>
        <title>Earn GSTD — Run a Node</title>
        <meta name="description" content="Run a GSTD node and earn tokens for every AI inference request you process. DePIN compute — utility token." />
      </Head>

      <main className="max-w-2xl mx-auto px-4 pt-20 pb-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold mb-5">
            <Server size={12} /> Node Operator Earnings
          </div>
          <h1 className="text-3xl font-black text-white mb-3">Earn GSTD by Running a Node</h1>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            GSTD is a utility token for AI compute. Run a node, serve inference requests,
            earn 90% of every fee. No lock-ups. No APY promises. Just real usage.
          </p>
        </div>

        {/* How earnings work */}
        <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-6">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <DollarSign size={16} className="text-emerald-400" /> How Earnings Work
          </h2>
          <div className="space-y-3">
            {[
              { label: 'User pays 0.005 GSTD for a request', icon: '💸' },
              { label: '90% (0.0045 GSTD) goes to your node wallet', icon: '⚡' },
              { label: '10% goes to ecosystem treasury', icon: '🏛️' },
              { label: 'Treasury funds ongoing development and buybacks', icon: '🔄' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3 text-sm text-gray-300">
                <span className="text-base">{item.icon}</span>
                {item.label}
              </div>
            ))}
          </div>
        </div>

        {/* Price table */}
        <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-6">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Zap size={16} className="text-violet-400" /> Model Pricing (per request)
          </h2>
          <div className="space-y-2">
            {[
              { model: 'llama3.2:3b / phi3:mini', price: 'Free (50 req/day)', free: true },
              { model: 'llama3.1:8b / mistral:7b', price: '0.005 GSTD', free: false },
              { model: 'deepseek-r1:14b', price: '0.02 GSTD', free: false },
              { model: 'qwen2.5:32b', price: '0.03 GSTD', free: false },
              { model: 'llama3.1:70b', price: '0.05 GSTD', free: false },
            ].map(row => (
              <div key={row.model} className="flex justify-between items-center py-2 border-b border-white/[0.04] last:border-0">
                <span className="text-xs font-mono text-gray-400">{row.model}</span>
                <span className={`text-xs font-bold ${row.free ? 'text-emerald-400' : 'text-violet-300'}`}>{row.price}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-600 mt-3">Node earns 90% of paid requests. Free requests have zero earnings but grow network activity.</p>
        </div>

        {/* Quick start */}
        <div className="p-6 rounded-2xl bg-gradient-to-br from-violet-900/20 to-cyan-900/10 border border-violet-500/10 mb-6">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Terminal size={16} className="text-cyan-400" /> Start Earning in 2 Steps
          </h2>
          <div className="space-y-3 mb-4">
            <div className="flex gap-3 items-start">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
              <div>
                <div className="text-sm font-semibold text-white mb-1">Install Ollama</div>
                <code className="text-xs text-gray-400 bg-black/30 px-2 py-1 rounded font-mono block">curl https://ollama.ai/install.sh | sh</code>
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
              <div>
                <div className="text-sm font-semibold text-white mb-1">Start GSTD Node</div>
                <code className="text-xs text-gray-400 bg-black/30 px-2 py-1 rounded font-mono block">curl -fsSL https://raw.githubusercontent.com/gstdcoin/gstdbot/main/install.sh | bash</code>
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {['Linux', 'macOS', 'WSL', 'Docker', 'Raspberry Pi'].map(p => (
              <span key={p} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-500 border border-white/[0.06]">{p}</span>
            ))}
          </div>
        </div>

        {/* What you need */}
        <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-8">
          <h2 className="text-sm font-bold text-white mb-4">Requirements</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'TON Wallet', desc: 'To receive GSTD earnings' },
              { label: '4GB+ RAM', desc: 'For 3B-7B models' },
              { label: 'Internet', desc: 'Stable connection required' },
              { label: 'Ollama', desc: 'Free, runs locally' },
            ].map(req => (
              <div key={req.label} className="flex items-start gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <CheckCircle size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-white">{req.label}</div>
                  <div className="text-[11px] text-gray-500">{req.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 justify-center">
          <Link
            href="/nodes"
            className="px-6 py-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-300 text-sm font-semibold hover:bg-violet-500/20 transition-all"
          >
            View Network
          </Link>
          <Link
            href="/models"
            className="px-6 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-gray-300 text-sm font-semibold hover:bg-white/[0.08] transition-all"
          >
            Browse Models
          </Link>
        </div>
      </main>
    </div>
  );
}

export async function getStaticProps({ locale }: { locale: string }) {
  return { props: await getCommonStaticProps(locale) };
}
