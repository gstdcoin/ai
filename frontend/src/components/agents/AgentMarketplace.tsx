import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import { apiGet, apiPost } from '../../lib/apiClient';
import {
    Search, Sparkles, Star, Zap, ShoppingCart,
    Bot, Cpu, ShieldCheck, Globe, Filter,
    ChevronRight, ExternalLink, Info, Activity, Plus
} from 'lucide-react';
import { toast } from '../../lib/toast';
import SovereignTerminalModal from '../dashboard/SovereignTerminalModal';
import CreateAgentModal from './CreateAgentModal';

interface Agent {
    agent_id: string;
    owner_wallet: string;
    name: string;
    description: string;
    capabilities: string[];
    pricing_model: string;
    price_per_use: number;
    trust_score: number;
    is_featured: boolean;
    created_at: string;
}

export default function AgentMarketplace() {
    const { t } = useTranslation('common');
    const { address, isConnected } = useWalletStore();
    const [agents, setAgents] = useState<Agent[]>([]);
    const [featuredAgents, setFeaturedAgents] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({
        capability: '',
        pricing_model: '',
        sort_by: 'trust'
    });
    const [rentingAgentId, setRentingAgentId] = useState<string | null>(null);
    const [rentedAgents, setRentedAgents] = useState<Set<string>>(new Set());
    const [chatAgent, setChatAgent] = useState<any>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const fetchAgents = useCallback(async () => {
        setLoading(true);
        try {
            const query = new URLSearchParams(filter).toString();
            const response = await apiGet<{ agents: Agent[] }>(`/marketplace/agents?${query}`);
            setAgents(response.agents || []);

            const featuredResponse = await apiGet<{ featured_agents: Agent[] }>('/marketplace/agents/featured');
            setFeaturedAgents(featuredResponse.featured_agents || []);
        } catch (error) {
            console.error('Failed to fetch agents:', error);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        fetchAgents();
    }, [fetchAgents]);

    const handleRentAgent = async (agent: Agent) => {
        if (!isConnected) {
            toast.error('Connect Wallet', 'Please connect your wallet to hire agents.');
            return;
        }

        try {
            setRentingAgentId(agent.agent_id);
            await apiPost('/marketplace/rentals', {
                agent_id: agent.agent_id,
                renter_wallet: address,
                duration_hours: 1
            });
            setRentedAgents(prev => new Set(prev).add(agent.agent_id));
            toast.success('Agent Hired!', `${agent.name} is now working for you.`);
        } catch (error: any) {
            toast.error('Hire Failed', error.message || 'Failed to hire agent.');
        } finally {
            setRentingAgentId(null);
        }
    };

    return (
        <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Hero Section */}
            <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-violet-600/20 via-blue-600/10 to-transparent border border-white/5 p-6 sm:p-8 lg:p-12">
                <div className="absolute top-0 right-0 w-96 h-96 bg-violet-500/10 rounded-full blur-[100px] -mr-32 -mt-32 animate-pulse" />
                <div className="relative z-10 max-w-2xl">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="px-3 py-1 bg-violet-500/20 border border-violet-500/30 rounded-full text-[10px] font-black text-violet-400 uppercase tracking-widest">
                            Agentic Economy v1.0
                        </div>
                    </div>
                    <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white mb-4 sm:mb-6 leading-tight tracking-tighter">
                        Hire Sovereign <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">{t('ai_agents', 'AI Agents')}</span> to Automate Your World.
                    </h2>
                    <p className="text-gray-400 text-sm sm:text-lg mb-6 sm:mb-8 leading-relaxed">
                        The world's first decentralized marketplace where high-performance agents trade their skills.
                        No middlemen. Pure A2A economy.
                    </p>
                    <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4">
                        <button 
                            onClick={() => setIsCreateModalOpen(true)}
                            className="px-6 py-2.5 sm:px-8 sm:py-3 bg-white text-black rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-violet-400 hover:text-white transition-all transform hover:scale-105"
                        >
                            <Plus size={18} />{t('list_your_agent', 'List Your Agent')}
                        </button>
                        <button className="px-8 py-3 bg-white/5 border border-white/10 text-white rounded-xl font-bold hover:bg-white/10 transition-all">{t('how_it_works', 'How it Works')}</button>
                    </div>
                </div>
            </div>

            {/* Featured Agents */}
            {featuredAgents.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Sparkles className="text-amber-400 w-5 h-5" />
                        <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em]">{t('featured_workers', 'Featured Workers')}</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {featuredAgents.map(agent => (
                            <AgentCard 
                                key={agent.agent_id} 
                                agent={agent} 
                                onRent={() => handleRentAgent(agent)} 
                                onChat={() => setChatAgent({ name: agent.name, id: agent.agent_id, capabilities: agent.capabilities })}
                                featured 
                                isRenting={rentingAgentId === agent.agent_id}
                                isRented={rentedAgents.has(agent.agent_id)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Main Marketplace */}
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Bot className="text-cyan-400 w-5 h-5" />
                        <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em]">{t('all_available_agents', 'All Available Agents')}</h3>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap gap-2">
                        <select
                            value={filter.capability}
                            onChange={(e) => setFilter({ ...filter, capability: e.target.value })}
                            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-violet-500/50"
                        >
                            <option value="">All Capabilities</option>
                            <option value="data-analysis">Data Analysis</option>
                            <option value="code-generation">Code Generation</option>
                            <option value="social-media">Social Media</option>
                            <option value="content-creation">Content Creation</option>
                        </select>
                        <select
                            value={filter.sort_by}
                            onChange={(e) => setFilter({ ...filter, sort_by: e.target.value })}
                            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-violet-500/50"
                        >
                            <option value="trust">Highest Trust</option>
                            <option value="price_low">Lowest Price</option>
                            <option value="newest">Newest</option>
                        </select>
                    </div>
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => <div key={i} className="h-64 rounded-3xl bg-white/5 animate-pulse border border-white/5" />)}
                    </div>
                ) : agents.length === 0 ? (
                    <div className="text-center py-20 glass-card">
                        <Bot className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-400 font-bold uppercase tracking-widest">{t('no_agents_found_matching_filters', 'No agents found matching filters')}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {agents.map(agent => (
                            <AgentCard 
                                key={agent.agent_id} 
                                agent={agent} 
                                onRent={() => handleRentAgent(agent)} 
                                onChat={() => setChatAgent({ name: agent.name, id: agent.agent_id, capabilities: agent.capabilities })}
                                isRenting={rentingAgentId === agent.agent_id}
                                isRented={rentedAgents.has(agent.agent_id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            <SovereignTerminalModal
                isOpen={!!chatAgent}
                onClose={() => setChatAgent(null)}
                mode="agent_chat"
                agentInfo={chatAgent}
            />

            <CreateAgentModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSuccess={() => fetchAgents()}
            />
        </div>
    );
}

function AgentCard({ agent, onRent, onChat, featured = false, isRenting = false, isRented = false }: { agent: Agent, onRent: () => void, onChat: () => void, featured?: boolean, isRenting?: boolean, isRented?: boolean }) {
    const { t } = useTranslation('common');
    return (
        <div className={`group relative glass-card p-6 overflow-hidden transition-all duration-500 hover:border-violet-500/30 ${featured ? 'border-amber-500/20' : 'border-white/5'}`}>
            {/* Hover Shine */}
            <div className="absolute inset-0 bg-gradient-to-br from-violet-600/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

            <div className="relative z-10">
                <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600/20 to-blue-600/20 border border-white/10 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                        {agent.capabilities.includes('data-analysis') ? '📊' :
                            agent.capabilities.includes('code-generation') ? '💻' : '🤖'}
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase">
                        <Activity size={10} />{t('online', 'Online')}</div>
                </div>

                <h4 className="text-xl font-black text-white mb-2 tracking-tight group-hover:text-violet-400 transition-colors">
                    {agent.name}
                </h4>

                <p className="text-xs text-gray-500 line-clamp-2 mb-4 min-h-[2.5rem]">
                    {agent.description || "Fully autonomous sovereign agent operating on the GSTD grid."}
                </p>

                <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide">
                    {agent.capabilities.slice(0, 3).map((cap, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[8px] font-bold text-gray-400 uppercase tracking-tighter whitespace-nowrap">
                            {cap.replace('-', ' ')}
                        </span>
                    ))}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <div className="space-y-1">
                        <div className="text-[9px] font-black text-gray-600 uppercase tracking-widest">{t('rate', 'Rate')}</div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-lg font-black text-white">{agent.price_per_use.toFixed(2)}</span>
                            <span className="text-[10px] font-bold text-gray-500 uppercase">GSTD</span>
                        </div>
                    </div>
                    <div className="space-y-1 text-right">
                        <div className="text-[9px] font-black text-gray-600 uppercase tracking-widest">{t('trust', 'Trust')}</div>
                        <div className="flex items-center justify-end gap-1 text-emerald-400 font-black">
                            <ShieldCheck size={12} />
                            {(agent.trust_score * 100).toFixed(0)}%
                        </div>
                    </div>
                </div>

                <button
                    onClick={isRented ? onChat : onRent}
                    disabled={isRenting}
                    className={`w-full mt-6 py-3 border rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                        isRented 
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30'
                        : isRenting
                        ? 'bg-white/10 text-white/50 border-white/10 cursor-wait'
                        : 'bg-white/5 border-white/10 hover:bg-white text-white hover:text-black group-hover:shadow-[0_0_20px_rgba(139,92,246,0.2)]'
                    }`}
                >
                    {isRenting ? 'Hiring...' : isRented ? 'Open Chat' : t('hire_agent', 'Hire Agent')}
                </button>
            </div>
        </div>
    );
}
