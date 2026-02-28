import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { LayoutDashboard, Server, BarChart3, HelpCircle, X, Menu, Bot, MessageSquare, Hammer, Cpu, ShoppingCart, Users } from 'lucide-react';
import { Tab } from '../../types/tabs';

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const tabs: Array<{ id: Tab | 'agent'; label: string; icon: React.ReactNode; highlight?: boolean; href?: string }> = [
    { id: 'chat', label: t('chat') || 'Chat', icon: <MessageSquare size={20} />, highlight: true },
    { id: 'home', label: t('nav_mining') || 'Earn', icon: <Hammer size={20} /> },
    { id: 'devices', label: t('devices') || 'Swarm', icon: <Server size={20} /> },
    { id: 'tasks', label: t('tasks') || 'Tasks', icon: <LayoutDashboard size={20} /> },
    { id: 'agent', label: t('agent_node') || 'Agent', icon: <Cpu size={20} />, href: '/agent' },
    { id: 'marketplace', label: t('marketplace') || 'Market', icon: <ShoppingCart size={20} /> },
    { id: 'agents', label: t('agents') || 'Agents', icon: <Bot size={20} /> },
    { id: 'referrals', label: t('referrals') || 'Referrals', icon: <Users size={20} /> },
    { id: 'stats', label: t('stats') || 'Stats', icon: <BarChart3 size={20} /> },
    { id: 'help', label: t('help_center') || 'Help', icon: <HelpCircle size={20} /> },
  ];

  return (
    <>
      <button onClick={() => setIsOpen(true)} className="lg:hidden fixed top-4 left-4 z-50 glass-button text-white" aria-label="Open menu">
        <Menu size={24} />
      </button>

      {isOpen && <div className="lg:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={() => setIsOpen(false)} />}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-56 glass-dark border-r border-white/10 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">GSTD</h2>
            <button onClick={() => setIsOpen(false)} className="lg:hidden glass-button text-white" aria-label="Close"><X size={20} /></button>
          </div>

          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto scrollbar-hide">
            {tabs.map((tab) => (
              tab.href ? (
                <a
                  key={tab.id}
                  href={tab.href}
                  onClick={() => setIsOpen(false)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 min-h-[40px] text-sm text-gray-400 hover:text-gray-200 hover:bg-white/5"
                >
                  {tab.icon}
                  <span className="font-medium truncate">{tab.label}</span>
                  {tab.highlight && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />}
                </a>
              ) : (
                <button
                  key={tab.id}
                  onClick={() => { onTabChange(tab.id as Tab); setIsOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 min-h-[40px] text-sm
                    ${activeTab === tab.id
                      ? tab.highlight
                        ? 'bg-violet-600/20 text-violet-400'
                        : 'bg-white/10 text-white'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
                >
                  {tab.icon}
                  <span className="font-medium truncate">{tab.label}</span>
                  {tab.highlight && activeTab !== tab.id && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />}
                </button>
              )
            ))}
          </nav>

        </div>
      </aside>
    </>
  );
}
