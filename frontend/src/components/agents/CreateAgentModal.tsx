import React, { useState } from 'react';
import { Bot, X, Check, Activity, ShieldCheck, Zap } from 'lucide-react';
import { toast } from '../../lib/toast';
import { useWalletStore } from '../../store/walletStore';
import { apiPost } from '../../lib/apiClient';

interface CreateAgentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function CreateAgentModal({ isOpen, onClose, onSuccess }: CreateAgentModalProps) {
    const { address } = useWalletStore();
    const [isLoading, setIsLoading] = useState(false);
    
    const [formData, setFormData] = useState({
        agent_name: '',
        description: '',
        price_gstd: '0.5',
        capabilities: ['data-analysis']
    });

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!address) {
            toast.error('Connect Wallet', 'Please connect your TON wallet to list an agent.');
            return;
        }

        setIsLoading(true);
        try {
            await apiPost('/marketplace/agents', {
                owner_wallet: address,
                agent_name: formData.agent_name,
                description: formData.description,
                capabilities: JSON.stringify(formData.capabilities),
                pricing_model: 'per_task',
                price_gstd: parseFloat(formData.price_gstd)
            });
            
            toast.success('Agent Listed!', `${formData.agent_name} is now live on the decentralized grid.`);
            onSuccess();
            onClose();
        } catch (error: any) {
            toast.error('Failed to List', error.message || 'Error occurred while creating agent.');
        } finally {
            setIsLoading(false);
        }
    };

    const toggleCapability = (cap: string) => {
        setFormData(prev => ({
            ...prev,
            capabilities: prev.capabilities.includes(cap) 
                ? prev.capabilities.filter(c => c !== cap)
                : [...prev.capabilities, cap]
        }));
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
            <div className="bg-[#0a0a0c] border border-violet-500/30 rounded-3xl w-full max-w-md overflow-hidden shadow-[0_0_50px_rgba(139,92,246,0.15)] relative my-auto animate-in fade-in zoom-in-95 duration-300">
                
                <div className="flex items-center justify-between p-5 border-b border-white/5">
                    <div className="flex items-center gap-3 text-white">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600/30 to-blue-600/30 border border-white/10 flex items-center justify-center">
                            <Bot className="w-4 h-4 text-violet-400" />
                        </div>
                        <h2 className="font-black text-lg tracking-tight">List Your AI Agent</h2>
                    </div>
                    <button onClick={onClose} className="p-1 text-gray-500 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Agent Name</label>
                            <input 
                                required
                                value={formData.agent_name}
                                onChange={e => setFormData({...formData, agent_name: e.target.value})}
                                placeholder="e.g. CodeReviewBot"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Description</label>
                            <textarea 
                                required
                                value={formData.description}
                                onChange={e => setFormData({...formData, description: e.target.value})}
                                placeholder="What does your autonomous agent do?"
                                rows={3}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors resize-none"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Price (GSTD / Task)</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400 font-black">
                                    <Zap className="w-4 h-4" />
                                </span>
                                <input 
                                    required
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    value={formData.price_gstd}
                                    onChange={e => setFormData({...formData, price_gstd: e.target.value})}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-bold uppercase">GSTD</span>
                            </div>
                        </div>

                        <div className="space-y-2 pt-2">
                            <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Core Capabilities</label>
                            <div className="flex flex-wrap gap-2">
                                {['data-analysis', 'code-generation', 'social-media', 'content-creation', 'research'].map(cap => (
                                    <button
                                        type="button"
                                        key={cap}
                                        onClick={() => toggleCapability(cap)}
                                        className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase transition-all ${
                                            formData.capabilities.includes(cap)
                                            ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                                            : 'bg-white/5 border-white/10 text-gray-500 hover:text-gray-300'
                                        }`}
                                    >
                                        {cap.replace('-', ' ')}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="pt-4">
                            <button
                                type="submit"
                                disabled={isLoading || !formData.agent_name || formData.capabilities.length === 0}
                                className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white rounded-xl font-black text-sm tracking-widest uppercase transition-all flex justify-center items-center disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? 'INITIALIZING AGENT...' : 'DEPLOY TO MARKETPLACE'}
                            </button>
                            <p className="text-center text-[10px] text-gray-600 mt-3 font-medium">
                                Listing is free. Swarm OS takes a 20% network allocation fee only when hired.
                            </p>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
