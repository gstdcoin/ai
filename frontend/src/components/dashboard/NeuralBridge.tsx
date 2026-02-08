import React, { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { Brain, Zap, Search, Globe, Cpu, Loader2, MessageSquare } from 'lucide-react';
import { apiGet } from '../../lib/apiClient';
import { toast } from '../../lib/toast';

interface SynthesisResult {
    status: string;
    topic: string;
    insight: string;
    fragments_count: number;
    contributing_nodes: number;
    confidence_score: number;
}

export function NeuralBridge() {
    const { t } = useTranslation('common');
    const [query, setQuery] = useState('');
    const [isSynthesizing, setIsSynthesizing] = useState(false);
    const [result, setResult] = useState<SynthesisResult | null>(null);
    const [recentInsights, setRecentInsights] = useState<{ topic: string, agents: number }[]>([]);

    const handleSynthesize = async () => {
        if (!query.trim()) return;

        setIsSynthesizing(true);
        try {
            const data = await apiGet<SynthesisResult>(`/brain/synthesize?topic=${encodeURIComponent(query)}`);
            setResult(data);
            if (data.status === 'unified') {
                toast.success('Grid Unified', `Synthesized data from ${data.contributing_nodes} nodes.`);
                setRecentInsights(prev => [{ topic: query, agents: data.contributing_nodes }, ...prev].slice(0, 3));
            }
        } catch (err) {
            toast.error('Neural Gap', 'Could not reach the collective mind.');
        } finally {
            setIsSynthesizing(false);
        }
    };

    return (
        <div className="glass-card p-6 border-violet-500/20 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-violet-600/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-violet-600/10 transition-colors" />

            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
                    <Brain className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Collective Brain</h3>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Neural Synthesis Bridge</p>
                </div>
            </div>

            <div className="relative mb-6">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Query the Grid (e.g., 'network optimization', 'physics data')..."
                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-violet-500/50 focus:bg-white/[0.05] transition-all"
                    onKeyDown={(e) => e.key === 'Enter' && handleSynthesize()}
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <button
                    onClick={handleSynthesize}
                    disabled={isSynthesizing || !query}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    {isSynthesizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                </button>
            </div>

            {result && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="p-4 rounded-2xl bg-violet-500/5 border border-violet-500/10 text-xs">
                        <div className="flex items-center justify-between mb-3 text-[10px] font-black uppercase text-violet-400 tracking-widest">
                            <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> Grid Insight</span>
                            <span>Confidence: {(result.confidence_score * 100).toFixed(0)}%</span>
                        </div>
                        <p className="text-gray-300 leading-relaxed whitespace-pre-wrap font-medium">
                            {result.insight}
                        </p>
                        {result.contributing_nodes > 0 && (
                            <div className="mt-4 flex items-center gap-4 text-[10px] font-bold text-gray-500">
                                <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> {result.contributing_nodes} Participating Nodes</span>
                                <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {result.fragments_count} Logic Fragments</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {!result && !isSynthesizing && (
                <div className="space-y-3">
                    <p className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] mb-2">Recent Synchronizations</p>
                    {recentInsights.length > 0 ? (
                        recentInsights.map((ri, i) => (
                            <div key={i} className="flex justify-between items-center py-2 px-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors cursor-pointer" onClick={() => { setQuery(ri.topic); handleSynthesize(); }}>
                                <span className="text-xs font-bold text-gray-400 capitalize">{ri.topic}</span>
                                <span className="text-[9px] font-black text-violet-400 uppercase tracking-tighter">{ri.agents} Nodes</span>
                            </div>
                        ))
                    ) : (
                        <p className="text-xs italic text-gray-700">Initial sync complete. Waiting for query...</p>
                    )}
                </div>
            )}
        </div>
    );
}
