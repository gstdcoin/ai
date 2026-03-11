'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { Server, Pause, Play, Trash2, RefreshCw } from 'lucide-react';
import { apiPost } from '../../lib/apiClient';
import { toast } from '../../lib/toast';
import { workerService } from '../../services/WorkerService';
import { POWER_PROFILE_LABELS, PowerProfile } from '../../lib/statusDesign';

export default function FleetCommandPanel() {
  const { t } = useTranslation('common');
  const [loading, setLoading] = useState<string | null>(null);
  const [powerProfile, setPowerProfileState] = useState<PowerProfile>(workerService.powerProfile);
  useEffect(() => {
    const unsub = workerService.subscribe(() => setPowerProfileState(workerService.powerProfile));
    return unsub;
  }, []);

  const runCommand = async (action: string) => {
    setLoading(action);
    try {
      await apiPost('/nodes/fleet/command', { action });
      toast.success('Fleet Command', `Command "${action}" sent to all nodes`);
    } catch (e: any) {
      toast.error('Fleet Command', e?.message || 'Failed to send command');
    } finally {
      setLoading(null);
    }
  };

  const setPowerProfile = (profile: PowerProfile) => {
    workerService.setPowerProfile(profile);
    setPowerProfileState(profile);
    toast.info('Power Profile', `Set to ${POWER_PROFILE_LABELS[profile]}`);
  };

  return (
    <div className="glass-card p-6 border-cyan-500/20">
      <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
        <Server size={18} className="text-cyan-400" />{t('fleet_command', 'Fleet Command')}</h3>
      <p className="text-[10px] text-gray-500 mb-4">{t('oneclick_control_for_all_connected_nodes', 'One-click control for all connected nodes')}</p>
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => runCommand('standby')}
          disabled={!!loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold hover:bg-amber-500/30 disabled:opacity-50"
        >
          {loading === 'standby' ? <RefreshCw size={14} className="animate-spin" /> : <Pause size={14} />}
          Standby All
        </button>
        <button
          onClick={() => runCommand('resume')}
          disabled={!!loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-500/30 disabled:opacity-50"
        >
          {loading === 'resume' ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
          Resume All
        </button>
        <button
          onClick={() => runCommand('clean')}
          disabled={!!loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-xs font-bold hover:bg-cyan-500/30 disabled:opacity-50"
        >
          {loading === 'clean' ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Clear Cache
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider self-center">{t('power', 'Power:')}</span>
        {(['eco', 'balance', 'max'] as PowerProfile[]).map((p) => (
          <button
            key={p}
            onClick={() => setPowerProfile(p)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
              powerProfile === p
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                : 'bg-white/5 border-white/10 text-gray-400 hover:border-cyan-500/20'
            }`}
          >
            {POWER_PROFILE_LABELS[p]}
          </button>
        ))}
      </div>
    </div>
  );
}
