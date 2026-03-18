/**
 * OpenClaw Control Panel — Full-featured management dashboard for OpenClaw robots.
 * Runs inside the Node dashboard. Uses groq/compound as the default model.
 *
 * Tabs:
 *  1. Dashboard — Live stats, agent count, task count, earnings
 *  2. Agents — Registered robot list with status, trust, earnings
 *  3. Tasks — Task marketplace: create, view, manage
 *  4. Think — Compound-model inference for robot planning
 *  5. Models — Available models for OpenClaw intelligence
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import {
  BarChart3,
  Bot,
  Zap,
  Send,
  RefreshCw,
  Plus,
  Sparkles,
  Shield,
  Brain,
  Layout,
  ListTodo,
  Settings2,
} from 'lucide-react';
import { API_BASE_URL } from '../../lib/config';
import { useWalletStore } from '../../store/walletStore';

type PanelTab = 'dashboard' | 'agents' | 'tasks' | 'think' | 'models' | 'autonomy';

interface DashboardData {
  agents: { total: number; online: number };
  tasks: { total: number; open: number; completed: number };
  total_earned_gstd: number;
  default_model: string;
  protocol: string;
  capabilities: string[];
}

interface AgentEntry {
  agent_id: string;
  wallet_address: string;
  agent_type: string;
  status: string;
  total_tasks: number;
  total_earned: number;
  trust_score: number;
  registered_at: string;
}

interface TaskEntry {
  task_id: string;
  task_type: string;
  description: string;
  reward_gstd: number;
  requester_wallet: string;
  assigned_agent: string;
  status: string;
  created_at: string;
}

interface ModelEntry {
  id: string;
  name: string;
  description: string;
  default: boolean;
  capabilities: string[];
}

export default function OpenClawPanel() {
  useTranslation('common');
  const [tab, setTab] = useState<PanelTab>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Think tab state
  const [thinkPrompt, setThinkPrompt] = useState('');
  const [thinkResult, setThinkResult] = useState('');
  const [thinkModel, setThinkModel] = useState('groq/compound');
  const [thinkLoading, setThinkLoading] = useState(false);

  // Autonomy state
  const [autonomyStatus, setAutonomyStatus] = useState<any>(null);
  const [aiHistory, setAiHistory] = useState<any[]>([]);

  const { address } = useWalletStore();

  // Create task state
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [newTaskType, setNewTaskType] = useState('pick_and_place');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskReward, setNewTaskReward] = useState('1.0');

  const thinkRef = useRef<HTMLTextAreaElement>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/api/v1/openclaw/dashboard`, {
        headers: { 'X-Wallet-Address': address || '' }
      });
      const d = await r.json();
      setDashboard(d);
    } catch {}
  }, [address]);

  const fetchAgents = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/api/v1/openclaw/agents`, {
        headers: { 'X-Wallet-Address': address || '' }
      });
      const d = await r.json();
      setAgents(d.agents || []);
    } catch {}
  }, [address]);

  const fetchTasks = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/api/v1/openclaw/tasks`, {
        headers: { 'X-Wallet-Address': address || '' }
      });
      const d = await r.json();
      setTasks(d.tasks || []);
    } catch {}
  }, [address]);

  const fetchModels = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/api/v1/openclaw/models`, {
        headers: { 'X-Wallet-Address': address || '' }
      });
      const d = await r.json();
      setModels(d.models || []);
    } catch {}
  }, [address]);

  const fetchAutonomy = useCallback(async () => {
    try {
      const hdrs = { 'X-Wallet-Address': address || '' };
      const [rStat, rHist] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/autonomy/status`, { headers: hdrs }),
        fetch(`${API_BASE_URL}/api/v1/autonomy/ai/history`, { headers: hdrs })
      ]);
      const dStat = await rStat.json();
      const dHist = await rHist.json();
      setAutonomyStatus(dStat);
      setAiHistory(dHist.decisions || []);
    } catch {}
  }, [address]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    if (tab === 'agents') fetchAgents();
    if (tab === 'tasks') fetchTasks();
    if (tab === 'models') fetchModels();
    if (tab === 'autonomy') fetchAutonomy();
  }, [tab, fetchAgents, fetchTasks, fetchModels, fetchAutonomy]);

  // Auto-refresh dashboard every 15s
  useEffect(() => {
    const iv = setInterval(fetchDashboard, 15000);
    return () => clearInterval(iv);
  }, [fetchDashboard]);

  const handleThink = async () => {
    if (!thinkPrompt.trim()) return;
    setThinkLoading(true);
    setThinkResult('');
    try {
      const r = await fetch(`${API_BASE_URL}/api/v1/openclaw/think`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Wallet-Address': address || '' },
        body: JSON.stringify({ prompt: thinkPrompt, model: thinkModel }),
      });
      const d = await r.json();
      if (d.error) {
        setThinkResult(`Error: ${d.error}`);
      } else {
        const result = d.result;
        if (typeof result === 'object' && result.response) {
          setThinkResult(result.response);
        } else if (typeof result === 'string') {
          setThinkResult(result);
        } else {
          setThinkResult(JSON.stringify(result, null, 2));
        }
      }
    } catch (err: any) {
      setThinkResult(`Error: ${err.message}`);
    } finally {
      setThinkLoading(false);
    }
  };

  const handleCreateTask = async () => {
    if (!newTaskDesc.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/v1/openclaw/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Wallet-Address': address || '' },
        body: JSON.stringify({
          task_type: newTaskType,
          description: newTaskDesc,
          reward_gstd: parseFloat(newTaskReward) || 1.0,
        }),
      });
      const d = await r.json();
      if (d.task_id) {
        setNewTaskDesc('');
        setShowCreateTask(false);
        fetchTasks();
      }
    } catch {}
    setLoading(false);
  };

  const statusColor = (s: string) => {
    if (s === 'online' || s === 'completed') return '#34d399';
    if (s === 'busy' || s === 'claimed') return '#facc15';
    if (s === 'offline' || s === 'failed') return '#ef4444';
    return '#60a5fa';
  };

  const tabs: Array<{ id: PanelTab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <Layout size={16} /> },
    { id: 'agents', label: 'Agents', icon: <Bot size={16} /> },
    { id: 'tasks', label: 'Tasks', icon: <ListTodo size={16} /> },
    { id: 'think', label: 'Compound AI', icon: <Brain size={16} /> },
    { id: 'autonomy', label: 'Autonomy', icon: <Settings2 size={16} /> },
    { id: 'models', label: 'Models', icon: <Settings2 size={16} /> },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#030014]">
      {/* Header */}
      <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500/30 to-red-600/30 flex items-center justify-center">
            <span style={{ fontSize: 20, lineHeight: 1 }}>🦞</span>
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              OpenClaw Control Panel
              <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                LIVE
              </span>
            </h2>
            <p className="text-[10px] text-gray-500">
              {dashboard?.protocol || 'openclaw-gstd/1.0'} • Default: {dashboard?.default_model || 'groq/compound'}
            </p>
          </div>
        </div>
        <button
          onClick={() => { fetchDashboard(); if (tab === 'agents') { fetchAgents(); } if (tab === 'tasks') { fetchTasks(); } }}
          className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 py-2 border-b border-white/5 overflow-x-auto hide-scrollbar">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap border-none cursor-pointer ${
              tab === t.id
                ? 'bg-orange-500/15 text-orange-400'
                : 'bg-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        {/* ═══ DASHBOARD ═══ */}
        {tab === 'dashboard' && dashboard && (
          <div className="max-w-3xl mx-auto space-y-4">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { v: dashboard.agents.total, l: 'Total Agents', icon: '🤖', c: 'text-cyan-400' },
                { v: dashboard.agents.online, l: 'Online Now', icon: '🟢', c: 'text-emerald-400' },
                { v: dashboard.tasks.open, l: 'Open Tasks', icon: '⚡', c: 'text-amber-400' },
                { v: dashboard.total_earned_gstd.toFixed(2), l: 'Total Earned', icon: '💎', c: 'text-violet-400' },
              ].map((s) => (
                <div
                  key={s.l}
                  className="rounded-2xl p-4 text-center border border-white/5"
                  style={{ background: 'rgba(255,255,255,0.02)' }}
                >
                  <div style={{ fontSize: 22, lineHeight: 1, marginBottom: 8 }}>{s.icon}</div>
                  <div className={`text-xl font-black leading-none mb-1 ${s.c}`}>{s.v}</div>
                  <div className="text-[9px] uppercase tracking-widest text-gray-500 font-bold">{s.l}</div>
                </div>
              ))}
            </div>

            {/* Tasks Breakdown */}
            <div
              className="rounded-2xl p-5 border border-white/5"
              style={{ background: 'rgba(255,255,255,0.02)' }}
            >
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <BarChart3 size={14} className="text-orange-400" /> Task Statistics
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { v: dashboard.tasks.total, l: 'Total', c: '#60a5fa' },
                  { v: dashboard.tasks.open, l: 'Open', c: '#facc15' },
                  { v: dashboard.tasks.completed, l: 'Completed', c: '#34d399' },
                ].map((s) => (
                  <div key={s.l} className="text-center">
                    <div style={{ fontSize: 20, fontWeight: 900, color: s.c }}>{s.v}</div>
                    <div className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">{s.l}</div>
                  </div>
                ))}
              </div>
              {dashboard.tasks.total > 0 && (
                <div className="mt-3 h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min((dashboard.tasks.completed / dashboard.tasks.total) * 100, 100)}%`,
                      background: 'linear-gradient(90deg, #34d399, #60a5fa)',
                      transition: 'width 0.5s',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Capabilities */}
            <div
              className="rounded-2xl p-5 border border-white/5"
              style={{ background: 'rgba(255,255,255,0.02)' }}
            >
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <Shield size={14} className="text-violet-400" /> RPC Capabilities
              </h3>
              <div className="flex flex-wrap gap-2">
                {(dashboard.capabilities || []).map((cap) => (
                  <span
                    key={cap}
                    className="text-[10px] px-2.5 py-1 rounded-lg bg-violet-500/10 text-violet-400 font-mono font-bold border border-violet-500/10"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'dashboard' && !dashboard && (
          <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
            <RefreshCw size={16} className="animate-spin mr-2" /> Loading dashboard...
          </div>
        )}

        {/* ═══ AGENTS ═══ */}
        {tab === 'agents' && (
          <div className="max-w-3xl mx-auto space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Bot size={16} className="text-cyan-400" /> Registered Agents
                <span className="text-[9px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-bold">
                  {agents.length}
                </span>
              </h3>
              <button onClick={fetchAgents} className="text-[10px] text-gray-500 hover:text-white transition-colors flex items-center gap-1">
                <RefreshCw size={10} /> Refresh
              </button>
            </div>

            {agents.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Bot size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No agents registered yet</p>
                <p className="text-[10px] mt-1">Agents register via claw.register RPC or the Agent API</p>
              </div>
            ) : (
              agents.map((a) => (
                <div
                  key={a.agent_id}
                  className="rounded-xl p-4 border border-white/5 transition-all hover:border-white/10"
                  style={{ background: 'rgba(255,255,255,0.02)' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: statusColor(a.status) }}
                      />
                      <span className="text-xs font-mono font-bold text-white">{a.agent_id}</span>
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                        style={{
                          background: `${statusColor(a.status)}15`,
                          color: statusColor(a.status),
                        }}
                      >
                        {a.status}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-500">{a.agent_type || 'generic'}</span>
                  </div>
                  <div className="flex gap-4 text-[10px] text-gray-400">
                    <span>Tasks: <strong className="text-white">{a.total_tasks}</strong></span>
                    <span>Earned: <strong className="text-emerald-400">{a.total_earned.toFixed(4)} GSTD</strong></span>
                    <span>Trust: <strong className="text-amber-400">{(a.trust_score * 100).toFixed(0)}%</strong></span>
                  </div>
                  <div className="text-[9px] text-gray-500 mt-1 font-mono truncate">
                    {a.wallet_address}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ═══ TASKS ═══ */}
        {tab === 'tasks' && (
          <div className="max-w-3xl mx-auto space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ListTodo size={16} className="text-amber-400" /> Task Marketplace
                <span className="text-[9px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold">
                  {tasks.length}
                </span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCreateTask(!showCreateTask)}
                  className="flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 transition-all border-none cursor-pointer"
                >
                  <Plus size={12} /> New Task
                </button>
                <button onClick={fetchTasks} className="text-[10px] text-gray-500 hover:text-white transition-colors flex items-center gap-1">
                  <RefreshCw size={10} />
                </button>
              </div>
            </div>

            {/* Create Task Form */}
            {showCreateTask && (
              <div
                className="rounded-xl p-4 border border-orange-500/20"
                style={{ background: 'rgba(249,115,22,0.04)' }}
              >
                <h4 className="text-xs font-bold text-orange-400 mb-3">Create New Task</h4>
                <div className="space-y-2">
                  <select
                    value={newTaskType}
                    onChange={(e) => setNewTaskType(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none"
                  >
                    <option value="pick_and_place">Pick & Place</option>
                    <option value="inspect">Inspect</option>
                    <option value="navigate">Navigate</option>
                    <option value="custom">Custom</option>
                    <option value="text-processing">Text Processing</option>
                    <option value="image-analysis">Image Analysis</option>
                  </select>
                  <textarea
                    value={newTaskDesc}
                    onChange={(e) => setNewTaskDesc(e.target.value)}
                    placeholder="Task description..."
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none resize-none h-16"
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={newTaskReward}
                      onChange={(e) => setNewTaskReward(e.target.value)}
                      className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none"
                      placeholder="Reward GSTD"
                      step="0.1"
                      min="0"
                    />
                    <button
                      onClick={handleCreateTask}
                      disabled={loading || !newTaskDesc.trim()}
                      className="px-4 py-2 rounded-lg bg-orange-500 text-white text-xs font-bold hover:bg-orange-400 transition-all disabled:opacity-50 border-none cursor-pointer"
                    >
                      {loading ? '...' : 'Create'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tasks.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Zap size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No tasks yet</p>
                <p className="text-[10px] mt-1">Create tasks for robots or wait for agents to submit</p>
              </div>
            ) : (
              tasks.map((task) => (
                <div
                  key={task.task_id}
                  className="rounded-xl p-4 border border-white/5 transition-all hover:border-white/10"
                  style={{ background: 'rgba(255,255,255,0.02)' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                        style={{
                          background: `${statusColor(task.status)}15`,
                          color: statusColor(task.status),
                        }}
                      >
                        {task.status}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">{task.task_id.slice(0, 20)}...</span>
                    </div>
                    <span className="text-sm font-black text-violet-400">
                      {task.reward_gstd} <span className="text-[9px]">GSTD</span>
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 mb-1">{task.description}</p>
                  <div className="flex gap-3 text-[9px] text-gray-500">
                    <span>Type: {task.task_type}</span>
                    {task.assigned_agent && <span>Agent: {task.assigned_agent.slice(0, 12)}...</span>}
                    <span>{new Date(task.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ═══ THINK (Compound AI) ═══ */}
        {tab === 'think' && (
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Brain size={16} className="text-orange-400" />
              <h3 className="text-sm font-bold text-white">Compound AI — Robot Planning</h3>
            </div>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Use <strong className="text-orange-400">groq/compound</strong> for multi-step reasoning, web search, and robot planning.
              The compound model chains multiple LLMs with tool use for optimal results.
            </p>

            {/* Model Selector */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Model:</span>
              <select
                value={thinkModel}
                onChange={(e) => setThinkModel(e.target.value)}
                className="bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none"
              >
                <option value="groq/compound">groq/compound (Default)</option>
                <option value="llama-3.3-70b-versatile">Llama 3.3 70B</option>
                <option value="meta-llama/llama-4-scout-17b-16e-instruct">Llama 4 Scout</option>
                <option value="moonshotai/kimi-k2-instruct">Kimi K2</option>
                <option value="qwen/qwen3-32b">Qwen3 32B</option>
              </select>
            </div>

            {/* Input */}
            <div className="relative">
              <textarea
                ref={thinkRef}
                value={thinkPrompt}
                onChange={(e) => setThinkPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleThink();
                }}
                placeholder="Describe the robot task or ask for planning advice..."
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none resize-none h-28 focus:border-orange-500/30 transition-colors"
              />
              <button
                onClick={handleThink}
                disabled={thinkLoading || !thinkPrompt.trim()}
                className="absolute bottom-3 right-3 p-2 rounded-lg bg-orange-500 text-white hover:bg-orange-400 transition-all disabled:opacity-40 border-none cursor-pointer"
              >
                {thinkLoading ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
              </button>
            </div>

            {/* Result */}
            {thinkResult && (
              <div
                className="rounded-xl p-4 border border-orange-500/10"
                style={{ background: 'rgba(249,115,22,0.03)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={12} className="text-orange-400" />
                  <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">
                    Response — {thinkModel}
                  </span>
                </div>
                <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {thinkResult}
                </div>
              </div>
            )}

            {/* Quick Prompts */}
            <div className="space-y-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Quick Prompts:</span>
              <div className="flex flex-wrap gap-2">
                {[
                  'Plan a pick-and-place sequence for sorting objects by color',
                  'Analyze warehouse layout and suggest optimal robot pathfinding',
                  'Generate a safety inspection checklist for industrial robots',
                  'Design a sensor fusion strategy for object recognition',
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => { setThinkPrompt(prompt); thinkRef.current?.focus(); }}
                    className="text-[10px] px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all border-none cursor-pointer text-left"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ AUTONOMY ═══ */}
        {tab === 'autonomy' && autonomyStatus && (
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Settings2 size={16} className="text-teal-400" /> Platform Autonomy Control
              </h3>
              <button onClick={fetchAutonomy} className="p-1 rounded bg-white/5 hover:bg-white/10 transition-colors">
                <RefreshCw size={12} className="text-gray-400 hover:text-white" />
              </button>
            </div>
            
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-xl border border-white/5 bg-white/5">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Brain Status</div>
                <div className="text-lg font-bold text-teal-400">
                  {autonomyStatus.brain_active ? 'ACTIVE' : 'IDLE'}
                </div>
              </div>
              <div className="p-3 rounded-xl border border-white/5 bg-white/5">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">AI Cycles</div>
                <div className="text-lg font-bold text-white">{autonomyStatus.cycles}</div>
              </div>
              <div className="p-3 rounded-xl border border-white/5 bg-white/5">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Network Health</div>
                <div className="text-lg font-bold text-emerald-400">
                  {autonomyStatus.network?.network_health ? autonomyStatus.network.network_health.toFixed(1) + '%' : 'N/A'}
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-teal-500/20 bg-teal-500/5 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-teal-400">Force Autonomous Analysis</h4>
                <p className="text-[10px] text-gray-400">Trigger standard evaluation of platform state (Network Healing & Optimization)</p>
              </div>
              <button 
                onClick={async () => {
                  await fetch(`${API_BASE_URL}/api/v1/autonomy/ai/analyze`, { 
                    method: 'POST', 
                    body: JSON.stringify({category: 'analysis'}), 
                    headers: {'Content-Type': 'application/json', 'X-Wallet-Address': address || ''} 
                  });
                  fetchAutonomy();
                }}
                className="px-3 py-1.5 bg-teal-500/20 hover:bg-teal-500/30 text-teal-400 text-xs rounded-lg font-bold transition-all border border-teal-500/30 cursor-pointer">
                Run Analysis
              </button>
            </div>

            <div className="p-4 rounded-xl border border-white/5 bg-white/5 space-y-3">
               <h4 className="text-xs font-bold text-gray-300">Recent AI Decisions</h4>
               {aiHistory.length === 0 ? (
                 <div className="text-center text-xs text-gray-500 py-4">No recent AI decisions.</div>
               ) : (
                 <div className="space-y-2">
                   {aiHistory.map((d, i) => (
                     <div key={i} className="p-2 border border-white/5 rounded-lg text-left" style={{ background: 'rgba(0,0,0,0.3)' }}>
                       <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                         <span>{new Date(d.time).toLocaleString()}</span>
                         {d.score > 0 && <span className="text-orange-400 border border-orange-500/20 px-1 rounded">Score: {d.score.toFixed(1)}</span>}
                       </div>
                       <div className="text-[10px] text-gray-400 mb-1 font-mono">{d.context}</div>
                       <div className="text-xs text-white whitespace-pre-wrap">{d.decision}</div>
                     </div>
                   ))}
                 </div>
               )}
            </div>
          </div>
        )}

        {/* ═══ MODELS ═══ */}
        {tab === 'models' && (
          <div className="max-w-3xl mx-auto space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Settings2 size={16} className="text-violet-400" />
              <h3 className="text-sm font-bold text-white">Available Models</h3>
            </div>
            {models.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">Loading models...</div>
            ) : (
              models.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-xl p-4 border transition-all ${
                    m.default
                      ? 'border-orange-500/20 bg-orange-500/[0.03]'
                      : 'border-white/5 bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{m.name}</span>
                      {m.default && (
                        <span className="text-[9px] px-2 py-0.5 rounded bg-orange-500/15 text-orange-400 font-bold uppercase">
                          Default
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-500 font-mono">{m.id}</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">{m.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {m.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="text-[9px] px-2 py-0.5 rounded bg-white/5 text-gray-400"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
