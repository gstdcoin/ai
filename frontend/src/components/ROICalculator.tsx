import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';

const NODE_TYPES = [
    { id: 'mobile', name: 'Mobile Node', dailyRate: 2.4, reqGstd: 0, apy: 45 },
    { id: 'basic', name: 'Basic Node', dailyRate: 14.4, reqGstd: 0, apy: 65 },
    { id: 'master', name: 'MasterNode', dailyRate: 50.0, reqGstd: 10000, apy: 120 },
    { id: 'ai', name: 'AI Inference Node', dailyRate: 150.0, reqGstd: 50000, apy: 240 }
];

export const ROICalculator: React.FC = () => {
    const { t } = useTranslation('common');
    const [selectedNode, setSelectedNode] = useState(NODE_TYPES[1]);
    const [nodeCount, setNodeCount] = useState(1);
    const [uptime, setUptime] = useState(24);

    const dailyReward = selectedNode.dailyRate * nodeCount * (uptime / 24);
    const monthlyReward = dailyReward * 30;
    const yearlyReward = dailyReward * 365;
    
    // Add compound effect if stakers keep their reward staked
    const compoundYearly = yearlyReward * 1.15; 

    return (
        <div className="mt-12 p-8 bg-black rounded-3xl border border-gray-800 shadow-[0_0_50px_rgba(0,255,128,0.05)]">
            <h3 className="text-2xl font-black text-white mb-6 bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                {t('roi_calculator_title', 'Dynamic Network ROI Calculator')}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Inputs */}
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-semibold text-gray-400 mb-2">Node Type</label>
                        <select 
                            className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                            value={selectedNode.id}
                            onChange={(e) => setSelectedNode(NODE_TYPES.find(n => n.id === e.target.value) || NODE_TYPES[1])}
                        >
                            {NODE_TYPES.map(n => (
                                <option key={n.id} value={n.id}>{n.name} (Max {n.dailyRate} GSTD/day)</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-400 mb-2">Number of Nodes: {nodeCount}</label>
                        <input 
                            type="range" 
                            min="1" max="100" 
                            value={nodeCount} 
                            onChange={(e) => setNodeCount(parseInt(e.target.value))}
                            className="w-full accent-cyan-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-400 mb-2">Daily Uptime (Hours): {uptime}h</label>
                        <input 
                            type="range" 
                            min="1" max="24" 
                            value={uptime} 
                            onChange={(e) => setUptime(parseInt(e.target.value))}
                            className="w-full accent-emerald-500"
                        />
                    </div>
                </div>

                {/* Outputs */}
                <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 space-y-4">
                    <div className="flex justify-between items-center pb-4 border-b border-gray-800">
                        <span className="text-gray-400 font-medium">Daily Yield</span>
                        <span className="text-xl font-bold text-white">{dailyReward.toFixed(2)} GSTD</span>
                    </div>
                    <div className="flex justify-between items-center pb-4 border-b border-gray-800">
                        <span className="text-gray-400 font-medium">Monthly Yield</span>
                        <span className="text-2xl font-bold text-cyan-400">{monthlyReward.toFixed(2)} GSTD</span>
                    </div>
                    <div className="flex justify-between items-center pb-4 border-b border-gray-800">
                        <span className="text-gray-400 font-medium">Yearly Yield (Base)</span>
                        <span className="text-3xl font-black text-emerald-400">{yearlyReward.toFixed(2)} GSTD</span>
                    </div>
                    <div className="flex justify-between items-center pt-2">
                        <span className="text-gray-400 font-medium flex items-center gap-2">
                            With Auto-Compound 🚀
                        </span>
                        <span className="text-xl font-bold text-purple-400">{compoundYearly.toFixed(2)} GSTD</span>
                    </div>
                    
                    <div className="mt-6 pt-6 border-t border-gray-800">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Required Stake</span>
                            <span className="text-gray-300 font-mono">{selectedNode.reqGstd * nodeCount} GSTD</span>
                        </div>
                        <div className="flex justify-between text-sm mt-2">
                            <span className="text-gray-500">Estimated APY</span>
                            <span className="text-green-400 font-mono font-bold">~{selectedNode.apy}%</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
