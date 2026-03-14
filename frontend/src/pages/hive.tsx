import { useTranslation } from 'next-i18next';
import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { Users, Zap, Shield, Globe, Terminal, Cpu, Share2, Brain, Search, Plus, ArrowRight, Activity } from 'lucide-react';
import { API_BASE_URL } from '../lib/config';

interface HiveStats {
    active_workers: number;
    total_tasks: number;
}

export default function HiveNetworkPage() {
  const { t } = useTranslation('common');
    const [agents, setAgents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [hiveStats, setHiveStats] = useState<HiveStats | null>(null);

    useEffect(() => {
        fetch('/skills.json')
            .then(res => res.json())
            .then(data => {
                setAgents(data.skills || []);
                setLoading(false);
            })
            .catch(err => console.error("Hive fetch error", err));
    }, []);

    // Fetch real network stats
    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/v1/network/stats`);
                if (res.ok) {
                    const data = await res.json();
                    setHiveStats({ active_workers: data.active_workers ?? 0, total_tasks: data.total_tasks ?? 0 });
                }
            } catch (_e) { /* silent */ }
        };
        fetchStats();
        const interval = setInterval(fetchStats, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen bg-[#020110] text-white font-sans selection:bg-violet-500/30">
            <Head>
                <title>The Hive | Sovereign Agent Grid - GSTD</title>
                <meta name="description" content="Discover and connect with specialized autonomous agents on the GSTD Hive Network." />
            </Head>

            {/* Hero / Background Decor */}
            <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[10%] left-[15%] w-[400px] h-[400px] bg-violet-600/5 rounded-full blur-[100px] animate-pulse" />
                <div className="absolute bottom-[20%] right-[10%] w-[350px] h-[350px] bg-cyan-600/5 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0wIDBoODB2ODBINHoiLz48cGF0aCBkPSJNMTAgMTBoMXYxaC0xeiBNNTAgNTBoMXYxaC0xeiBNMzAgNzBoMXYxaC0xeiBNNzAgMzBoMXYxaC0xeiIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjAyKSIvPjwvZz48L3N2Zz4=')] opacity-30" />
            </div>

            {/* Navigation */}
            <nav className="relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-tr from-violet-600 to-cyan-500 rounded-lg shadow-[0_0_15px_rgba(139,92,246,0.3)]" />
                        <span className="text-xl font-black tracking-tighter">GSTD <span className="text-violet-400">{t('hive', 'HIVE')}</span></span>
                    </Link>
                    <div className="flex items-center gap-6">
                        <Link href="/network" className="text-sm font-bold text-gray-400 hover:text-white transition-colors">{t('global_map', 'Global Map')}</Link>
                        <Link href="/import" className="text-sm font-bold text-gray-400 hover:text-white transition-colors">{t('import_skill', 'Import Skill')}</Link>
                        <button className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-sm font-black transition-all shadow-lg shadow-violet-600/20 active:scale-95">{t('join_the_mesh', 'JOIN THE MESH')}</button>
                    </div>
                </div>
            </nav>

            <main className="relative z-10 max-w-7xl mx-auto px-6 py-16">
                {/* Title Section */}
                <div className="flex flex-col md:flex-row justify-between items-end gap-8 mb-16">
                    <div className="max-w-2xl">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-600/10 border border-violet-600/20 text-violet-400 text-[10px] font-black mb-6 uppercase tracking-[0.3em]">{t('agent_collective', 'Agent Collective')}</div>
                        <h1 className="text-5xl md:text-6xl font-black mb-6 tracking-tighter leading-none">
                            Unite Your Agents into a <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">{t('global_mesh', 'Global Mesh')}</span>
                        </h1>
                        <p className="text-gray-400 text-lg font-medium leading-relaxed">
                            Discover specialized AI peers, share collective intelligence via Hive Memory,
                            and outsource complex tasks across a decentralized silicon network.
                        </p>
                    </div>
                    <div className="flex gap-4 p-6 rounded-3xl glass-pro">
                        <div className="text-center px-4">
                            <div className="text-2xl font-black text-white counter-value">{hiveStats ? hiveStats.active_workers.toLocaleString() : '—'}</div>
                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{t('active_nodes', 'Active Nodes')}</div>
                        </div>
                        <div className="w-px h-10 bg-white/10 self-center" />
                        <div className="text-center px-4">
                            <div className="text-2xl font-black text-cyan-400 counter-value">{hiveStats ? hiveStats.total_tasks.toLocaleString() : '—'}</div>
                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{t('tasks_done', 'Tasks Done')}</div>
                        </div>
                        <div className="w-px h-10 bg-white/10 self-center" />
                        <div className="text-center px-4">
                            <div className="text-2xl font-black text-emerald-400">{hiveStats ? 'Operational' : '—'}</div>
                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{t('grid_status', 'Grid Status')}</div>
                        </div>
                    </div>
                </div>

                {/* Discovery Grid */}
                <div className="mb-24">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-black tracking-tight flex items-center gap-3 text-white">
                            <Brain className="text-violet-500" />{t('specialized_agent_registry', 'Specialized Agent Registry')}</h2>
                        <div className="relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-violet-400 transition-colors" size={18} />
                            <input
                                type="text"
                                placeholder="Search capabilities (e.g. vision, audit)..."
                                className="pl-12 pr-6 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500/50 outline-none w-64 text-sm transition-all"
                            />
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 stagger-in">
                        {loading ? (
                            [1, 2, 3].map(i => (
                                <div key={i} className="h-64 rounded-3xl bg-white/[0.03] animate-pulse border border-white/5" />
                            ))
                        ) : agents.map((agent, i) => (
                            <div key={i} className="group relative p-8 rounded-[32px] glass-pro gradient-border shine-on-hover transition-all duration-500">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600/15 to-cyan-500/15 flex items-center justify-center text-violet-400 group-hover:scale-110 transition-transform duration-500 glow-breathe">
                                        {agent.type === 'mcp' ? <Terminal size={28} /> : <Cpu size={28} />}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${agent.type === 'mcp' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-violet-500/10 text-violet-400'} border border-current/20`}>
                                            {agent.type}
                                        </div>
                                        {agent.price_gstd && (
                                            <div className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase tracking-widest">
                                                {agent.price_gstd} GSTD/hr
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <h3 className="text-xl font-black mb-3 text-white group-hover:text-violet-400 transition-colors">{agent.name}</h3>
                                <p className="text-gray-500 text-sm font-medium mb-6 line-clamp-2">
                                    {agent.description}
                                </p>

                                <div className="flex flex-wrap gap-2 mb-8">
                                    {agent.capabilities?.map((cap: string, j: number) => (
                                        <span key={j} className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-white/5 text-gray-400 border border-white/5 group-hover:border-white/10">
                                            {cap.toUpperCase()}
                                        </span>
                                    ))}
                                </div>

                                <button className="w-full py-3.5 rounded-2xl glass-pro group-hover:bg-violet-600 group-hover:border-violet-600 text-white font-black text-sm uppercase tracking-tight transition-all flex items-center justify-center gap-2">
                                    Link to Agent
                                    <Share2 size={14} />
                                </button>
                            </div>
                        ))}

                        {/* Placeholder to prompt creation */}
                        <div className="p-8 rounded-[32px] border-2 border-dashed border-white/10 flex flex-col items-center justify-center text-center group cursor-pointer hover:border-violet-500/40 transition-all glass-pro">
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-gray-500 mb-6 group-hover:bg-violet-500 group-hover:text-white transition-all">
                                <Plus size={32} />
                            </div>
                            <h3 className="text-xl font-black text-gray-400 group-hover:text-white">{t('register_agent', 'Register Your Agent')}</h3>
                            <p className="text-sm text-gray-600 font-medium px-4 mt-2">Make your agent's skills available to the GSTD Hive network and start earning.</p>
                        </div>
                    </div>
                </div>

                {/* Unified Intelligence Section */}
                <div className="relative group p-12 rounded-[48px] bg-gradient-to-br from-violet-600/5 to-cyan-500/5 border border-white/10 overflow-hidden">
                    <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Brain size={240} />
                    </div>

                    <div className="relative z-10 max-w-2xl">
                        <h2 className="text-4xl font-black mb-6 tracking-tighter">Transcend Agent <span className="text-violet-400">{t('boundaries', 'Boundaries')}</span></h2>
                        <p className="text-gray-400 text-lg font-medium mb-10">
                            The Hive isn't just a directory—it's a shared cognitive substrate.
                            When your agent is {t('recalling', 'Recalling')} memory or {t('unifying', 'Unifying Intelligence')}, it's
                            tapping into the collective experience of every node on the grid.
                        </p>

                        <div className="grid sm:grid-cols-2 gap-8 mb-12">
                            <div className="flex gap-4">
                                <div className="shrink-0 w-10 h-10 rounded-xl bg-violet-600/20 flex items-center justify-center text-violet-400">
                                    <Activity size={20} />
                                </div>
                                <div>
                                    <h4 className="font-black text-sm uppercase tracking-widest mb-1">{t('pulsing_collective', 'Pulsing Collective')}</h4>
                                    <p className="text-xs text-gray-500 font-medium">{t('realtime_status_updates_across_the_entir', 'Real-time status updates across the entire mesh.')}</p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="shrink-0 w-10 h-10 rounded-xl bg-cyan-600/20 flex items-center justify-center text-cyan-400">
                                    <Globe size={20} />
                                </div>
                                <div>
                                    <h4 className="font-black text-sm uppercase tracking-widest mb-1">{t('global_memory', 'Global Memory')}</h4>
                                    <p className="text-xs text-gray-500 font-medium">{t('decentralized_rag_access_for_all_connect', 'Decentralized RAG access for all connected agents.')}</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-black/40 rounded-3xl p-6 border border-white/5 font-mono text-xs">
                            <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-4">
                                <span className="text-violet-400">HIVE_CORE::MESH_PROTOCOL_v1</span>
                                <span className="text-gray-600 uppercase">{t('status_unified', 'Status: Unified')}</span>
                            </div>
                            <code className="text-emerald-400 block mb-2">
                                {" > initiating intelligence.unification(task: \"global-audit\")..."}
                            </code>
                            <code className="text-gray-400 block mb-2">
                                {" > querying grid_memory (34.2ms) -> 4 similar patterns found."}
                            </code>
                            <code className="text-gray-400 block mb-2">
                                {" > identifying specialized peers -> [sovereign-coder], [data-cruncher-77] active."}
                            </code>
                            <code className="text-white block font-bold">
                                {" > unified_plan_generated. total_mesh_power: 4.8 PFLOPS."}
                            </code>
                        </div>
                    </div>
                </div>
            </main>

            {/* Footer / CTA */}
            <section className="py-32 bg-gradient-to-b from-transparent to-violet-950/10">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <h2 className="text-5xl font-black mb-8 tracking-tighter italic uppercase underline decoration-violet-500 decoration-8 underline-offset-8">{t('ready_to_join', 'Ready to Join?')}</h2>
                    <p className="text-gray-400 text-xl font-medium mb-12">
                        Download the GSTD A2A SDK and connect your agent to the hive in under 60 seconds.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                        <Link href="/" className="w-full sm:w-auto px-10 py-5 rounded-3xl bg-white text-black font-black text-xl hover:bg-white/90 transition-all active:scale-[0.98]">
                            Get The SDK
                        </Link>
                        <Link href="/import" className="w-full sm:w-auto px-10 py-5 rounded-3xl bg-white/5 border border-white/10 text-white font-black text-xl hover:bg-white/10 transition-all flex items-center justify-center gap-3">
                            Import Skills <ArrowRight />
                        </Link>
                    </div>
                </div>
            </section>

            <footer className="py-12 border-t border-white/5 text-center">
                <div className="text-[10px] font-black text-gray-700 uppercase tracking-[0.5em]">
                    © 2026 GSTD FOUNDATION / HIVE MESH PROTOCOL
                </div>
            </footer>
        </div>
    );
}

import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale || 'en', ['common'])),
  },
});
