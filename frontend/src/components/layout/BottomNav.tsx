import React from 'react';
import { useTranslation } from 'next-i18next';
import { LayoutDashboard, Server, BarChart3, HelpCircle, Users, Store } from 'lucide-react';
import { Tab } from '../../types/tabs';

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const { t } = useTranslation('common');

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'marketplace', label: '🛒', icon: <Store size={18} /> },
    { id: 'tasks', label: t('tasks') || 'Tasks', icon: <LayoutDashboard size={18} /> },
    { id: 'devices', label: t('devices') || 'Devices', icon: <Server size={18} /> },
    { id: 'stats', label: t('stats') || 'Stats', icon: <BarChart3 size={18} /> },
    { id: 'referrals', label: '👥', icon: <Users size={18} /> },
    { id: 'help', label: '❓', icon: <HelpCircle size={18} /> },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
      <div className="glass-dark border-t border-white/10">
        <div className="grid grid-cols-6 gap-1 px-2 py-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg
                transition-all duration-200 min-h-[44px]
                ${activeTab === tab.id
                  ? 'bg-gold-900/20 text-gold-900'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }
              `}
              aria-label={tab.label}
            >
              {tab.icon}
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

