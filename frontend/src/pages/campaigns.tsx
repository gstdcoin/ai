import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import { Zap, Clock, Cpu, HardDrive, Globe, RefreshCw, ExternalLink } from 'lucide-react';
import { API_BASE_URL } from '../lib/config';

interface Campaign {
  id: string;
  company: string;
  title: string;
  description: string;
  reward_per_task: number;
  total_budget: number;
  remaining_budget: number;
  required_type: string;
  required_caps: string[];
  min_resources: {
    storage_gb: number;
    ram_mb: number;
    cpu_cores: number;
    require_gpu: boolean;
  };
  tasks_completed: number;
  nodes_joined: string[];
  contact: string;
  expires_at: string;
}

const TYPE_ICONS: Record<string, string> = {
  inference: '🧠',
  storage:   '💾',
  compute:   '⚡',
  relay:     '🔄',
  any:       '🌐',
};

const TYPE_LABELS: Record<string, string> = {
  inference: 'AI Inference',
  storage:   'Storage',
  compute:   'Compute',
  relay:     'Relay',
  any:       'Any resource',
};

function timeLeft(expires: string): string {
  const ms = new Date(expires).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const h = Math.floor(ms / 3600_000);
  if (h < 24) return `${h}h left`;
  return `${Math.floor(h / 24)}d left`;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter !== 'all'
        ? `${API_BASE_URL}/api/v1/campaigns/list?type=${filter}`
        : `${API_BASE_URL}/api/v1/campaigns/list`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (_e) {}
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const budgetPct = (c: Campaign) => {
    if (!c.total_budget) return 0;
    return Math.round((c.remaining_budget / c.total_budget) * 100);
  };

  return (
    <div className="min-h-screen bg-[#030014] text-white">
      <Head>
        <title>Compute Campaigns — GSTD Network</title>
        <meta name="description" content="Active compute campaigns on GSTD network. Node operators earn GSTD by joining campaigns posted by companies." />
      </Head>

      <main className="max-w-4xl mx-auto px-4 pt-20 pb-20">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest border border-violet-500/30 text-violet-400 mb-4">
            Live Network
          </div>
          <h1 className="text-4xl font-black mb-3 bg-gradient-to-r from-white via-violet-200 to-cyan-300 bg-clip-text text-transparent">
            Compute Campaigns
          </h1>
          <p className="text-gray-400 max-w-xl mx-auto text-sm">
            Companies post campaigns to attract GSTD nodes. Nodes that join earn GSTD for contributing resources.
          </p>
        </div>

        {/* CTA for companies */}
        <div className="mb-8 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="text-3xl">💼</div>
          <div className="flex-1">
            <div className="font-bold text-amber-300 mb-0.5">Running a project that needs compute?</div>
            <div className="text-sm text-gray-400">Post a campaign — 250+ node operators worldwide bid to serve your workload. GSTD tokens are your payment currency.</div>
          </div>
          <a
            href="https://t.me/gstdaibot"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 px-4 py-2 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-300 font-bold text-sm hover:bg-amber-400/20 transition-all flex items-center gap-2"
          >
            Post Campaign <ExternalLink size={14} />
          </a>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {['all', 'inference', 'compute', 'storage', 'relay'].map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
                filter === t
                  ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                  : 'border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20'
              }`}
            >
              {t === 'all' ? '🌐 All' : `${TYPE_ICONS[t]} ${TYPE_LABELS[t]}`}
            </button>
          ))}
          <button
            onClick={fetchCampaigns}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-cyan-400 border border-cyan-400/20 hover:border-cyan-400/40 transition-all"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="text-center py-20 text-cyan-400">
            <RefreshCw className="animate-spin mx-auto mb-3" size={24} />
            <span className="text-xs font-bold uppercase tracking-widest">Fetching campaigns...</span>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-4">🌱</div>
            <div className="text-gray-400 font-bold mb-2">No active campaigns right now</div>
            <div className="text-gray-600 text-sm">
              Be the first to post one — or run a node and earn GSTD from inference tasks.
            </div>
            <a
              href="https://t.me/gstdaibot"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-300 font-bold text-sm hover:bg-violet-600/30 transition-all"
            >
              Open Telegram Bot <ExternalLink size={14} />
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.map(c => (
              <div
                key={c.id}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] p-5 transition-all hover:border-violet-500/20"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-lg">{TYPE_ICONS[c.required_type] || '🌐'}</span>
                      <span className="font-bold text-white text-base">{c.title}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-violet-500/10 border border-violet-500/20 text-violet-400">
                        {TYPE_LABELS[c.required_type] || c.required_type}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 font-medium">by {c.company}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xl font-black text-amber-400">
                      {c.reward_per_task.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-amber-400/60 font-bold uppercase tracking-wider">GSTD / task</div>
                  </div>
                </div>

                {c.description && (
                  <p className="text-sm text-gray-400 mb-3 line-clamp-2">{c.description}</p>
                )}

                {/* Budget bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                    <span>Budget remaining</span>
                    <span>{c.remaining_budget.toLocaleString(undefined, { maximumFractionDigits: 0 })} / {c.total_budget.toLocaleString(undefined, { maximumFractionDigits: 0 })} GSTD ({budgetPct(c)}%)</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 transition-all"
                      style={{ width: `${budgetPct(c)}%` }}
                    />
                  </div>
                </div>

                {/* Meta row */}
                <div className="flex gap-4 text-[11px] text-gray-600 flex-wrap">
                  <span className="flex items-center gap-1"><Clock size={11} /> {timeLeft(c.expires_at)}</span>
                  <span className="flex items-center gap-1"><Zap size={11} /> {c.tasks_completed} tasks done</span>
                  {c.min_resources.ram_mb > 0 && (
                    <span className="flex items-center gap-1"><Cpu size={11} /> {Math.round(c.min_resources.ram_mb / 1024)}GB RAM min</span>
                  )}
                  {c.min_resources.storage_gb > 0 && (
                    <span className="flex items-center gap-1"><HardDrive size={11} /> {c.min_resources.storage_gb}GB storage</span>
                  )}
                  {c.min_resources.require_gpu && (
                    <span className="text-violet-400 font-bold">GPU required</span>
                  )}
                  {c.required_caps.length > 0 && (
                    <span className="flex items-center gap-1"><Globe size={11} /> {c.required_caps.slice(0, 2).join(', ')}</span>
                  )}
                </div>

                {/* Join CTA */}
                <div className="mt-4 flex justify-end">
                  <a
                    href={`https://t.me/gstdaibot?start=campaign_${c.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-xl bg-violet-600/15 border border-violet-500/25 text-violet-300 font-bold text-sm hover:bg-violet-600/25 transition-all flex items-center gap-2"
                  >
                    Join Campaign <ExternalLink size={13} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer CTA for node operators */}
        <div className="mt-12 text-center">
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-6">
            <div className="text-2xl mb-2">🐝</div>
            <div className="font-bold text-cyan-300 mb-1">Not running a node yet?</div>
            <div className="text-gray-400 text-sm mb-4">
              Run a node and earn GSTD from every campaign above — no GSTD needed to start.
            </div>
            <div className="flex gap-3 justify-center flex-wrap">
              <a
                href="https://t.me/gstdaibot"
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-bold text-sm hover:bg-cyan-500/25 transition-all flex items-center gap-2"
              >
                📱 Mobile Node (instant)
              </a>
              <a
                href="/nodes"
                className="px-5 py-2.5 rounded-xl border border-white/10 text-gray-300 font-bold text-sm hover:border-white/20 transition-all"
              >
                🖥 Desktop Setup
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
