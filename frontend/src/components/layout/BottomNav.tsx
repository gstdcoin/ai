import React from 'react';
import { useTranslation } from 'next-i18next';
import { Home, ListTodo, Server, MessageSquare } from 'lucide-react';
import { Tab } from '../../types/tabs';

interface BottomNavProps {
  readonly activeTab: Tab;
  readonly onTabChange: (tab: Tab) => void;
}

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const { t } = useTranslation('common');

  const items: Array<{ id: Tab | 'chat'; label: string; icon: React.ReactNode; href?: string }> = [
    { id: 'home',  label: t('tab_home',  'Home'),  icon: <Home          size={22} /> },
    { id: 'tasks', label: t('tab_tasks', 'Tasks'), icon: <ListTodo      size={22} /> },
    { id: 'chat',  label: t('chat',      'Chat'),  icon: <MessageSquare size={22} />, href: '/chat' },
    { id: 'nodes', label: t('tab_nodes', 'Nodes'), icon: <Server        size={22} /> },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
      <div style={{
        background: 'rgba(3, 0, 20, 0.92)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
      }}>
        <div className="grid grid-cols-4 gap-0.5 px-2 py-2">
          {items.map((item) => (
            item.href ? (
              <a
                key={item.id}
                href={item.href}
                className="flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-xl transition-all duration-200 min-h-[48px] text-gray-500 hover:text-gray-300"
                aria-label={item.label}
              >
                {item.icon}
                <span className="text-[10px] font-medium">{item.label}</span>
              </a>
            ) : (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id as Tab)}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-xl transition-all duration-200 min-h-[48px]
                  ${activeTab === item.id
                    ? 'text-white bg-violet-500/10'
                    : 'text-gray-500 hover:text-gray-300'}`}
                aria-label={item.label}
              >
                {item.icon}
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            )
          ))}
        </div>
      </div>
    </nav>
  );
}
