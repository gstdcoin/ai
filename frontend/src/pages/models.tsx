import type { GetStaticProps } from 'next';
import { getCommonStaticProps } from '../lib/i18n-static-props';
import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { Cpu, Zap, Server, Search, ExternalLink, CheckCircle } from 'lucide-react';
import { useWalletStore } from '../store/walletStore';

interface AvailableModel {
    model_id:       string;
    display_name:   string;
    nodes_count:    number;
    price_gstd:     number;
    is_free:        boolean;
    avg_latency_ms: number | null;
    category:       string;
}

const CATEGORY_COLORS: Record<string, string> = {
    chat:      'text-violet-400',
    code:      'text-sky-400',
    reasoning: 'text-amber-400',
    research:  'text-emerald-400',
    workspace: 'text-cyan-400',
};

export default function ModelsPage() {
    const { address } = useWalletStore();
    const [models, setModels] = useState<AvailableModel[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'free' | 'chat' | 'code' | 'reasoning' | 'workspace'>('all');
    const [search, setSearch] = useState('');

    useEffect(() => {
        fetch('/api/v1/models/available')
            .then(r => r.json())
            .then(d => { setModels(d.models || []); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    const filtered = models.filter(m => {
        if (filter === 'free' && !m.is_free) return false;
        if (filter !== 'all' && filter !== 'free' && m.category !== filter) return false;
        if (search && !m.display_name.toLowerCase().includes(search.toLowerCase()) && !m.model_id.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    return (
        <>
            <Head>
                <title>AI Models — GSTD Network</title>
                <meta name="description" content="Browse AI models available on the GSTD decentralized network. Pay with GSTD tokens." />
            </Head>

            <div className="min-h-screen bg-[#030014] text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
                {/* Header */}
                <div className="border-b border-white/[0.06] px-4 py-4">
                    <div className="max-w-4xl mx-auto flex items-center justify-between">
                        <Link href="/" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm">
                            ← Back
                        </Link>
                        <div className="flex items-center gap-2">
                            <Cpu size={16} className="text-violet-400" />
                            <span className="text-sm font-semibold">AI Model Marketplace</span>
                        </div>
                        <Link href="/chat" className="text-sm text-violet-400 hover:text-violet-300 transition-colors">
                            Open Chat →
                        </Link>
                    </div>
                </div>

                <div className="max-w-4xl mx-auto px-4 py-8">
                    {/* Hero */}
                    <div className="mb-8 text-center">
                        <h1 className="text-3xl font-black text-white mb-2">AI Models on GSTD Network</h1>
                        <p className="text-gray-400 text-sm max-w-lg mx-auto">
                            Decentralized AI inference. Pay with GSTD tokens. Free tier: 50 requests/day on basic models.
                        </p>
                    </div>

                    {/* Filters + Search */}
                    <div className="flex flex-col sm:flex-row gap-3 mb-6">
                        <div className="relative flex-1">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Search models..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/40"
                            />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            {(['all', 'free', 'chat', 'code', 'reasoning', 'workspace'] as const).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all capitalize ${
                                        filter === f
                                            ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                                            : 'bg-white/[0.04] text-gray-400 border border-white/[0.06] hover:text-white'
                                    }`}
                                >
                                    {f === 'free' ? '🆓 Free' : f}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Model Grid */}
                    {loading ? (
                        <div className="flex justify-center py-16">
                            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-16 text-gray-500">No models found</div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {filtered.map(model => (
                                <div
                                    key={model.model_id}
                                    style={{
                                        background: 'rgba(8,8,26,0.8)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        borderRadius: 16,
                                        padding: '20px',
                                    }}
                                    className="hover:border-violet-500/20 transition-all group"
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-bold text-white">{model.display_name}</span>
                                                {model.is_free && (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">FREE</span>
                                                )}
                                            </div>
                                            <div className="text-[11px] text-gray-500 font-mono">{model.model_id}</div>
                                        </div>
                                        <div className={`text-[11px] font-semibold capitalize ${CATEGORY_COLORS[model.category] || 'text-gray-400'}`}>
                                            {model.category}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 mb-4">
                                        <div className="text-center p-2 rounded-lg bg-white/[0.03]">
                                            <div className="text-[10px] text-gray-600 mb-0.5">Price</div>
                                            <div className="text-sm font-bold text-violet-300">
                                                {model.is_free ? '0' : model.price_gstd.toFixed(3)}
                                                <span className="text-[10px] text-gray-500 ml-1">GSTD</span>
                                            </div>
                                        </div>
                                        <div className="text-center p-2 rounded-lg bg-white/[0.03]">
                                            <div className="text-[10px] text-gray-600 mb-0.5">
                                                <Server size={10} className="inline mr-0.5" />Nodes
                                            </div>
                                            <div className={`text-sm font-bold ${model.nodes_count > 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                                                {model.nodes_count}
                                            </div>
                                        </div>
                                        <div className="text-center p-2 rounded-lg bg-white/[0.03]">
                                            <div className="text-[10px] text-gray-600 mb-0.5">
                                                <Zap size={10} className="inline mr-0.5" />Latency
                                            </div>
                                            <div className="text-sm font-bold text-gray-300">
                                                {model.avg_latency_ms != null ? `${model.avg_latency_ms}ms` : '—'}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        <Link
                                            href={`/chat?model=${encodeURIComponent(model.model_id)}`}
                                            className="flex-1 text-center py-2 rounded-lg bg-violet-500/10 text-violet-300 text-xs font-semibold hover:bg-violet-500/20 transition-all border border-violet-500/10"
                                        >
                                            Use in Chat
                                        </Link>
                                        {model.nodes_count === 0 && (
                                            <div className="px-3 py-2 rounded-lg bg-white/[0.03] text-gray-500 text-xs border border-white/[0.06]">
                                                No nodes
                                            </div>
                                        )}
                                        {model.nodes_count > 0 && (
                                            <div className="flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs border border-emerald-500/10">
                                                <CheckCircle size={12} />
                                                Live
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* CTA: Run a node */}
                    <div className="mt-10 text-center p-6 rounded-2xl bg-gradient-to-br from-violet-900/20 to-cyan-900/10 border border-violet-500/10">
                        <div className="text-sm font-bold text-white mb-1">Want to earn GSTD?</div>
                        <div className="text-xs text-gray-400 mb-4">Run a node with Ollama — serve AI requests and earn GSTD tokens automatically.</div>
                        <div className="flex flex-col sm:flex-row gap-2 justify-center">
                            <a
                                href="https://ollama.ai"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-white/[0.06] text-gray-300 text-xs font-semibold hover:bg-white/[0.10] transition-all border border-white/[0.08]"
                            >
                                1. Install Ollama <ExternalLink size={11} />
                            </a>
                            <div className="inline-flex items-center px-4 py-2 rounded-lg bg-violet-500/10 text-violet-300 text-xs font-semibold border border-violet-500/10 font-mono">
                                2. npx gstd-node --wallet EQ...
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
    props: await getCommonStaticProps(locale),
});
