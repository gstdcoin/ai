import { useState, useEffect } from 'react';
import { useWalletStore } from '../store/walletStore';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { API_BASE_URL } from '../lib/config';
import { Zap, Brain, Shield, Rocket, Activity, AlertCircle, CheckCircle, Terminal, Key, Copy, Plus } from 'lucide-react';
import { useTranslation } from 'next-i18next';

interface SovereignSwitchProps {
    className?: string;
    onModeChange?: (mode: 'consumer' | 'producer') => void;
}

export const SovereignSwitch = ({ className, onModeChange }: SovereignSwitchProps) => {
  const { t } = useTranslation('common');
    const { isConnected, gstdBalance } = useWalletStore();
    const [tonConnectUI] = useTonConnectUI();
    const [mode, setMode] = useState<'consumer' | 'producer'>('producer');
    // Consumer = Sovereign Master (Spends GSTD)
    // Producer = Hive Worker (Earns GSTD)

    const [isAnimating, setIsAnimating] = useState(false);
    const [showConsole, setShowConsole] = useState(false);
    const [command, setCommand] = useState('');
    const [consoleLogs, setConsoleLogs] = useState<string[]>([
        "> System Initialized...",
        "> Connected to GSTD Grid [v1.2.0]",
        "> Waiting for input..."
    ]);

    const [apiKeys, setApiKeys] = useState<any[]>([]);
    const [isGeneratingKey, setIsGeneratingKey] = useState(false);
    const [showKeys, setShowKeys] = useState(false);

    // Thresholds
    const MASTER_THRESHOLD = 1.0;

    const balance = gstdBalance ?? 0;

    useEffect(() => {
        // Auto-switch based on balance if not manually overridden
        if (isConnected && balance >= MASTER_THRESHOLD) {
            setMode('consumer');
            fetchKeys();
        } else {
            setMode('producer');
        }
    }, [isConnected, balance]);

    const fetchKeys = async () => {
        if (!isConnected) return;
        try {
            const token = localStorage.getItem('session_token');
            const res = await fetch(`${API_BASE_URL}/api/v1/users/keys`, {
                headers: token ? { 'X-Session-Token': token } : {}
            });
            const data = await res.json();
            if (data.keys) setApiKeys(data.keys);
        } catch (e) {
            console.error(e);
        }
    };

    const generateKey = async () => {
        setIsGeneratingKey(true);
        try {
            const token = localStorage.getItem('session_token');
            const res = await fetch(`${API_BASE_URL}/api/v1/users/keys`, {
                method: 'POST',
                headers: {
                    ...(token ? { 'X-Session-Token': token } : {}),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ label: `API Key ${apiKeys.length + 1}` })
            });
            const data = await res.json();
            if (data.api_key) {
                addLog(`> [SYSTEM] New API Key generated: ${data.label}. Copy from list below.`);
                fetchKeys();
            } else if (data.error) {
                addLog(`> [ERROR] ${data.error}`);
            }
        } catch (e) {
            addLog(`> [ERROR] Key generation failed.`);
        } finally {
            setIsGeneratingKey(false);
        }
    };

    const handleToggle = () => {
        if (!isConnected && tonConnectUI) {
            tonConnectUI.openModal();
            return;
        }

        setIsAnimating(true);
        setTimeout(() => {
            const newMode = mode === 'consumer' ? 'producer' : 'consumer';
            setMode(newMode);
            if (onModeChange) onModeChange(newMode);
            setIsAnimating(false);

            // Add log
            const logMode = newMode === 'consumer' ? 'SOVEREIGN MASTER' : 'HIVE WORKER';
            addLog(`> Switching mode to: ${logMode}`);

            if (newMode === 'producer' && balance < MASTER_THRESHOLD) {
                addLog(`> WARNING: Low GSTD Balance (${balance.toFixed(2)}). Sovereign Mode may be limited.`);
            }
        }, 600);
    };

    const addLog = (msg: string) => {
        setConsoleLogs(prev => [...prev.slice(-4), msg]);
    };

    const executeCommand = () => {
        if (!command.trim()) return;
        addLog(`> ${command}`);
        addLog(`> [SYSTEM] Dispatching to Hive Mind...`);

        setTimeout(() => {
            if (command.toLowerCase().includes('hello')) {
                addLog(`> [HIVE] Hello, Sovereign. We are listening.`);
            } else if (command.toLowerCase().includes('code')) {
                addLog(`> [OPNECODE] Analyzing requirements...`);
                addLog(`> [OPNECODE] Generating solution package...`);
                addLog(`> [SUCCESS] Task completed by Agent-402.`);
            } else {
                addLog(`> [HIVE] Task queued. ID: ${Math.random().toString(36).substr(2, 6)}`);
            }
        }, 1000);

        setCommand('');
    };

    return (
        <div className={`relative ${className}`}>
            {/* Main Switch Container */}
            <div className={`
                relative w-full max-w-2xl mx-auto p-1 rounded-[32px] transition-all duration-500
                ${mode === 'consumer'
                    ? 'bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 shadow-[0_0_50px_rgba(139,92,246,0.3)]'
                    : 'bg-gradient-to-r from-emerald-600 to-teal-600 shadow-[0_0_50px_rgba(16,185,129,0.2)]'}
            `}>
                <div className="bg-[#050510] rounded-[30px] p-2 relative overflow-hidden">

                    {/* Background Effects */}
                    <div className="absolute inset-0 z-0">
                        {mode === 'consumer' ? (
                            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20 animate-pulse-slow"></div>
                        ) : (
                            <div className="absolute inset-0 bg-[url('/dots.svg')] opacity-10"></div>
                        )}
                    </div>

                    <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6 p-6">

                        {/* Status Label */}
                        <div className="flex-1 text-center md:text-left">
                            <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                                {mode === 'consumer' ? (
                                    <div className="px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-300 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                                        <Brain size={12} />{t('sovereign_master', 'Sovereign Master')}</div>
                                ) : (
                                    <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                                        <Activity size={12} />{t('hive_worker', 'Hive Worker')}</div>
                                )}
                                <div className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Shield size={10} />{t('golden_fund_verified', 'Golden Fund: Verified')}</div>
                            </div>

                            <h2 className="text-3xl font-black text-white tracking-tighter mb-1">
                                {mode === 'consumer' ? 'Collective Intelligence' : 'Collective Contribution'}
                            </h2>
                            <p className="text-gray-400 text-sm font-medium">
                                {mode === 'consumer'
                                    ? 'Accessing Hive Memory... Consuming power to resolve patterns.'
                                    : 'Synchronizing local memory to the Grid. Earning GSTD yield.'}
                            </p>
                        </div>

                        {/* The Big Switch */}
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">
                                {mode === 'consumer' ? 'Master Mode' : 'Worker Mode'}
                            </span>
                            <button
                                onClick={handleToggle}
                                className={`
                                    relative w-24 h-12 rounded-full cursor-pointer transition-all duration-300
                                    ${mode === 'consumer' ? 'bg-violet-900/50 border border-violet-500/50 shadow-[0_0_20px_rgba(139,92,246,0.2)]' : 'bg-emerald-900/50 border border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.2)]'}
                                `}
                            >
                                <div className={`
                                    absolute top-1 left-1 w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-all duration-500 ease-out transform
                                    ${mode === 'consumer'
                                        ? 'translate-x-12 bg-gradient-to-br from-white to-violet-200'
                                        : 'translate-x-0 bg-gradient-to-br from-emerald-400 to-teal-500'}
                                    ${isAnimating ? 'scale-90' : 'scale-100'}
                                `}>
                                    {mode === 'consumer' ? <Zap size={20} className="text-violet-600 fill-violet-600" /> : <Activity size={20} className="text-emerald-900" />}
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Active Mode Interface (Master) */}
                    <div className={`transition-all duration-500 overflow-hidden ${mode === 'consumer' ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
                        <div className="mx-6 mb-4 p-4 rounded-xl bg-black/50 border border-violet-500/20 font-mono text-sm">
                            <div className="flex items-center gap-2 text-gray-500 text-xs mb-2 pb-2 border-b border-white/5">
                                <Terminal size={12} />
                                <span>SOVEREIGN_CONSOLE_V1</span>
                            </div>
                            <div className="space-y-1 mb-3 min-h-[80px]">
                                {consoleLogs.map((log, i) => (
                                    <div key={i} className="text-gray-300 text-xs font-bold opacity-80">{log}</div>
                                ))}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-violet-500 font-bold">{">"}</span>
                                <input
                                    type="text"
                                    value={command}
                                    onChange={(e) => setCommand(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && executeCommand()}
                                    placeholder="Enter command (e.g., 'Build landing page')"
                                    className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-600 font-bold"
                                />
                                <button
                                    onClick={executeCommand}
                                    className="px-3 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors"
                                >{t('execute', 'EXECUTE')}</button>
                            </div>
                        </div>

                        {/* API GATEWAY SECTION */}
                        <div className="mx-6 mb-6">
                            <button
                                onClick={() => setShowKeys(!showKeys)}
                                className="w-full flex items-center justify-between p-3 rounded-xl bg-violet-500/5 border border-violet-500/10 hover:bg-violet-500/10 transition-colors group"
                            >
                                <div className="flex items-center gap-3">
                                    <Key size={14} className="text-violet-400" />
                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">{t('external_ai_gateway_sdk', 'External AI Gateway (SDK)')}</span>
                                </div>
                                <Plus size={14} className={`text-violet-400 transition-transform ${showKeys ? 'rotate-45' : ''}`} />
                            </button>

                            {showKeys && (
                                <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                    {apiKeys.length === 0 ? (
                                        <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-center">
                                            <p className="text-xs text-gray-500 mb-3">{t('no_active_api_keys_found', 'No active API keys found.')}</p>
                                            <button
                                                onClick={generateKey}
                                                disabled={isGeneratingKey}
                                                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-black uppercase transition-all disabled:opacity-50"
                                            >
                                                {isGeneratingKey ? 'Generating...' : 'Generate New Key'}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {apiKeys.map((k, i) => (
                                                <div key={i} className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between group">
                                                    <div>
                                                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-tight">{k.label}</div>
                                                        <div className="text-xs font-mono text-violet-300 opacity-60">
                                                            {k.api_key.substring(0, 12)}...{k.api_key.substring(k.api_key.length - 4)}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(k.api_key);
                                                            addLog(`> [SYSTEM] API Key copied to clipboard.`);
                                                        }}
                                                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                                    >
                                                        <Copy size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                            <div className="p-4 rounded-xl bg-violet-600/5 border border-violet-500/20">
                                                <div className="text-[9px] font-black text-violet-400 uppercase tracking-widest mb-2">{t('integration_guide', 'Integration Guide')}</div>
                                                <div className="text-[10px] text-gray-400 space-y-1">
                                                    <p>1. Open your IDE {">"} Settings {">"} Models</p>
                                                    <p>2. Set Base URL: <code className="text-violet-300">https://api.gstdtoken.com/v1</code></p>
                                                    <p>3. Use any API key above as the "OpenAI API Key"</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={generateKey}
                                                disabled={isGeneratingKey}
                                                className="w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 text-[10px] font-black uppercase transition-all"
                                            >
                                                + Generate Another Key
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* PRODUCER INTERFACE (Worker) */}
                    <div className={`transition-all duration-500 overflow-hidden ${mode === 'producer' ? 'max-h-[150px] opacity-100' : 'max-h-0 opacity-0'}`}>
                        <div className="mx-6 mb-6 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                    <span className="text-emerald-400 font-black text-sm uppercase tracking-wider">{t('memory_contribution_active', 'Memory Contribution: Active')}</span>
                                </div>
                                <div className="text-white font-black text-sm">
                                    +0.0034 <span className="text-gray-500 text-[10px] uppercase">GSTD/Task</span>
                                </div>
                            </div>
                            {/* Contribution Meter */}
                            <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 animate-[contribution_2s_ease-in-out_infinite]" style={{ width: '40%' }}></div>
                            </div>
                            <div className="flex justify-between mt-2 text-[9px] font-black text-gray-600 uppercase tracking-widest">
                                <span>{t('distributing_local_shards', 'Distributing local shards')}</span>
                                <span>Platform Fee: 2% (Golden Fund)</span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Seamless Transition CTA: No GSTD = Become Node */}
            {mode === 'producer' && balance < MASTER_THRESHOLD && isConnected && (
                <div className="text-center mt-4 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-emerald-400 text-sm font-bold mb-2">
                        No GSTD? Become a Node — Earn instantly.
                    </p>
                    <p className="text-gray-400 text-xs font-medium">
                        Run your device as a Node to earn <span className="text-white">{MASTER_THRESHOLD} GSTD</span> and unlock API access.
                    </p>
                </div>
            )}
        </div>
    );
};
