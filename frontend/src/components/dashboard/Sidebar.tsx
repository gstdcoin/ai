import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { Tab } from '../../types/tabs';

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { t } = useTranslation('common');
  const router = useRouter();

  const menuItems = [
    { id: 'tasks' as Tab, label: t('tasks'), icon: '📋' },
    { id: 'devices' as Tab, label: t('devices'), icon: '📱' },
    { id: 'stats' as Tab, label: t('stats'), icon: '📊' },
    { id: 'help' as Tab, label: t('help_center'), icon: '❓' },
  ];

  const changeLanguage = () => {
    const newLocale = router.locale === 'ru' ? 'en' : 'ru';
    router.push(router.pathname, router.asPath, { locale: newLocale });
  };

  return (
    <aside className="w-full lg:w-64 bg-white shadow-sm border-b lg:border-b-0 lg:border-r border-gray-200 flex flex-row lg:flex-col overflow-x-auto lg:overflow-x-visible">
      <div className="p-4 lg:p-6 border-b lg:border-b border-r lg:border-r-0 border-gray-200 flex-shrink-0">
        <h2 className="text-lg lg:text-xl font-bold text-gray-900 whitespace-nowrap">{t('title')}</h2>
      </div>

      <nav className="flex-1 flex lg:block p-2 lg:p-4 overflow-x-auto lg:overflow-x-visible">
        <ul className="flex lg:flex-col lg:space-y-2 space-x-2 lg:space-x-0">
          {menuItems.map((item) => (
            <li key={item.id} className="flex-shrink-0">
              <button
                onClick={() => onTabChange(item.id)}
                className={`flex items-center gap-2 lg:gap-3 px-3 lg:px-4 py-2 lg:py-3 rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === item.id
                    ? 'bg-primary-50 text-primary-700 font-semibold'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="text-lg lg:text-xl">{item.icon}</span>
                <span className="text-sm lg:text-base">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-2 lg:p-4 border-t border-gray-200 flex-shrink-0">
        <button
          onClick={changeLanguage}
          className="w-full flex items-center justify-center gap-2 px-3 lg:px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors text-sm lg:text-base"
        >
          <span>🌐</span>
          <span className="whitespace-nowrap">{router.locale === 'ru' ? 'English' : 'Русский'}</span>
        </button>
      </div>
    </aside>
  );
}



