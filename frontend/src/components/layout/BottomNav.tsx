import React from 'react';
import { useTranslation } from 'next-i18next';
import { Server, BarChart3, Bot, MessageSquare, Hammer, ListTodo, MoreHorizontal } from 'lucide-react';
import { Tab } from '../../types/tabs';

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const { t } = useTranslation('common');

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; highlight?: boolean }> = [
    { id: 'chat', label: t('chat') || 'Chat', icon: <MessageSquare size={20} />, highlight: true },
    { id: 'home', label: t('nav_mining') || 'Mining', icon: <Hammer size={20} /> },
    { id: 'tasks', label: t('tasks') || 'Tasks', icon: <ListTodo size={20} /> },
    { id: 'devices', label: t('devices') || 'Nodes', icon: <Server size={20} /> },
    { id: 'more', label: t('help') || 'More', icon: <MoreHorizontal size={20} /> },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
      <div className="glass-dark border-t border-white/10">
        <div className="grid grid-cols-5 gap-0.5 sm:gap-1 px-1 sm:px-2 py-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-lg transition-all duration-200 min-h-[44px]
                ${activeTab === tab.id
                  ? tab.highlight ? 'bg-violet-600/20 text-violet-400' : 'bg-white/10 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
              aria-label={tab.label}
            >
              {tab.icon}
              <span className="text-[10px] font-medium truncate">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
