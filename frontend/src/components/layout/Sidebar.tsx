import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { LayoutDashboard, Server, BarChart3, HelpCircle, X, Menu, Users } from 'lucide-react';
import { Tab } from '../../types/tabs';

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onCreateTask: () => void;
}

export default function Sidebar({ activeTab, onTabChange, onCreateTask }: SidebarProps) {
  const { t } = useTranslation('common');
  const [isOpen, setIsOpen] = useState(false);

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'tasks', label: t('tasks') || 'Tasks', icon: <LayoutDashboard size={20} /> },
    { id: 'devices', label: t('devices') || 'Devices', icon: <Server size={20} /> },
    { id: 'stats', label: t('stats') || 'Stats', icon: <BarChart3 size={20} /> },
    { id: 'referrals', label: t('referrals') || 'Referrals', icon: <Users size={20} /> },
    { id: 'help', label: t('help_center') || t('help') || 'Help', icon: <HelpCircle size={20} /> },
  ];

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 glass-button text-white"
        aria-label="Open menu"
      >
        <Menu size={24} />
      </button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-64 glass-dark border-r border-white/10
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <h2 className="text-xl font-bold text-gold-900 font-display">GSTD</h2>
            <button
              onClick={() => setIsOpen(false)}
              className="lg:hidden glass-button text-white"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  onTabChange(tab.id);
                  setIsOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-lg
                  transition-all duration-200 min-h-[44px]
                  ${activeTab === tab.id
                    ? 'bg-gold-900/20 text-gold-900 shadow-gold'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }
                `}
              >
                {tab.icon}
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* Create Task Button */}
          <div className="p-4 border-t border-white/10">
            <button
              onClick={() => {
                onCreateTask();
                setIsOpen(false);
              }}
              className="w-full glass-button-gold flex items-center justify-center gap-2"
            >
              <span className="text-2xl">+</span>
              <span>{t('create_task') || 'Create Task'}</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

