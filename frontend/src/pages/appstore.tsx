import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useState, useEffect, useMemo } from 'react';
import { API_BASE_URL } from '../lib/config';
import {
  Search, Download, Star, ExternalLink, Cpu, HardDrive, 
  MemoryStick, Zap, ChevronRight, Package, Sparkles,
  Shield, Globe, FolderOpen, Code2, BarChart3, Eye,
  Home as HomeIcon, Wifi, Lock
} from 'lucide-react';
import Head from 'next/head';

interface AppManifest {
  id: string;
  name: string;
  version: string;
  category: string;
  tagline: string;
  description: string;
  developer: string;
  website: string;
  repo?: string;
  icon: string;
  port: number;
  requires_gpu: boolean;
  min_ram_gb: number;
  min_disk_gb: number;
  docker_image: string;
  status: string;
  earnings?: string;
  featured: boolean;
  new: boolean;
  gstd_reward?: number;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  description: string;
}

const CATEGORY_ICONS: Record<string, any> = {
  earning: Zap,
  ai: Sparkles,
  finance: Star,
  files: FolderOpen,
  security: Shield,
  network: Globe,
  developer: Code2,
  monitoring: BarChart3,
  privacy: Eye,
  iot: HomeIcon,
};

export default function AppStorePage() {
  const { t } = useTranslation('common');
  const [apps, setApps] = useState<AppManifest[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApp, setSelectedApp] = useState<AppManifest | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchApps = async () => {
      try {
        const [appsRes, catsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/v1/appstore/apps`),
          fetch(`${API_BASE_URL}/api/v1/appstore/categories`),
        ]);
        if (appsRes.ok) {
          const data = await appsRes.json();
          setApps(data.apps || []);
        }
        if (catsRes.ok) {
          const data = await catsRes.json();
          setCategories(data.categories || []);
        }
      } catch { /* silent */ }
      setLoading(false);
    };
    fetchApps();
  }, []);

  const filteredApps = useMemo(() => {
    return apps.filter(app => {
      if (selectedCategory && app.category !== selectedCategory) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return app.name.toLowerCase().includes(q) || 
               app.tagline.toLowerCase().includes(q) ||
               app.developer.toLowerCase().includes(q);
      }
      return true;
    });
  }, [apps, selectedCategory, searchQuery]);

  const featuredApps = useMemo(() => apps.filter(a => a.featured), [apps]);

  const handleInstall = async (appId: string) => {
    setInstalling(appId);
    try {
      await fetch(`${API_BASE_URL}/api/v1/appstore/apps/${appId}/install`, { method: 'POST' });
    } catch {}
    setTimeout(() => setInstalling(null), 3000);
  };

  return (
    <div className="min-h-screen bg-[#030014] text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Head>
        <title>GSTD App Store — Install Apps on Your Node</title>
        <meta name="description" content="Install 15+ self-hosted apps on your GSTD Node. AI, Bitcoin, Nextcloud, IPFS, VPN and more." />
      </Head>

      {/* ═══ HEADER ═══ */}
      <div className="sticky top-14 z-30 backdrop-blur-2xl bg-[#030014]/80 border-b border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-xl font-black shadow-lg shadow-violet-500/20">
              <Package size={20} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight">App Store</h1>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">{apps.length} Apps Available</p>
            </div>
          </div>

          {/* Search */}
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search apps..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-violet-500/40 focus:bg-white/[0.06] transition-all"
            />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* ═══ FEATURED BANNER ═══ */}
        {!selectedCategory && !searchQuery && featuredApps.length > 0 && (
          <div className="mb-10">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Sparkles size={14} className="text-amber-400" /> Featured
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {featuredApps.map(app => (
                <button
                  key={app.id}
                  onClick={() => setSelectedApp(app)}
                  className="group relative p-5 rounded-2xl text-left transition-all duration-300 hover:scale-[1.02]"
                  style={{
                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(6, 182, 212, 0.05))',
                    border: '1px solid rgba(139, 92, 246, 0.12)',
                  }}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-3xl">{app.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white truncate">{app.name}</div>
                      <div className="text-xs text-gray-500">{app.developer}</div>
                    </div>
                    {app.new && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/20 text-emerald-400 uppercase">New</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-2">{app.tagline}</p>
                  {app.gstd_reward && app.gstd_reward > 0 && (
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-amber-400 font-bold">
                      <Zap size={10} /> Earn {app.earnings}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-8">
          {/* ═══ SIDEBAR CATEGORIES ═══ */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3">Categories</h3>
            <nav className="space-y-1">
              <button
                onClick={() => setSelectedCategory('')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                  !selectedCategory 
                    ? 'bg-white/[0.08] text-white' 
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]'
                }`}
              >
                <Package size={15} /> All Apps
              </button>
              {categories.map(cat => {
                const Icon = CATEGORY_ICONS[cat.id] || Package;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                      selectedCategory === cat.id 
                        ? 'bg-white/[0.08] text-white' 
                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]'
                    }`}
                  >
                    <Icon size={15} /> {cat.name}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* ═══ APP GRID ═══ */}
          <div className="flex-1">
            {/* Mobile categories */}
            <div className="lg:hidden mb-6 flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
              <button
                onClick={() => setSelectedCategory('')}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  !selectedCategory ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'bg-white/[0.04] text-gray-500'
                }`}
              >All</button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                    selectedCategory === cat.id ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'bg-white/[0.04] text-gray-500'
                  }`}
                >{cat.icon} {cat.name}</button>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-violet-500" />
              </div>
            ) : filteredApps.length === 0 ? (
              <div className="text-center py-20 text-gray-500">
                <Package size={48} className="mx-auto mb-4 opacity-20" />
                <p className="text-lg font-bold">No apps found</p>
                <p className="text-sm">Try a different search or category</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredApps.map(app => (
                  <div
                    key={app.id}
                    className="group rounded-2xl p-5 cursor-pointer transition-all duration-300 hover:scale-[1.015]"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                    onClick={() => setSelectedApp(app)}
                  >
                    <div className="flex items-start gap-3.5 mb-3">
                      <div className="w-12 h-12 rounded-2xl bg-white/[0.04] flex items-center justify-center text-2xl flex-shrink-0">
                        {app.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-white truncate">{app.name}</h3>
                          {app.new && (
                            <span className="px-1.5 py-0.5 rounded-md text-[8px] font-black bg-emerald-500/20 text-emerald-400 uppercase">New</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate">{app.tagline}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-[10px] text-gray-600">
                        {app.requires_gpu && (
                          <span className="flex items-center gap-1"><Cpu size={10} /> GPU</span>
                        )}
                        {app.min_ram_gb > 0 && (
                          <span className="flex items-center gap-1"><MemoryStick size={10} /> {app.min_ram_gb}GB</span>
                        )}
                        {app.min_disk_gb > 0 && (
                          <span className="flex items-center gap-1"><HardDrive size={10} /> {app.min_disk_gb}GB</span>
                        )}
                      </div>

                      <button
                        onClick={(e) => { e.stopPropagation(); handleInstall(app.id); }}
                        disabled={installing === app.id}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          installing === app.id
                            ? 'bg-violet-500/20 text-violet-300'
                            : 'bg-white/[0.06] text-white hover:bg-violet-500/20 hover:text-violet-300'
                        }`}
                      >
                        {installing === app.id ? (
                          <span className="flex items-center gap-1">
                            <div className="animate-spin rounded-full h-3 w-3 border-t border-violet-400" />
                            Installing
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Download size={12} /> Install
                          </span>
                        )}
                      </button>
                    </div>

                    {app.earnings && (
                      <div className="mt-2.5 pt-2.5 border-t border-white/[0.04] flex items-center gap-1 text-[10px] text-amber-400 font-bold">
                        <Zap size={10} /> Earn {app.earnings}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ APP DETAIL MODAL ═══ */}
      {selectedApp && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedApp(null)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" />
          <div 
            className="relative w-full max-w-lg rounded-3xl overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, rgba(20, 10, 40, 0.98), rgba(5, 2, 15, 0.99))',
              border: '1px solid rgba(139, 92, 246, 0.15)',
              boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 80px rgba(139, 92, 246, 0.08)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header gradient */}
            <div className="h-24 relative" style={{
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.1))',
            }}>
              <div className="absolute -bottom-8 left-6">
                <div className="w-16 h-16 rounded-2xl bg-[#0a0520] border-2 border-white/10 flex items-center justify-center text-4xl shadow-xl">
                  {selectedApp.icon}
                </div>
              </div>
            </div>

            <div className="pt-12 px-6 pb-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-black text-white">{selectedApp.name}</h2>
                  <p className="text-sm text-gray-500">{selectedApp.developer} · v{selectedApp.version}</p>
                </div>
                <button
                  onClick={() => handleInstall(selectedApp.id)}
                  disabled={installing === selectedApp.id}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-bold text-sm shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 hover:scale-105 active:scale-95 transition-all"
                >
                  {installing === selectedApp.id ? 'Installing...' : 'Install'}
                </button>
              </div>

              <p className="text-sm text-gray-300 leading-relaxed mb-6">{selectedApp.description}</p>

              {/* Requirements */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                {selectedApp.requires_gpu && (
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] text-center">
                    <Cpu size={16} className="mx-auto mb-1 text-amber-400" />
                    <div className="text-[10px] text-gray-500 font-bold uppercase">GPU Required</div>
                  </div>
                )}
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] text-center">
                  <MemoryStick size={16} className="mx-auto mb-1 text-cyan-400" />
                  <div className="text-xs font-bold text-white">{selectedApp.min_ram_gb} GB</div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase">RAM</div>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] text-center">
                  <HardDrive size={16} className="mx-auto mb-1 text-violet-400" />
                  <div className="text-xs font-bold text-white">{selectedApp.min_disk_gb} GB</div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase">Storage</div>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] text-center">
                  <Wifi size={16} className="mx-auto mb-1 text-emerald-400" />
                  <div className="text-xs font-bold text-white">:{selectedApp.port}</div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase">Port</div>
                </div>
              </div>

              {selectedApp.earnings && (
                <div className="p-4 rounded-xl mb-4" style={{
                  background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(16, 185, 129, 0.05))',
                  border: '1px solid rgba(245, 158, 11, 0.15)',
                }}>
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                    <Zap size={16} /> Estimated Earnings: {selectedApp.earnings}
                  </div>
                </div>
              )}

              {/* Links */}
              <div className="flex gap-3">
                {selectedApp.website && (
                  <a href={selectedApp.website} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition-colors">
                    <ExternalLink size={12} /> Website
                  </a>
                )}
                {selectedApp.repo && (
                  <a href={selectedApp.repo} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition-colors">
                    <Code2 size={12} /> Source Code
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: { ...(await serverSideTranslations(locale ?? 'en', ['common'])) },
});
