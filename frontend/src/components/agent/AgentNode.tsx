/**
 * Agent Node — Personal AI Assistant + Miner + Node for any device.
 * No OpenClaw required. Advanced miner: AI chat, skill import, earn GSTD.
 * For OpenClaw: full 3-in-1. For others: продвинутый майнер without extra setup.
 */
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import {
  MessageSquare,
  Package,
  Server,
  Activity,
  Zap,
  Sparkles,
  Bot,
  Download,
  CheckCircle,
  ChevronRight,
  Wallet,
  Cpu,
} from 'lucide-react';
import { useWalletStore } from '../../store/walletStore';
import { workerService } from '../../services/WorkerService';
import ChatPanel from '../dashboard/ChatPanel';
import { ComponentErrorBoundary } from '../common/ComponentErrorBoundary';
import { toast } from '../../lib/toast';
import FleetCommandPanel from '../dashboard/FleetCommandPanel';
import { apiPost } from '../../lib/apiClient';
import OpenClawPanel from '../openclaw/OpenClawPanel';

type AgentTab = 'ai' | 'skills' | 'miner' | 'openclaw';

interface Skill {
  name: string;
  description: string;
  version: string;
  type: string;
  author: string;
  capabilities?: string[];
  homepage?: string;
  price_gstd?: number;
}

export default function AgentNode() {
  const { t } = useTranslation('common');
  const { gstdBalance, pendingEarnings, address } = useWalletStore();
  const [activeTab, setActiveTab] = useState<AgentTab>('ai');
  const [isMining, setIsMining] = useState(false);
  const [isIgniting, setIsIgniting] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [installedSkills, setInstalledSkills] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub = workerService.subscribe((state) => {
      setIsMining(state === 'running' || state === 'igniting');
      setIsIgniting(state === 'igniting');
    });
    return unsub;
  }, []);

  useEffect(() => {
    fetch('/skills.json')
      .then((r) => r.json())
      .then((data) => setSkills(data.skills || []))
      .catch(() => setSkills([]));
  }, []);

  const handleToggleMining = useCallback(() => {
    if (isMining) {
      workerService.pause();
      toast.info('Mining Paused', 'Worker stopped processing tasks.');
    } else {
      workerService.ignite();
    }
  }, [isMining]);

  const handleInstallSkill = async (skill: Skill) => {
    if (skill.price_gstd && (gstdBalance || 0) < skill.price_gstd) {
      toast.error('Insufficient Balance', `You need ${skill.price_gstd} GSTD to import this skill.`);
      return;
    }

    if (skill.price_gstd) {
      try {
        await apiPost('/payments/purchase-skill', {
          skill_name: skill.name,
          price: skill.price_gstd,
          wallet: address,
        });
        toast.success('Skill Purchased', `${skill.name} successfully imported for ${skill.price_gstd} GSTD.`);
      } catch (err: any) {
        toast.error('Purchase Failed', err?.message || 'Transaction could not be completed.');
        return;
      }
    } else {
      toast.success('Skill Installed', `${skill.name} v${skill.version} ready for use.`);
    }

    setInstalledSkills((prev) => new Set(prev).add(skill.name));
  };

  const tabs: Array<{ id: AgentTab; label: string; icon: React.ReactNode; desc: string }> = [
    { id: 'ai', label: 'AI', icon: <MessageSquare size={20} />, desc: t('ai_requests', 'AI requests') },
    { id: 'skills', label: t('skills', 'Skills'), icon: <Package size={20} />, desc: t('import_skills', 'Import skills') },
    { id: 'miner', label: t('miner', 'Miner'), icon: <Server size={20} />, desc: t('earn_gstd', 'Earn GSTD') },
    { id: 'openclaw', label: 'OpenClaw', icon: <span style={{ fontSize: 20, lineHeight: 1 }}>🦞</span>, desc: 'Robot control panel' },
  ];

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-[#030014] overflow-hidden">
      {/* Left Panel */}
      <aside className="lg:w-64 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 bg-black/20">
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600/30 to-cyan-500/30 flex items-center justify-center">
              <Bot size={22} className="text-violet-400" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white tracking-tight">{t('agent_node', 'Agent Node') || 'Agent Node'}</h1>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{t('agent_node_tagline', 'AI + Miner + Node • No OpenClaw') || 'AI + Miner + Node • No OpenClaw'}</p>
            </div>
          </div>
        </div>

        <nav className="p-3 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === tab.id
                ? 'bg-violet-600/20 text-violet-400 border border-violet-500/20'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
            >
              {tab.icon}
              <div className="flex-1 text-left">
                <span className="font-semibold block">{tab.label}</span>
                <span className="text-[10px] text-gray-500">{tab.desc}</span>
              </div>
              <ChevronRight size={14} className={activeTab === tab.id ? 'text-violet-400' : 'text-gray-600'} />
            </button>
          ))}
        </nav>

        {/* Quick Stats */}
        <div className="p-4 border-t border-white/10 space-y-2">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-gray-500 uppercase tracking-wider">{t('wallet_label', 'Wallet')}</span>
            <span className="text-cyan-400 font-bold tabular-nums">{gstdBalance?.toFixed(2) || '0.00'} GSTD</span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-gray-500 uppercase tracking-wider">{t('pending', 'Pending')}</span>
            <span className="text-emerald-400 font-bold tabular-nums">{pendingEarnings?.toFixed(2) || '0.00'} GSTD</span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-gray-500 uppercase tracking-wider">{t('node', 'Node')}</span>
            <span className={isMining ? 'text-emerald-400 font-bold' : 'text-gray-500'}>
              {isMining ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'ai' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles size={16} className="text-violet-400" />
                AI Requests
              </h2>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Ask anything. Powered by decentralized LLMs. No censorship.
              </p>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">
              <ComponentErrorBoundary name="ChatPanel">
                <ChatPanel compact />
              </ComponentErrorBoundary>
            </div>
          </div>
        )}

        {activeTab === 'skills' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <div className="max-w-3xl mx-auto">
              <div className="mb-8">
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <Package size={22} className="text-violet-400" />{t('skill_import', 'Skill Import')}</h2>
                <p className="text-gray-400 text-sm mt-2">
                  {t('agent_skills_desc', 'Import and use skills from the GSTD Grid. Compatible with OpenClaw, MCP, and A2A. Works on any device.') || 'Import and use skills from the GSTD Grid. Compatible with OpenClaw, MCP, and A2A. Works on any device.'}
                </p>
              </div>

              <div className="space-y-4">
                {skills.length === 0 ? (
                  <div className="glass-card p-8 text-center text-gray-500">
                    <Package size={40} className="mx-auto mb-4 opacity-50" />
                    <p>{t('loading_skills', 'Loading skills...')}</p>
                  </div>
                ) : (
                  skills.map((skill) => (
                    <div
                      key={skill.name}
                      className="glass-card p-6 border border-white/10 hover:border-violet-500/20 transition-all group"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-[15px] font-bold text-white">{skill.name}</h3>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 font-bold">
                              v{skill.version}
                            </span>
                            {skill.price_gstd && (
                              <span className="text-[10px] text-amber-400">{skill.price_gstd} GSTD</span>
                            )}
                          </div>
                          <p className="text-gray-400 text-sm mb-3">{skill.description}</p>
                          {skill.capabilities && skill.capabilities.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {skill.capabilities.slice(0, 5).map((c) => (
                                <span
                                  key={c}
                                  className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-400"
                                >
                                  {c}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleInstallSkill(skill)}
                          disabled={installedSkills.has(skill.name)}
                          className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all ${installedSkills.has(skill.name)
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default'
                            : 'bg-violet-600 hover:bg-violet-500 text-white border border-violet-500/30'
                            }`}
                        >
                          {installedSkills.has(skill.name) ? (
                            <>
                              <CheckCircle size={16} />
                              Installed
                            </>
                          ) : (
                            <>
                              <Download size={16} />
                              Import
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'miner' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <div className="max-w-2xl mx-auto">
              <div className="mb-8">
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <Server size={22} className="text-cyan-400" />{t('platform_miner', 'Platform Miner')}</h2>
                <p className="text-gray-400 text-sm mt-2">
                  {t('agent_miner_desc', 'Share your compute with the network. Earn GSTD by completing tasks. Personal AI + miner + node — no OpenClaw needed.') || 'Share your compute with the network. Earn GSTD by completing tasks. Personal AI + miner + node — no OpenClaw needed.'}
                </p>
              </div>

              {/* Main Control */}
              <button
                onClick={handleToggleMining}
                disabled={isIgniting}
                className={`w-full flex items-center justify-between p-8 rounded-3xl transition-all transform active:scale-[0.98] border-2 disabled:opacity-70 disabled:cursor-not-allowed ${isMining
                  ? 'bg-red-500/10 border-red-500/20 text-red-400 shadow-[0_0_40px_rgba(239,68,68,0.1)]'
                  : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400 hover:border-cyan-400/40 shadow-[0_0_40px_rgba(34,211,238,0.1)]'
                  }`}
              >
                <div className="flex items-center gap-5">
                  <div
                    className={`p-4 rounded-2xl border ${isMining ? 'bg-red-500/20 border-red-500/30 animate-pulse' : 'bg-cyan-500/20 border-cyan-500/30'
                      }`}
                  >
                    {isIgniting ? (
                      <div className="w-7 h-7 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                    ) : isMining ? (
                      <Activity size={28} />
                    ) : (
                      <Server size={28} />
                    )}
                  </div>
                  <div className="text-left">
                    <span className="block text-2xl uppercase tracking-tighter font-black">
                      {isIgniting ? 'Igniting...' : isMining ? 'Online' : 'Ignite'}
                    </span>
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest block mt-1">{t('platform_node', 'Platform Node')}</span>
                  </div>
                </div>
                <div
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-full border text-[10px] font-black tracking-widest uppercase ${isMining ? 'bg-red-500/20 border-red-500/30' : 'bg-cyan-500/20 border-cyan-500/30'
                    }`}
                >
                  {isIgniting ? '...' : isMining ? 'Stop' : 'Start'}
                </div>
              </button>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 mt-8">
                <div className="glass-card p-6 flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
                    <Wallet size={20} />
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest block">{t('chat_balance', 'Balance')}</span>
                    <span className="text-xl font-black text-white tabular-nums">{gstdBalance?.toFixed(2) || '0.00'} GSTD</span>
                  </div>
                </div>
                <div className="glass-card p-6 flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
                    <Cpu size={20} />
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest block">{t('pending', 'Pending')}</span>
                    <span className="text-xl font-black text-white tabular-nums">{pendingEarnings?.toFixed(2) || '0.00'} GSTD</span>
                  </div>
                </div>
              </div>

              <ComponentErrorBoundary name="FleetCommandPanel">
                <FleetCommandPanel />
              </ComponentErrorBoundary>
              <div className="mt-6 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                <p className="text-gray-400 text-sm">
                  <Zap size={14} className="inline mr-1 text-amber-400" />
                  {t('agent_miner_hint', 'Personal AI assistant + miner + node for any device. Free hardware but no OpenClaw? This is your advanced miner — all in one.') || 'Personal AI assistant + miner + node for any device. Free hardware but no OpenClaw? This is your advanced miner — all in one.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'openclaw' && (
          <OpenClawPanel />
        )}
      </main>
    </div>
  );
}
