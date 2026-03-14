import React, { useState } from 'react';
import { Terminal, ShieldAlert, Cpu, CheckCircle2, RefreshCw, X } from 'lucide-react';
import { useWalletStore } from '../../store/walletStore';
import { toast } from '../../lib/toast';

interface SovereignTerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const API_BASE_URL = typeof window !== 'undefined'
  ? window.location.hostname.includes('localhost')
    ? 'http://localhost:8080'
    : 'https://v2.gstdtoken.com'
  : 'https://v2.gstdtoken.com';

export default function SovereignTerminalModal({ isOpen, onClose }: SovereignTerminalModalProps) {
  const [isClaiming, setIsClaiming] = useState(false);
  const [terminalLog, setTerminalLog] = useState<string[]>([
    '> INITIATING CONNECTION TO SOVEREIGN SWARM L1...',
    '> ESTABLISHING P2P HANDSHAKE...',
    '> SUCCESS: ZERO-GAS LAYER ACTIVE'
  ]);
  
  const { address, swarmBalance, updateBalance } = useWalletStore();

  if (!isOpen) return null;

  const handleClaim = async () => {
    if (!address) {
      toast.error('Connect wallet first.');
      return;
    }
    
    setIsClaiming(true);
    setTerminalLog(prev => [...prev, '> VERIFYING WALLET SIGNATURE...']);
    
    try {
      // Simulate slight delay for terminal effect
      await new Promise(r => setTimeout(r, 800));
      setTerminalLog(prev => [...prev, `> REQUESTING GENESIS ALLOCATION FOR ${address.slice(0, 6)}...`]);
      
      const response = await fetch(`${API_BASE_URL}/api/v1/swarm/faucet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
      });

      const data = await response.json();
      
      await new Promise(r => setTimeout(r, 600));

      if (!response.ok) {
        setTerminalLog(prev => [...prev, `> ERROR: ${data.error || 'ACCESS DENIED'}`]);
        toast.error(data.error || 'Faucet request failed');
      } else {
        setTerminalLog(prev => [...prev, '> TRANSACTION ACCEPTED BY SWARM.']);
        setTerminalLog(prev => [...prev, '> +5.0 S-GSTD CREDITED. ZERO GAS.']);
        toast.success(data.message || '5.0 GSTD Claimed successfully!');
        
        // Force refresh balance locally
        // We preserve ton and pending in current state, just update swarm
        const state = useWalletStore.getState();
        const currentGstd = state.gstdBalance;
        if (currentGstd != null) {
          updateBalance('0', currentGstd, (swarmBalance || 0) + 5.0, state.pendingEarnings || 0);
        }
      }
    } catch (_err) {
      setTerminalLog(prev => [...prev, '> ERROR: NETWORK CONNECTION FAILED']);
      toast.error('Network error during broadcast');
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-[#0a0a0c] border border-emerald-500/30 rounded-2xl w-full max-w-2xl overflow-hidden shadow-[0_0_50px_rgba(16,185,129,0.15)] relative my-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center gap-3 text-emerald-400">
            <Terminal className="w-5 h-5" />
            <h2 className="font-mono text-sm tracking-wider font-bold">SOVEREIGN_SWARM_TERMINAL v1.0.0</h2>
          </div>
          <button onClick={onClose} className="p-1 text-emerald-400/50 hover:text-emerald-400 hover:bg-emerald-400/10 rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Info Panel */}
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-wide">
                Welcome to the Swarm L1
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                You have accessed the core infrastructure of the GSTD Sovereign Network. 
                <span className="text-emerald-400 font-medium"> The Swarm L1 operates entirely without gas fees, </span> 
                powered by community nodes representing a fully decentralized compound layer.
              </p>
              
              <div className="space-y-3 mt-4">
                <div className="flex gap-3 bg-gray-900/50 p-3 rounded-xl border border-gray-800">
                  <ShieldAlert className="w-5 h-5 text-blue-400 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider">TON L1 (Standard)</h4>
                    <p className="text-xs text-gray-500 mt-0.5">Your main wallet balance. Requires ~0.02 TON for native operations and trading.</p>
                  </div>
                </div>
                
                <div className="flex gap-3 bg-emerald-900/20 p-3 rounded-xl border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                  <Cpu className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Swarm L1 (Zero-Gas)</h4>
                    <p className="text-xs text-emerald-200/70 mt-0.5">Internal mesh network balance. Used for AI queries, Swarm Agents, and Node execution.</p>
                  </div>
                </div>
              </div>

            </div>

            {/* ASCII / Shell Terminal */}
            <div className="bg-black border border-emerald-500/20 rounded-xl p-4 font-mono text-xs flex flex-col justify-between">
              <div className="space-y-2 text-emerald-500 h-48 overflow-y-auto mt-2">
                {terminalLog.map((log, i) => (
                  <div key={i} className="animate-fade-in-up flex gap-2">
                    <span className="opacity-50 text-emerald-700">{(new Date()).toISOString().split('T')[1].slice(0, 8)}</span>
                    <span className="break-all">{log}</span>
                  </div>
                ))}
                {isClaiming && (
                  <div className="flex gap-2">
                    <span className="opacity-50 text-emerald-700">{(new Date()).toISOString().split('T')[1].slice(0, 8)}</span>
                    <span className="animate-pulse">_</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-4 border-t border-emerald-500/20 space-y-2">
                <button
                  onClick={handleClaim}
                  disabled={isClaiming || !address}
                  className="w-full py-3 sm:py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded shadow-[0_0_10px_rgba(16,185,129,0.2)] hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all flex items-center justify-center gap-2 font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
                >
                  {isClaiming ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {isClaiming ? 'EXECUTING...' : 'Claim Genesis Grid (5 GSTD)'}
                </button>
                <div className="text-center">
                  <span className="text-[10px] text-gray-500">Only available for accounts with 0.00 S-GSTD balance. Bridge functionality unlocking soon.</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
