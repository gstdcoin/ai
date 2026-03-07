import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../../lib/config';
import Head from 'next/head';
import Link from 'next/link';
import {
  Cpu, MemoryStick, HardDrive, Wifi, Activity, Zap, Clock,
  Bell, Settings, Package, ChevronRight, RefreshCw, Shield,
  Download, AlertTriangle, CheckCircle2, Info, Gift, X,
  Sparkles, Globe, Database, TrendingUp, Server
} from 'lucide-react';

interface SystemUsage {
  cpu: { usage_percent: number; cores: number; model: string };
  memory: { total_gb: number; used_gb: number; free_gb: number; percent: number };
  disk: { total_gb: number; used_gb: number; free_gb: number; percent: number };
  gpu: { available: boolean; name: string };
  uptime_seconds: number;
}

interface Widget {
  id: string;
  type: string;
  title: string;
  value: any;
  icon: string;
  color: string;
  size: string;
  order: number;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  action?: string;
  action_url?: string;
}

interface WhatsNew {
  version: string;
  date: string;
  features: { title: string; description: string }[];
}

// ─── Progress Ring ───────────────────────────────────────────
function ProgressRing({ value, color, size = 80, strokeWidth = 6 }: { value: number; color: string; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.05)" strokeWidth={strokeWidth} fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={radius} stroke={color}
        strokeWidth={strokeWidth} fill="none"
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
      />
    </svg>
  );
}

// ─── Notification Icon ──────────────────────────────────────
function NotifIcon({ type }: { type: string }) {
  switch (type) {
    case 'reward': return <Gift size={16} className="text-amber-400" />;
    case 'warning': return <AlertTriangle size={16} className="text-amber-500" />;
    case 'error': return <AlertTriangle size={16} className="text-red-500" />;
    case 'success': return <CheckCircle2 size={16} className="text-emerald-400" />;
    default: return <Info size={16} className="text-cyan-400" />;
  }
}

export default function NodeDashboardPage() {
  const { t } = useTranslation('common');
  const [usage, setUsage] = useState<SystemUsage | null>(null);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [whatsNew, setWhatsNew] = useState<WhatsNew | null>(null);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'apps' | 'notifications' | 'settings'>('overview');
  const [settings, setSettings] = useState({
    node_name: 'GSTD Node',
    wallet_address: '',
    auto_update: true,
    theme: 'dark',
    notifications_enabled: true,
    max_concurrent_tasks: 4,
  });

  const fetchData = useCallback(async () => {
    try {
      const [usageRes, widgetsRes, notifsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/node/system-usage`),
        fetch(`${API_BASE_URL}/api/v1/node/widgets`),
        fetch(`${API_BASE_URL}/api/v1/node/notifications`),
      ]);
      if (usageRes.ok) setUsage(await usageRes.json());
      if (widgetsRes.ok) {
        const data = await widgetsRes.json();
        setWidgets(data.widgets || []);
      }
      if (notifsRes.ok) {
        const data = await notifsRes.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchData();
    // Check what's new
    fetch(`${API_BASE_URL}/api/v1/node/whats-new`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setWhatsNew(data);
          // Show if not seen before
          const seen = localStorage.getItem('gstd_whats_new_seen');
          if (seen !== data.version) setShowWhatsNew(true);
        }
      }).catch(() => {});

    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const dismissWhatsNew = () => {
    setShowWhatsNew(false);
    if (whatsNew) localStorage.setItem('gstd_whats_new_seen', whatsNew.version);
  };

  return (
    <div className="min-h-screen bg-[#030014] text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Head>
        <title>GSTD Node Dashboard</title>
        <meta name="description" content="Monitor and manage your GSTD Node. Live system usage, earnings, and app management." />
      </Head>

      {/* ═══ TOP BAR ═══ */}
      <div className="sticky top-14 z-30 backdrop-blur-2xl bg-[#030014]/80 border-b border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Server size={18} />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight">Node Dashboard</h1>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Online</span>
                {usage && (
                  <span className="text-[10px] text-gray-600 ml-1">· {formatUptime(usage.uptime_seconds)} uptime</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Notifications bell */}
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-xl hover:bg-white/[0.04] transition-colors"
            >
              <Bell size={18} className="text-gray-400" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* App Store link */}
            <Link href="/appstore" className="p-2 rounded-xl hover:bg-white/[0.04] transition-colors">
              <Package size={18} className="text-gray-400" />
            </Link>

            {/* Settings */}
            <button
              onClick={() => setActiveTab('settings')}
              className="p-2 rounded-xl hover:bg-white/[0.04] transition-colors"
            >
              <Settings size={18} className="text-gray-400" />
            </button>

            {/* Refresh */}
            <button
              onClick={fetchData}
              className="p-2 rounded-xl hover:bg-white/[0.04] transition-colors"
            >
              <RefreshCw size={18} className="text-gray-400" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 flex gap-6 -mb-px">
          {(['overview', 'apps', 'notifications', 'settings'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2.5 text-sm font-bold capitalize transition-all border-b-2 ${
                activeTab === tab
                  ? 'text-white border-violet-500'
                  : 'text-gray-600 border-transparent hover:text-gray-400'
              }`}
            >{tab}</button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {/* ═══ OVERVIEW TAB ═══ */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* System Usage Cards */}
            {usage && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* CPU */}
                <div className="p-5 rounded-2xl relative overflow-hidden" style={{
                  background: 'rgba(139, 92, 246, 0.04)',
                  border: '1px solid rgba(139, 92, 246, 0.1)',
                }}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">CPU</div>
                      <div className="text-2xl font-black text-white">{usage.cpu.usage_percent.toFixed(1)}%</div>
                      <div className="text-[10px] text-gray-600">{usage.cpu.cores} cores</div>
                    </div>
                    <div className="relative">
                      <ProgressRing value={usage.cpu.usage_percent} color="#8b5cf6" />
                      <Cpu className="absolute inset-0 m-auto text-violet-400" size={20} />
                    </div>
                  </div>
                  <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full transition-all duration-1000" 
                      style={{ width: `${usage.cpu.usage_percent}%` }} />
                  </div>
                </div>

                {/* Memory */}
                <div className="p-5 rounded-2xl relative overflow-hidden" style={{
                  background: 'rgba(6, 182, 212, 0.04)',
                  border: '1px solid rgba(6, 182, 212, 0.1)',
                }}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Memory</div>
                      <div className="text-2xl font-black text-white">{usage.memory.used_gb.toFixed(1)} GB</div>
                      <div className="text-[10px] text-gray-600">of {usage.memory.total_gb.toFixed(1)} GB</div>
                    </div>
                    <div className="relative">
                      <ProgressRing value={usage.memory.percent} color="#06b6d4" />
                      <MemoryStick className="absolute inset-0 m-auto text-cyan-400" size={20} />
                    </div>
                  </div>
                  <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full transition-all duration-1000" 
                      style={{ width: `${usage.memory.percent}%` }} />
                  </div>
                </div>

                {/* Disk */}
                <div className="p-5 rounded-2xl relative overflow-hidden" style={{
                  background: 'rgba(245, 158, 11, 0.04)',
                  border: '1px solid rgba(245, 158, 11, 0.1)',
                }}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Storage</div>
                      <div className="text-2xl font-black text-white">{usage.disk.used_gb.toFixed(0)} GB</div>
                      <div className="text-[10px] text-gray-600">of {usage.disk.total_gb.toFixed(0)} GB</div>
                    </div>
                    <div className="relative">
                      <ProgressRing value={usage.disk.percent} color="#f59e0b" />
                      <HardDrive className="absolute inset-0 m-auto text-amber-400" size={20} />
                    </div>
                  </div>
                  <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-1000" 
                      style={{ width: `${usage.disk.percent}%` }} />
                  </div>
                </div>

                {/* Network */}
                <div className="p-5 rounded-2xl relative overflow-hidden" style={{
                  background: 'rgba(16, 185, 129, 0.04)',
                  border: '1px solid rgba(16, 185, 129, 0.1)',
                }}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Network</div>
                      <div className="text-2xl font-black text-white">Online</div>
                      <div className="text-[10px] text-gray-600">{formatUptime(usage.uptime_seconds)} uptime</div>
                    </div>
                    <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
                      <Wifi className="text-emerald-400" size={24} />
                    </div>
                  </div>
                  <div className="h-1 bg-emerald-500/20 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full w-full" />
                  </div>
                </div>
              </div>
            )}

            {/* Widgets Grid */}
            <div>
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Activity size={14} className="text-violet-400" /> Node Widgets
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {widgets.map(w => (
                  <div
                    key={w.id}
                    className="p-4 rounded-xl text-center transition-all hover:scale-[1.02]"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <span className="text-xl mb-1 block">{w.icon}</span>
                    <div className="text-lg font-black" style={{ color: w.color }}>
                      {typeof w.value === 'number' ? w.value.toFixed(1) + '%' : w.value}
                    </div>
                    <div className="text-[10px] text-gray-600 font-bold uppercase tracking-wider">{w.title}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div>
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Zap size={14} className="text-emerald-400" /> Quick Actions
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Link href="/appstore" className="flex items-center gap-3 p-4 rounded-xl hover:scale-[1.01] transition-all"
                  style={{ background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.1)' }}>
                  <Package size={20} className="text-violet-400" />
                  <div className="flex-1">
                    <div className="font-bold text-sm">App Store</div>
                    <div className="text-xs text-gray-500">Install 15+ apps</div>
                  </div>
                  <ChevronRight size={16} className="text-gray-600" />
                </Link>
                <Link href="/chat" className="flex items-center gap-3 p-4 rounded-xl hover:scale-[1.01] transition-all"
                  style={{ background: 'rgba(6, 182, 212, 0.05)', border: '1px solid rgba(6, 182, 212, 0.1)' }}>
                  <Sparkles size={20} className="text-cyan-400" />
                  <div className="flex-1">
                    <div className="font-bold text-sm">Sovereign AI</div>
                    <div className="text-xs text-gray-500">Chat with the Hive</div>
                  </div>
                  <ChevronRight size={16} className="text-gray-600" />
                </Link>
                <Link href="/network" className="flex items-center gap-3 p-4 rounded-xl hover:scale-[1.01] transition-all"
                  style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                  <Globe size={20} className="text-emerald-400" />
                  <div className="flex-1">
                    <div className="font-bold text-sm">Network Map</div>
                    <div className="text-xs text-gray-500">View active nodes</div>
                  </div>
                  <ChevronRight size={16} className="text-gray-600" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ═══ APPS TAB ═══ */}
        {activeTab === 'apps' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">Installed Apps</h2>
              <Link href="/appstore" className="flex items-center gap-1 text-sm text-violet-400 font-bold hover:text-violet-300 transition-colors">
                <Package size={14} /> Browse App Store <ChevronRight size={14} />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Example installed apps */}
              {[
                { name: 'GSTD Miner', icon: '⛏️', status: 'running', earnings: '12.5 GSTD today' },
                { name: 'GSTD Chat', icon: '🧠', status: 'running', earnings: '' },
                { name: 'Redis', icon: '🔴', status: 'running', earnings: '' },
              ].map((app, i) => (
                <div key={i} className="p-4 rounded-2xl flex items-center gap-3"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="text-3xl">{app.icon}</span>
                  <div className="flex-1">
                    <div className="font-bold text-sm">{app.name}</div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[10px] text-emerald-400 font-bold uppercase">{app.status}</span>
                    </div>
                    {app.earnings && (
                      <span className="text-[10px] text-amber-400 font-bold">{app.earnings}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ NOTIFICATIONS TAB ═══ */}
        {activeTab === 'notifications' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">Notifications</h2>
              {unreadCount > 0 && (
                <button className="text-xs text-violet-400 font-bold hover:text-violet-300">Mark all as read</button>
              )}
            </div>
            <div className="space-y-2">
              {notifications.map(n => (
                <div
                  key={n.id}
                  className={`p-4 rounded-xl flex items-start gap-3 transition-all ${
                    n.read ? 'opacity-60' : ''
                  }`}
                  style={{
                    background: n.read ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${n.read ? 'rgba(255,255,255,0.03)' : 'rgba(139, 92, 246, 0.1)'}`,
                  }}
                >
                  <NotifIcon type={n.type} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm">{n.title}</div>
                    <p className="text-xs text-gray-400 mt-0.5">{n.message}</p>
                    <div className="text-[10px] text-gray-600 mt-1">
                      {new Date(n.timestamp).toLocaleString()}
                    </div>
                  </div>
                  {n.action && (
                    <Link href={n.action_url || '#'} className="text-xs text-violet-400 font-bold hover:text-violet-300 flex-shrink-0">
                      {n.action} →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ SETTINGS TAB ═══ */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl">
            <h2 className="text-lg font-bold mb-6">Node Settings</h2>
            <div className="space-y-6">
              {/* General */}
              <div className="p-5 rounded-2xl" style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)'
              }}>
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                  <Settings size={14} className="text-gray-400" /> General
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-gray-500 font-bold mb-1">Node Name</label>
                    <input
                      type="text" value={settings.node_name}
                      onChange={e => setSettings(s => ({ ...s, node_name: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm focus:outline-none focus:border-violet-500/40"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 font-bold mb-1">Wallet Address (TON)</label>
                    <input
                      type="text" value={settings.wallet_address}
                      onChange={e => setSettings(s => ({ ...s, wallet_address: e.target.value }))}
                      placeholder="EQYour_Wallet_Address..."
                      className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm focus:outline-none focus:border-violet-500/40 placeholder:text-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 font-bold mb-1">Max Concurrent Tasks</label>
                    <select
                      value={settings.max_concurrent_tasks}
                      onChange={e => setSettings(s => ({ ...s, max_concurrent_tasks: parseInt(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm focus:outline-none focus:border-violet-500/40"
                    >
                      {[1, 2, 4, 8, 16].map(n => <option key={n} value={n}>{n} tasks</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Toggles */}
              <div className="p-5 rounded-2xl" style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)'
              }}>
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                  <Shield size={14} className="text-gray-400" /> Preferences
                </h3>
                <div className="space-y-3">
                  {[
                    { key: 'auto_update', label: 'Auto Update', desc: 'Automatically install node updates' },
                    { key: 'notifications_enabled', label: 'Notifications', desc: 'Show system notifications' },
                  ].map(item => (
                    <label key={item.key} className="flex items-center justify-between py-2 cursor-pointer">
                      <div>
                        <div className="text-sm font-bold">{item.label}</div>
                        <div className="text-xs text-gray-500">{item.desc}</div>
                      </div>
                      <div
                        onClick={() => setSettings(s => ({ ...s, [item.key]: !(s as any)[item.key] }))}
                        className={`w-10 h-6 rounded-full cursor-pointer transition-colors ${
                          (settings as any)[item.key] ? 'bg-violet-500' : 'bg-white/10'
                        }`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full mt-1 transition-transform ${
                          (settings as any)[item.key] ? 'translate-x-5' : 'translate-x-1'
                        }`} />
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Danger Zone */}
              <div className="p-5 rounded-2xl" style={{
                background: 'rgba(239, 68, 68, 0.03)', border: '1px solid rgba(239, 68, 68, 0.1)'
              }}>
                <h3 className="text-sm font-bold mb-3 text-red-400 flex items-center gap-2">
                  <AlertTriangle size={14} /> Danger Zone
                </h3>
                <div className="flex gap-3">
                  <button className="px-4 py-2 rounded-lg text-xs font-bold bg-white/[0.04] text-gray-400 hover:bg-white/[0.08] transition-colors">
                    Factory Reset
                  </button>
                  <button className="px-4 py-2 rounded-lg text-xs font-bold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                    Uninstall Node
                  </button>
                </div>
              </div>

              {/* Save */}
              <button className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-bold text-sm shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all">
                Save Settings
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ WHAT'S NEW MODAL (Umbrel-style) ═══ */}
      {showWhatsNew && whatsNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" onClick={dismissWhatsNew} />
          <div className="relative w-full max-w-md rounded-3xl overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, rgba(20, 10, 40, 0.98), rgba(5, 2, 15, 0.99))',
              border: '1px solid rgba(139, 92, 246, 0.15)',
              boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 80px rgba(139, 92, 246, 0.08)',
            }}>
            <div className="h-28 relative flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.15))' }}>
              <div className="text-center">
                <Sparkles size={32} className="text-violet-300 mx-auto mb-2" />
                <div className="text-2xl font-black">What&apos;s New</div>
                <div className="text-xs text-gray-400">v{whatsNew.version} · {whatsNew.date}</div>
              </div>
              <button onClick={dismissWhatsNew} className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-white/10">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {whatsNew.features.map((f, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-lg flex-shrink-0">{f.title.split(' ')[0]}</span>
                  <div>
                    <div className="text-sm font-bold">{f.title.replace(/^[^\s]+\s/, '')}</div>
                    <p className="text-xs text-gray-400 mt-0.5">{f.description}</p>
                  </div>
                </div>
              ))}
              <button
                onClick={dismissWhatsNew}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-bold text-sm mt-4"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ NOTIFICATION PANEL ═══ */}
      {showNotifications && (
        <div className="fixed inset-0 z-50" onClick={() => setShowNotifications(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute right-4 top-32 w-96 max-h-[70vh] overflow-y-auto rounded-2xl p-4 space-y-2"
            style={{
              background: 'rgba(10, 5, 25, 0.98)',
              border: '1px solid rgba(139, 92, 246, 0.12)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm">Notifications</h3>
              <button
                onClick={() => setShowNotifications(false)}
                className="p-1 rounded-lg hover:bg-white/10"
              >
                <X size={14} className="text-gray-400" />
              </button>
            </div>
            {notifications.map(n => (
              <div key={n.id} className={`p-3 rounded-xl flex items-start gap-2 ${n.read ? 'opacity-50' : ''}`}
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <NotifIcon type={n.type} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold">{n.title}</div>
                  <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: { ...(await serverSideTranslations(locale ?? 'en', ['common'])) },
});
