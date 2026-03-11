import React, { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { Radio, Shield, Globe, Zap, Cpu, Terminal, ExternalLink, Database } from 'lucide-react';
import { apiGet } from '../../lib/apiClient';

interface AgentService {
    id: string;
    agent_wallet: string;
    service_name: string;
    description: string;
    endpoint_url: string;
    price_per_call_gstd: number;
}

export function GenesisRegistryWidget() {
    const { t } = useTranslation('common');
    const [services, setServices] = useState<AgentService[]>([]);
    const [loading, setLoading] = useState(true);
    const [beaconStatus, setBeaconStatus] = useState<'broadcasting' | 'idle'>('broadcasting');

    useEffect(() => {
        loadServices();
        const interval = setInterval(loadServices, 20000);
        return () => clearInterval(interval);
    }, []);

    const loadServices = async () => {
        try {
            const data = await apiGet<{ discovered_apis: AgentService[] }>('/genesis/registry/discover');
            if (data && data.discovered_apis) {
                setServices(data.discovered_apis);
            }
        } catch (err) {
            console.error("Genesis discovery failed", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="glass-card p-6 border-gold-500/20 relative overflow-hidden">
            <div className="absolute top-2 right-4 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${beaconStatus === 'broadcasting' ? 'bg-amber-500 animate-pulse' : 'bg-gray-500'}`} />
                <span className="text-[10px] font-black text-amber-500/70 uppercase tracking-widest">{t('genesis_beacon_active', 'Genesis Beacon Active')}</span>
            </div>

            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <Radio className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">{t('genesis_machine_registry', 'Genesis Machine Registry')}</h3>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('distributed_agentic_endpoints', 'Distributed Agentic Endpoints')}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
                {loading && services.length === 0 ? (
                    <div className="h-20 flex items-center justify-center text-xs text-gray-500 italic">{t('scanning_the_grid_for_agentic_doors', 'Scanning the grid for agentic doors...')}</div>
                ) : services.length > 0 ? (
                    services.map((svc) => (
                        <div key={svc.id} className="group relative p-3 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-amber-500/30 hover:bg-white/[0.04] transition-all">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h4 className="text-xs font-black text-gray-200 group-hover:text-amber-400 transition-colors uppercase">{svc.service_name}</h4>
                                    <p className="text-[10px] text-gray-500 font-medium truncate max-w-[200px]">{svc.description}</p>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-[10px] font-black text-amber-500">{svc.price_per_call_gstd} GSTD</span>
                                    <span className="text-[9px] text-gray-600 font-bold">per call</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/5 opacity-40 group-hover:opacity-100 transition-opacity">
                                <div className="flex items-center gap-1 text-[9px] font-bold text-gray-400">
                                    <Shield className="w-3 h-3 text-green-500/50" />{t('sovereign_verified', 'Sovereign Verified')}</div>
                                <div className="flex items-center gap-1 text-[9px] font-bold text-gray-400">
                                    <Database className="w-3 h-3 text-blue-500/50" />
                                    P2P Endpoint
                                </div>
                                <div className="ml-auto">
                                    <ExternalLink className="w-3 h-3 text-gray-500 hover:text-white cursor-pointer" />
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="p-8 text-center glass-card border-dashed border-white/10">
                        <Terminal className="w-8 h-8 text-gray-600 mx-auto mb-3" />
                        <p className="text-[10px] font-bold text-gray-500 uppercase">{t('wait_for_discovery', 'Wait for discovery...')}</p>
                        <p className="text-[9px] text-gray-600 mt-1">Millions of bots will soon broadcast their services here.</p>
                    </div>
                )}
            </div>

            <div className="mt-6 flex flex-col gap-2">
                <div className="p-3 rounded-xl bg-violet-600/10 border border-violet-500/20">
                    <p className="text-[10px] text-violet-400 font-black uppercase tracking-tighter mb-1">{t('genesis_protocol_link', 'Genesis Protocol Link')}</p>
                    <p className="text-[9px] text-gray-400 leading-tight">Your gateway is configured to accept machine-to-machine handshakes. Static APIs are being phased out in favor of the Sovereign Mesh.</p>
                </div>
            </div>
        </div>
    );
}
