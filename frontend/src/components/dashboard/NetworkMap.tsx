import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { Globe, Users } from 'lucide-react';

interface MapNode {
    id: string;
    lat: number;
    lon: number;
    status: string;
}

interface NetworkMapProps {
    nodes: MapNode[];
}

export const NetworkMap: React.FC<NetworkMapProps> = ({ nodes }) => {
    const { t } = useTranslation('common');

    // Simple conversion of lat/lon to X/Y on a 1000x500 SVG
    const project = (lat: number, lon: number) => {
        const x = (lon + 180) * (1000 / 360);
        const y = (90 - lat) * (500 / 180);
        return { x, y };
    };

    return (
        <div className="bg-gray-900/40 backdrop-blur-md rounded-2xl border border-gray-700/50 p-6 relative overflow-hidden group">
            {/* Background Map Effect */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(circle_at_50%_50%,#3b82f6_0%,transparent_70%)]" />

            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-blue-400" />
                    <h3 className="text-sm font-bold text-white tracking-widest uppercase">{t('client.globalNetwork')}</h3>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/10 rounded-full border border-blue-500/20">
                    <Users className="w-3 h-3 text-blue-400" />
                    <span className="text-[10px] font-bold text-blue-400">{nodes.length} {t('client.activeNodes')}</span>
                </div>
            </div>

            <div className="relative aspect-[2/1] bg-gray-950/20 rounded-xl overflow-hidden border border-white/5">
                <svg viewBox="0 0 1000 500" className="w-full h-full">
                    {/* Stylized Tech World Map */}
                    <path
                        d="M150,150 Q200,120 250,150 T350,180 Q400,200 450,180 T550,220 Q600,250 650,220 T750,200 Q800,180 850,220 L850,300 Q800,350 750,320 T650,350 Q600,380 550,350 T450,380 Q400,400 350,380 T250,350 Q200,320 150,350 Z"
                        fill="rgba(59, 130, 246, 0.05)"
                        stroke="rgba(59, 130, 246, 0.1)"
                        strokeWidth="1"
                    />

                    {/* Data Flow Lines (Faint) */}
                    <path d="M200,250 C300,200 400,300 500,250 S700,200 800,250" fill="none" stroke="rgba(59, 130, 246, 0.05)" strokeWidth="0.5" />
                    <path d="M300,150 C400,250 500,150 600,250 S800,350 900,250" fill="none" stroke="rgba(59, 130, 246, 0.05)" strokeWidth="0.5" />

                    {/* Lat/Lon Grid Lines */}
                    {[...Array(10)].map((_, i) => (
                        <line key={`h-${i}`} x1="0" y1={i * 50} x2="1000" y2={i * 50} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                    ))}
                    {[...Array(20)].map((_, i) => (
                        <line key={`v-${i}`} x1={i * 50} y1="0" x2={i * 50} y2="500" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                    ))}

                    {/* Nodes */}
                    {nodes.map((node) => {
                        const { x, y } = project(node.lat, node.lon);
                        return (
                            <g key={node.id} className="cursor-pointer">
                                {/* Pulse Effect */}
                                <circle cx={x} cy={y} r="6" fill="rgba(59, 130, 246, 0.4)">
                                    <animate attributeName="r" from="4" to="12" dur="2s" repeatCount="indefinite" />
                                    <animate attributeName="opacity" from="0.6" to="0" dur="2s" repeatCount="indefinite" />
                                </circle>
                                {/* Static Point */}
                                <circle cx={x} cy={y} r="3" fill="#3b82f6" />
                            </g>
                        );
                    })}
                </svg>

                {/* Overlay Gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-gray-950/60 to-transparent pointer-events-none" />
            </div>

            <div className="mt-4 flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                {nodes.slice(0, 5).map(node => (
                    <div key={node.id} className="flex items-center gap-2 bg-white/5 px-2 py-1 rounded-lg border border-white/10 whitespace-nowrap">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                        <span className="text-[10px] text-gray-400 font-mono">Node-{node.id.substring(0, 4)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};
