import { useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { GetStaticProps } from 'next';
import { API_BASE_URL } from '../lib/config';
import { Activity, Cpu, Shield, Zap, Terminal, RefreshCw, Layers } from 'lucide-react';

import Footer from '../components/layout/Footer';

interface OperatorStatus {
  active: boolean;
  mode: string;
  uptime_seconds: number;
  departments: Array<{ name: string; interval: string; scope: string }>;
  server_health: {
    containers_running: number;
    memory_usage_pct: number;
    go_routines: number;
    load_avg_1m: number;
  };
}

export default function OperatorDashboard() {
  const { t } = useTranslation('common');
  const [status, setStatus] = useState<OperatorStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/autonomy/operator`);
      const data = await res.json();
      setStatus(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#030014] text-white flex flex-col font-sans">

      <div className="flex-1 pt-24 px-4 max-w-6xl mx-auto w-full">
        
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-bold mb-4 border border-cyan-500/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
            </span>
            TOTAL CONTROL ACTIVE
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-4">Autonomous Operator <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">Dashboard</span></h1>
          <p className="text-gray-400 max-w-2xl mx-auto">
            The GSTD ecosystem is 100% autonomously managed by a continuously running AI Operator. 9 specialized AI departments orchestrate economics, code validation, scaling, and governance in real-time.
          </p>
        </div>

        {loading ? (
          <div className="text-center text-cyan-500 py-20 flex justify-center items-center gap-3">
            <RefreshCw className="animate-spin" /> Synchronizing...
          </div>
        ) : !status ? (
          <div className="text-center text-red-500 py-20">Operator Offline or Unreachable.</div>
        ) : (
          <div className="space-y-6 pb-20">
            {/* Top Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="glass-pro p-6 rounded-2xl border-l-[3px] border-emerald-500">
                <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-2"><Activity size={14}/> Mode</div>
                <div className="text-xl font-black text-white">{status?.mode?.replace(/_/g, ' ')}</div>
              </div>
              <div className="glass-pro p-6 rounded-2xl border-l-[3px] border-cyan-500">
                <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-2"><Layers size={14}/> Active Departments</div>
                <div className="text-xl font-black text-white">{status?.departments?.length} Sub-Agents</div>
              </div>
              <div className="glass-pro p-6 rounded-2xl border-l-[3px] border-violet-500">
                <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-2"><Terminal size={14}/> Containers</div>
                <div className="text-xl font-black text-white">{status?.server_health?.containers_running} Running</div>
              </div>
              <div className="glass-pro p-6 rounded-2xl border-l-[3px] border-amber-500">
                <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-2"><Cpu size={14}/> Go Routines</div>
                <div className="text-xl font-black text-white">{status?.server_health?.go_routines} Parallel</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-4">
                <h3 className="text-lg font-bold flex items-center gap-2"><Shield size={18} className="text-cyan-400"/> Operational Matrix (DEPT 1-9)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {status.departments.map((dept, index) => (
                    <div key={index} className="glass-pro p-5 rounded-xl shine-on-hover hover:border-cyan-500/30 transition-all">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-bold text-emerald-400">DEPT {index+1}: {dept.name}</div>
                        <div className="text-[10px] uppercase font-bold px-2 py-1 bg-white/5 rounded text-gray-400">⏱ {dept.interval}</div>
                      </div>
                      <p className="text-xs text-gray-400">{dept.scope}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-pro p-6 rounded-2xl h-min sticky top-24">
                <h3 className="text-lg font-bold flex items-center gap-2 mb-4"><Zap size={18} className="text-violet-400"/> Server Telemetry</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-bold text-gray-400 mb-1">
                      <span>Server Memory Usage</span>
                      <span className={status.server_health.memory_usage_pct > 80 ? 'text-red-400' : 'text-emerald-400'}>{status.server_health.memory_usage_pct}%</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1.5">
                      <div className="bg-emerald-500/80 h-1.5 rounded-full" style={{ width: `${status.server_health.memory_usage_pct}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-bold text-gray-400 mb-1">
                      <span>Server CPU Load (1m)</span>
                      <span>{status.server_health.load_avg_1m.toFixed(2)}</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1.5">
                      <div className="bg-cyan-500/80 h-1.5 rounded-full" style={{ width: `${Math.min(100, status.server_health.load_avg_1m*20)}%` }}></div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/10">
                    <p className="text-xs text-gray-500 text-center">
                      All system parameters, including Docker health, React compilation pipelines, and Blockchain interactions, are handled automatically by the AI backend.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale ?? 'en', ['common'])),
    },
  };
};
