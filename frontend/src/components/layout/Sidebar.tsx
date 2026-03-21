import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Home, Server, ListTodo, MessageSquare, BarChart3, HelpCircle, X, Menu, Cpu, ArrowRightLeft, Briefcase, Brain } from 'lucide-react';
import { Tab } from '../../types/tabs';

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { t } = useTranslation('common');
  const [isOpen, setIsOpen] = useState(false);

  const mainTabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'home', label: t('tab_home', 'Home'), icon: <Home size={18} /> },
    { id: 'tasks', label: t('tab_tasks', 'Tasks'), icon: <ListTodo size={18} /> },
    { id: 'nodes', label: t('tab_nodes', 'Nodes'), icon: <Server size={18} /> },
  ];

  const externalLinks: Array<{ label: string; icon: React.ReactNode; href: string }> = [
    { label: t('simulations', 'Simulations'), icon: <Briefcase size={18} />, href: '/monitor' },
    { label: t('ai_signals', 'AI Signals'), icon: <Brain size={18} />, href: '/predictions' },
    { label: t('chat', 'Chat'), icon: <MessageSquare size={18} />, href: '/chat' },
    { label: t('bridge', 'Bridge'), icon: <ArrowRightLeft size={18} />, href: '/bridge' },
    { label: t('stats', 'Stats'), icon: <BarChart3 size={18} />, href: '/stats' },
    { label: t('agent_node', 'Agent'), icon: <Cpu size={18} />, href: '/agent' },
    { label: t('help_center', 'Help'), icon: <HelpCircle size={18} />, href: '/about' },
  ];

  return (
    <>
      <button onClick={() => setIsOpen(true)} className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-white/5 text-white" aria-label={t('menu', 'Menu')}>
        <Menu size={22} />
      </button>

      {isOpen && <div className="lg:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={() => setIsOpen(false)} />}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-52 transform transition-transform duration-300 
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
        style={{
          background: 'rgba(8, 8, 26, 0.95)',
          backdropFilter: 'blur(20px)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
            <span style={{
              fontWeight: 800,
              fontSize: 18,
              background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>GSTD</span>
            <button onClick={() => setIsOpen(false)} className="lg:hidden p-1.5 rounded-lg hover:bg-white/5 text-gray-400">
              <X size={18} />
            </button>
          </div>

          {/* Main tabs */}
          <nav className="flex-1 p-3 space-y-1">
            <div className="text-[10px] font-bold text-gray-600 uppercase tracking-wider px-3 mb-2">{t('menu', 'Menu')}</div>
            {mainTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { onTabChange(tab.id); setIsOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-all
                  ${activeTab === tab.id
                    ? 'bg-violet-500/10 text-white font-semibold border border-violet-500/15'
                    : 'text-gray-400 hover:text-white hover:bg-white/[0.04] border border-transparent'}`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}

            <div className="h-px bg-white/[0.04] my-4" />
            <div className="text-[10px] font-bold text-gray-600 uppercase tracking-wider px-3 mb-2">{t('quick_actions', 'Quick Actions')}</div>

            {externalLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] text-gray-500 hover:text-gray-200 hover:bg-white/[0.04] transition-all"
              >
                {link.icon}
                <span>{link.label}</span>
              </a>
            ))}
          </nav>
        </div>
      </aside>
    </>
  );
}
